import { Router } from 'express'
import { hashPassword, verifyPassword } from '../lib/password.js'
import { z } from 'zod'
import { db, tx } from '../db.js'
import { h, parse, HttpError, validBirthDate } from '../lib/http.js'
import { normalizeWhatsapp } from '../lib/phone.js'
import { audit } from '../lib/audit.js'
import { formatStudentNumber } from '../lib/time.js'
import { requireAuth, signToken } from '../auth.js'
import { config } from '../config.js'
import {
  CODE_TTL_MIN, completeSignup, sendVerificationCode, verificationRequired, verifyEmailCode,
} from '../services/verification.js'
import { verifyGoogleCredential } from '../services/google.js'
import { appleEnabled, appleRefreshToken, revokeAppleToken, verifyAppleCredential } from '../services/apple.js'

const router = Router()
// Hash de relleno: el login tarda lo mismo exista o no la cuenta.
const DUMMY_HASH = await hashPassword('no-existe-esta-cuenta')

const password = z.string({ required_error: 'Escribe una contraseña' })
  .min(8, 'La contraseña debe tener al menos 8 caracteres').max(128, 'La contraseña es demasiado larga')
const email = z.string({ required_error: 'Escribe tu correo' }).trim().toLowerCase().email('Correo inválido').max(254)
const acceptPrivacy = z.literal(true, { errorMap: () => ({ message: 'Debes aceptar el aviso de privacidad' }) })

const USER_COLS = 'id, email, role, full_name, token_version, is_active, email_verified_at, password_hash, google_sub, apple_sub'
const loadUser = (id) => db.one(`select ${USER_COLS} from users where id = $1`, [id])

const publicUser = (u) => ({
  id: u.id,
  email: u.email,
  role: u.role,
  fullName: u.fullName,
  // Sin correo saliente configurado no se exige confirmar.
  emailVerified: u.role !== 'client' || Boolean(u.emailVerifiedAt) || !verificationRequired(),
  hasPassword: Boolean(u.passwordHash),
  google: Boolean(u.googleSub),
  apple: Boolean(u.appleSub),
})

const clientOf = (userId) => db.one(
  `select id, student_number, full_name, whatsapp, email, birth_date, status, intake_status,
          emergency_name, emergency_phone
     from clients where user_id = $1`, [userId])

async function sessionPayload(userId) {
  let user = await loadUser(userId)
  let client = await clientOf(userId)
  // Cuenta que quedó a medias mientras se exigía confirmar: si ya no se exige, se completa aquí.
  if (!client && user.role === 'client' && user.isActive && !verificationRequired()) {
    await tx((t) => completeSignup(t, userId))
    user = await loadUser(userId)
    client = await clientOf(userId)
  }
  return {
    user: publicUser(user),
    client: client ? { ...client, studentCode: formatStudentNumber(client.studentNumber) } : null,
  }
}

const parseWhatsapp = (raw) => {
  const whatsapp = normalizeWhatsapp(raw)
  if (!whatsapp) throw new HttpError(400, 'Revisa tu número de WhatsApp (incluye el código de país si no es de Costa Rica)', 'VALIDATION', { field: 'whatsapp' })
  return whatsapp
}
const emailTaken = () => new HttpError(409, 'Ya existe una cuenta con este correo', 'EMAIL_TAKEN', { field: 'email' })

// Lo que la pantalla de acceso necesita saber antes de iniciar sesión.
router.get('/config', (_req, res) => {
  res.json({ googleClientId: config.googleClientId || null, appleSignIn: appleEnabled(), emailVerification: verificationRequired() })
})

