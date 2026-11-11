import { Router } from 'express'
import { hashPassword, verifyPassword } from '../lib/password.js'
import { z } from 'zod'
import { db, tx } from '../db.js'
import { h, parse, HttpError } from '../lib/http.js'
import { normalizeWhatsapp } from '../lib/phone.js'
import { audit } from '../lib/audit.js'
import { formatStudentNumber } from '../lib/time.js'
import { requireAuth, signToken } from '../auth.js'

const router = Router()
// Hash de relleno: el login tarda lo mismo exista o no la cuenta.
const DUMMY_HASH = await hashPassword('no-existe-esta-cuenta')

const password = z.string({ required_error: 'Escribe una contraseña' })
  .min(8, 'La contraseña debe tener al menos 8 caracteres').max(128, 'La contraseña es demasiado larga')
const email = z.string({ required_error: 'Escribe tu correo' }).trim().toLowerCase().email('Correo inválido').max(254)

const publicUser = (u) => ({ id: u.id, email: u.email, role: u.role, fullName: u.fullName })

async function sessionPayload(user) {
  const client = await db.one(
    `select id, student_number, full_name, whatsapp, email, birth_date, status, intake_status,
            emergency_name, emergency_phone
       from clients where user_id = $1`, [user.id])
  return {
    user: publicUser(user),
    client: client ? { ...client, studentCode: formatStudentNumber(client.studentNumber) } : null,
  }
}

router.post('/register', h(async (req, res) => {
  const body = parse(z.object({
    fullName: z.string({ required_error: 'Escribe tu nombre' }).trim().min(2, 'Escribe tu nombre completo').max(120),
    email,
    password,
    whatsapp: z.string({ required_error: 'Escribe tu WhatsApp' }).trim().min(1, 'Escribe tu WhatsApp'),
    acceptPrivacy: z.literal(true, { errorMap: () => ({ message: 'Debes aceptar el aviso de privacidad' }) }),
  }), req.body)

  const whatsapp = normalizeWhatsapp(body.whatsapp)
  if (!whatsapp) throw new HttpError(400, 'Revisa tu número de WhatsApp (incluye el código de país si no es de Costa Rica)', 'VALIDATION', { field: 'whatsapp' })

  const hash = await hashPassword(body.password)
  const user = await tx(async (t) => {
    const exists = await t.one('select 1 as x from users where email = $1', [body.email])
    if (exists) throw new HttpError(409, 'Ya existe una cuenta con este correo', 'EMAIL_TAKEN', { field: 'email' })
    const created = await t.one(
      `insert into users (email, password_hash, role, full_name) values ($1,$2,'client',$3)
       returning id, email, role, full_name, token_version`, [body.email, hash, body.fullName])
    const client = await t.one(
      `insert into clients (user_id, full_name, whatsapp, email, source, status)
       values ($1,$2,$3,$4,'app','interested') returning id`,
      [created.id, body.fullName, whatsapp, body.email])
    await audit(t, created.id, 'auth.register', 'client', client.id)
    return created
  }).catch((err) => {
    if (err.code === '23505') throw new HttpError(409, 'Ya existe una cuenta con este correo', 'EMAIL_TAKEN', { field: 'email' })
    throw err
  })

  res.status(201).json({ token: signToken(user), ...(await sessionPayload(user)) })
}))

router.post('/login', h(async (req, res) => {
  const body = parse(z.object({ email, password: z.string().min(1, 'Escribe tu contraseña').max(128) }), req.body)
  const user = await db.one(
    `select id, email, role, full_name, token_version, is_active, password_hash from users where email = $1`,
    [body.email])
  const { ok, legacy } = await verifyPassword(body.password, user?.passwordHash || DUMMY_HASH)
  if (!user || !ok || !user.isActive) throw new HttpError(401, 'Correo o contraseña incorrectos', 'BAD_CREDENTIALS')
  // Una cuenta con el formato anterior se actualiza sola al iniciar sesión.
  if (legacy) await db.run('update users set password_hash = $2 where id = $1', [user.id, await hashPassword(body.password)])
  await db.run('update users set last_login_at = now() where id = $1', [user.id])
  res.json({ token: signToken(user), ...(await sessionPayload(user)) })
}))

router.get('/me', requireAuth, h(async (req, res) => {
  res.json(await sessionPayload(req.user))
}))

router.patch('/me', requireAuth, h(async (req, res) => {
  const body = parse(z.object({
    fullName: z.string().trim().min(2, 'Escribe tu nombre completo').max(120).optional(),
    whatsapp: z.string().trim().optional(),
    birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida').nullable().optional(),
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
  const fresh = await db.one('select id, email, role, full_name from users where id = $1', [req.user.id])
  res.json(await sessionPayload(fresh))
}))

router.post('/change-password', requireAuth, h(async (req, res) => {
  const body = parse(z.object({ currentPassword: z.string().min(1, 'Escribe tu contraseña actual'), newPassword: password }), req.body)
  const row = await db.one('select password_hash from users where id = $1', [req.user.id])
  if (!(await verifyPassword(body.currentPassword, row.passwordHash)).ok) {
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
  const body = parse(z.object({ password: z.string().min(1, 'Escribe tu contraseña para confirmar') }), req.body)
  if (req.user.role === 'admin') throw new HttpError(409, 'La cuenta de administración no se elimina desde la app', 'NOT_ALLOWED')
  const row = await db.one('select password_hash from users where id = $1', [req.user.id])
  if (!(await verifyPassword(body.password, row.passwordHash)).ok) {
    throw new HttpError(401, 'La contraseña no es correcta', 'BAD_CREDENTIALS', { field: 'password' })
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
              email = 'eliminada+' || id || '@invalid.local', password_hash = '', full_name = '', updated_at = now()
        where id = $1`, [req.user.id])
    await audit(t, req.user.id, 'auth.delete_account', 'user', req.user.id)
  })
  res.json({ ok: true })
}))

export default router