router.post('/register', h(async (req, res) => {
  const body = parse(z.object({
    fullName: z.string({ required_error: 'Escribe tu nombre' }).trim().min(2, 'Escribe tu nombre completo').max(120),
    email,
    password,
    whatsapp: z.string({ required_error: 'Escribe tu WhatsApp' }).trim().min(1, 'Escribe tu WhatsApp'),
    acceptPrivacy,
  }), req.body)

  const whatsapp = parseWhatsapp(body.whatsapp)
  const required = verificationRequired()
  const hash = await hashPassword(body.password)
  const user = await tx(async (t) => {
    const existing = await t.one(
      `select u.id, u.role, u.is_active, u.email_verified_at, u.google_sub, u.apple_sub,
              exists (select 1 from clients c where c.user_id = u.id) as has_client
         from users u where u.email = $1 for update`, [body.email])
    let created
    if (existing) {
      // Un registro que nunca confirmó su correo no bloquea a quien sí es dueña de ese correo.
      const pending = required && existing.role === 'client' && existing.isActive
        && !existing.emailVerifiedAt && !existing.googleSub && !existing.appleSub && !existing.hasClient
      if (!pending) throw emailTaken()
      created = await t.one(
        `update users set password_hash = $2, full_name = $3, signup_whatsapp = $4,
                token_version = token_version + 1, updated_at = now()
          where id = $1 returning id, email, full_name, token_version`,
        [existing.id, hash, body.fullName, whatsapp])
    } else {
      created = await t.one(
        `insert into users (email, password_hash, role, full_name, signup_whatsapp)
         values ($1,$2,'client',$3,$4) returning id, email, full_name, token_version`,
        [body.email, hash, body.fullName, whatsapp])
    }
    // Si se exige confirmar el correo, la ficha (y su número PR) se crea al confirmar.
    if (!required) await completeSignup(t, created.id)
    return created
  }).catch((err) => {
    if (err.code === '23505') throw emailTaken()
    throw err
  })

  if (required) {
    // Si el envío falla, la cuenta existe igual: la pantalla de confirmación permite pedir otro código.
    await sendVerificationCode(user).catch(() => {})
  }
  res.status(201).json({ token: signToken(user), ...(await sessionPayload(user.id)) })
}))

router.post('/login', h(async (req, res) => {
  const body = parse(z.object({ email, password: z.string().min(1, 'Escribe tu contraseña').max(128) }), req.body)
  const user = await db.one(`select ${USER_COLS} from users where email = $1`, [body.email])
  const { ok, legacy } = await verifyPassword(body.password, user?.passwordHash || DUMMY_HASH)
  if (!user || !ok || !user.isActive) throw new HttpError(401, 'Correo o contraseña incorrectos', 'BAD_CREDENTIALS')
  // Una cuenta con el formato anterior se actualiza sola al iniciar sesión.
  if (legacy) await db.run('update users set password_hash = $2 where id = $1', [user.id, await hashPassword(body.password)])
  await db.run('update users set last_login_at = now() where id = $1', [user.id])
  res.json({ token: signToken(user), ...(await sessionPayload(user.id)) })
}))

// Acceso con Google o Apple. La primera vez pide WhatsApp y aceptar el aviso de privacidad.
const PROVIDERS = {
  google: { column: 'google_sub', label: 'Google' },
  apple: { column: 'apple_sub', label: 'Apple' },
}
const detailsRequired = (identity) => new HttpError(409, 'Completa tus datos para crear tu cuenta', 'SIGNUP_DETAILS_REQUIRED',
  { email: identity.email, fullName: identity.name })

/**
 * identity: { sub, email, name } ya validados con el proveedor. extra: columnas que se guardan junto al vínculo.
 * Busca la cuenta por el vínculo con el proveedor; si no hay, por el correo (y la vincula); si tampoco, la crea.
 */
async function socialSignIn(provider, identity, body, extra = {}) {
  const { column, label } = PROVIDERS[provider]
  const inactive = () => new HttpError(401, 'Esta cuenta no está disponible', 'BAD_CREDENTIALS')
  const extraCols = Object.keys(extra)
  const extraVals = Object.values(extra)
  const setExtra = (offset) => extraCols.map((c, i) => `, ${c} = coalesce($${offset + i}, ${c})`).join('')

  let user = await db.one(`select ${USER_COLS} from users where ${column} = $1`, [identity.sub])
  if (user && !user.isActive) throw inactive()
  if (user) {
    if (extraCols.length) await db.run(`update users set updated_at = now()${setExtra(2)} where id = $1`, [user.id, ...extraVals])
  } else {
    // Apple entrega el correo solo mientras el app está autorizado; sin correo no se puede crear ni vincular.
    if (!identity.email) {
      throw new HttpError(400, `No recibimos tu correo de ${label}. En Ajustes del iPhone › tu nombre › Iniciar sesión con Apple, quita Pilates by Riven y vuelve a intentarlo`, 'EMAIL_REQUIRED')
    }
    const byEmail = await db.one(`select ${USER_COLS} from users where email = $1`, [identity.email])
    if (byEmail && !byEmail.isActive) throw inactive()
    if (byEmail) {
      // El proveedor confirma que el correo es suyo: se vincula a la cuenta existente.
      // Si esa cuenta nunca confirmó el correo, su contraseña pudo ponerla otra persona: se anula.
      const untrusted = byEmail.role === 'client' && !byEmail.emailVerifiedAt
      if (untrusted && !body.acceptPrivacy) throw detailsRequired(identity)
      const whatsapp = untrusted ? parseWhatsapp(body.whatsapp || '') : null
      user = await tx(async (t) => {
        const linked = await t.one(
          `update users set ${column} = $2,
                  password_hash = case when $3 then '' else password_hash end,
                  signup_whatsapp = case when $3 then $4 else signup_whatsapp end,
                  full_name = case when $3 and $5 <> '' then $5 else full_name end,
                  token_version = token_version + case when $3 then 1 else 0 end,
                  updated_at = now()${setExtra(6)}
            where id = $1 returning ${USER_COLS}`,
          [byEmail.id, identity.sub, untrusted, whatsapp, identity.name, ...extraVals])
        if (untrusted) await completeSignup(t, linked.id)
        await audit(t, linked.id, `auth.${provider}_link`, 'user', linked.id)
        return linked
      })
    } else {
      if (body.acceptPrivacy !== true || !body.whatsapp) throw detailsRequired(identity)
      const whatsapp = parseWhatsapp(body.whatsapp)
      const fullName = (identity.name || identity.email.split('@')[0]).trim()
      user = await tx(async (t) => {
        const created = await t.one(
          `insert into users (email, password_hash, role, full_name, ${column}, signup_whatsapp, email_verified_at${extraCols.map((c) => `, ${c}`).join('')})
           values ($1, '', 'client', $2, $3, $4, now()${extraCols.map((_, i) => `, $${5 + i}`).join('')}) returning ${USER_COLS}`,
          [identity.email, fullName, identity.sub, whatsapp, ...extraVals])
        await completeSignup(t, created.id)
        return created
      }).catch((err) => {
        if (err.code === '23505') throw emailTaken()
        throw err
      })
    }
  }
  await db.run('update users set last_login_at = now() where id = $1', [user.id])
  return user
}

const signupDetails = {
  whatsapp: z.string().trim().max(40).optional(),
  acceptPrivacy: z.boolean().optional(),
}

router.post('/google', h(async (req, res) => {
  const body = parse(z.object({
    credential: z.string({ required_error: 'Falta la credencial de Google' }).min(20).max(4096),
    ...signupDetails,
  }), req.body)
  const google = await verifyGoogleCredential(body.credential)
  const user = await socialSignIn('google', google, body)
  res.json({ token: signToken(user), ...(await sessionPayload(user.id)) })
}))

// Iniciar sesión con Apple (app de iPhone). Apple manda el nombre solo la primera vez, fuera del token.
router.post('/apple', h(async (req, res) => {
  const body = parse(z.object({
    identityToken: z.string({ required_error: 'Falta la credencial de Apple' }).min(20).max(4096),
    authorizationCode: z.string().max(1024).optional(),
    fullName: z.string().trim().max(120).optional(),
    ...signupDetails,
  }), req.body)
  const apple = await verifyAppleCredential(body.identityToken)
  const refresh = await appleRefreshToken(body.authorizationCode, apple.clientId)
  const user = await socialSignIn('apple', { ...apple, name: body.fullName || '' }, body,
    refresh ? { apple_refresh_token: refresh } : {})
  res.json({ token: signToken(user), ...(await sessionPayload(user.id)) })
}))

router.post('/verify-email', requireAuth, h(async (req, res) => {
  const body = parse(z.object({
    code: z.string({ required_error: 'Escribe el código' }).trim().regex(/^\d{6}$/, 'El código tiene 6 dígitos'),
  }), req.body)
  if (!req.user.emailVerifiedAt) await verifyEmailCode(req.user.id, body.code)
  res.json(await sessionPayload(req.user.id))
}))

router.post('/resend-code', requireAuth, h(async (req, res) => {
  if (req.user.emailVerifiedAt) throw new HttpError(409, 'Tu correo ya está confirmado', 'ALREADY_VERIFIED')
  if (!verificationRequired()) throw new HttpError(409, 'No hace falta confirmar tu correo', 'ALREADY_VERIFIED')
  await sendVerificationCode(req.user)
  res.json({ ok: true, minutes: CODE_TTL_MIN })
}))

router.get('/me', requireAuth, h(async (req, res) => {
  res.json(await sessionPayload(req.user.id))
}))

router.patch('/me', requireAuth, h(async (req, res) => {
  const body = parse(z.object({
    fullName: z.string().trim().min(2, 'Escribe tu nombre completo').max(120).optional(),
    whatsapp: z.string().trim().optional(),
    birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida').nullable().optional().refine(validBirthDate, 'Revisa la fecha de nacimiento'),
    emergencyName: z.string().trim().max(120).optional(),
    emergencyPhone: z.string().trim().max(40).optional(),
  }), req.body)

  let whatsapp
  if (body.whatsapp !== undefined) {
    whatsapp = normalizeWhatsapp(body.whatsapp)
    if (!whatsapp) throw new HttpError(400, 'Revisa tu número de WhatsApp', 'VALIDATION', { field: 'whatsapp' })
  }
  await tx(async (t) => {
    if (body.fullName) await t.run('update users set full_name = $2, updated_at = now() where id = $1', [req.user.id, body.fullName])
    await t.run(
      `update clients set
         full_name = coalesce($2, full_name),
         whatsapp = coalesce($3, whatsapp),
         birth_date = case when $4::boolean then $5::date else birth_date end,
         emergency_name = coalesce($6, emergency_name),
         emergency_phone = coalesce($7, emergency_phone),
         updated_at = now()
       where user_id = $1`,
      [req.user.id, body.fullName ?? null, whatsapp ?? null, body.birthDate !== undefined, body.birthDate ?? null,
        body.emergencyName ?? null, body.emergencyPhone ?? null])
    await audit(t, req.user.id, 'profile.update', 'user', req.user.id, { fields: Object.keys(body) })
  })
  res.json(await sessionPayload(req.user.id))
}))

router.post('/change-password', requireAuth, h(async (req, res) => {
  const body = parse(z.object({ currentPassword: z.string().max(128).optional(), newPassword: password }), req.body)
  const row = await db.one('select password_hash from users where id = $1', [req.user.id])
  // Una cuenta creada con Google aún no tiene contraseña: puede definir una sin escribir la anterior.
  if (row.passwordHash && !body.currentPassword) {
    throw new HttpError(400, 'Escribe tu contraseña actual', 'VALIDATION', { field: 'currentPassword' })
  }
  if (row.passwordHash && !(await verifyPassword(body.currentPassword, row.passwordHash)).ok) {
    throw new HttpError(401, 'La contraseña actual no es correcta', 'BAD_CREDENTIALS', { field: 'currentPassword' })
  }
  const hash = await hashPassword(body.newPassword)
  // token_version + 1 cierra todas las demás sesiones abiertas.
  const user = await db.one(
    `update users set password_hash = $2, token_version = token_version + 1, updated_at = now()
      where id = $1 returning id, email, role, full_name, token_version`, [req.user.id, hash])
  await audit(db, req.user.id, 'auth.change_password', 'user', req.user.id)
  res.json({ token: signToken(user) })
}))

// Eliminación de cuenta desde la app (requisito de App Store para apps con registro).
router.delete('/me', requireAuth, h(async (req, res) => {
  const body = parse(z.object({ password: z.string().max(128).optional(), confirm: z.string().max(20).optional() }), req.body)
  if (req.user.role === 'admin') throw new HttpError(409, 'La cuenta de administración no se elimina desde la app', 'NOT_ALLOWED')
  const row = await db.one('select password_hash, apple_refresh_token from users where id = $1', [req.user.id])
  if (row.passwordHash) {
    if (!body.password) throw new HttpError(400, 'Escribe tu contraseña para confirmar', 'VALIDATION', { field: 'password' })
    if (!(await verifyPassword(body.password, row.passwordHash)).ok) {
      throw new HttpError(401, 'La contraseña no es correcta', 'BAD_CREDENTIALS', { field: 'password' })
    }
  } else if ((body.confirm || '').trim().toUpperCase() !== 'ELIMINAR') {
    // Cuenta de Google o Apple sin contraseña: se confirma escribiendo la palabra.
    throw new HttpError(400, 'Escribe ELIMINAR para confirmar', 'VALIDATION', { field: 'confirm' })
  }
  await tx(async (t) => {
    const client = await t.one('select id from clients where user_id = $1', [req.user.id])
    if (client) {
      await t.run(
        `update bookings b set status = 'cancelled', cancelled_at = now(), updated_at = now(), reason = 'Cuenta eliminada'
           from class_sessions s
          where s.id = b.session_id and b.client_id = $1
            and b.status in ('pending','confirmed','waitlisted') and s.starts_at > now()`, [client.id])
      // Se conserva la ficha archivada (historial y contabilidad), ya sin acceso ni vínculo a la cuenta.
      await t.run('update clients set user_id = null, archived_at = now(), updated_at = now() where id = $1', [client.id])
    }
    await t.run(
      `update users set is_active = false, token_version = token_version + 1,
              email = 'eliminada+' || id || '@invalid.local', password_hash = '', full_name = '',
              google_sub = null, apple_sub = null, apple_refresh_token = null, signup_whatsapp = null, updated_at = now()
        where id = $1`, [req.user.id])
    await audit(t, req.user.id, 'auth.delete_account', 'user', req.user.id)
  })
  await revokeAppleToken(row.appleRefreshToken)
  res.json({ ok: true })
}))

export default router
