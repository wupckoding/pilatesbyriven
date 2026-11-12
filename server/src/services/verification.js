import { createHash, randomInt, timingSafeEqual } from 'crypto'
import { db, tx } from '../db.js'
import { HttpError } from '../lib/http.js'
import { audit } from '../lib/audit.js'
import { mailEnabled, sendMail, verificationMail } from '../lib/mail.js'

export const CODE_TTL_MIN = 15
const MAX_ATTEMPTS = 5      // intentos por código
const RESEND_WAIT_S = 60    // espera entre envíos
const MAX_CODES_PER_DAY = 6 // envíos por cuenta cada 24 h

/** Solo se exige verificar el correo si el servidor puede enviar correos. */
export const verificationRequired = () => mailEnabled()

const hashCode = (userId, code) => createHash('sha256').update(`${userId}:${code}`).digest()

/** Genera y envía un código nuevo; invalida los anteriores. */
export async function sendVerificationCode(user) {
  const recent = await db.one(
    `select count(*) as sent, extract(epoch from now() - max(created_at)) as since
       from email_codes where user_id = $1 and created_at > now() - interval '24 hours'`, [user.id])
  if (recent.sent > 0 && Number(recent.since) < RESEND_WAIT_S) {
    const wait = Math.ceil(RESEND_WAIT_S - Number(recent.since))
    throw new HttpError(429, `Espera ${wait} segundos para pedir otro código`, 'CODE_WAIT', { retryAfter: wait })
  }
  if (recent.sent >= MAX_CODES_PER_DAY) {
    throw new HttpError(429, 'Ya enviamos varios códigos hoy. Inténtalo mañana o escríbenos por WhatsApp', 'CODE_LIMIT')
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
  const row = await tx(async (t) => {
    await t.run('update email_codes set consumed_at = now() where user_id = $1 and consumed_at is null', [user.id])
    return t.one(
      `insert into email_codes (user_id, code_hash, expires_at)
       values ($1, $2, now() + make_interval(mins => $3)) returning id`,
      [user.id, hashCode(user.id, code).toString('hex'), CODE_TTL_MIN])
  })
  try {
    await sendMail(verificationMail({ to: user.email, name: user.fullName, code, minutes: CODE_TTL_MIN }))
  } catch (err) {
    console.error('sendVerificationCode', err.message)
    // Sin correo no hay código: no debe contar para la espera ni para el límite diario.
    await db.run('delete from email_codes where id = $1', [row.id])
    throw new HttpError(502, 'No pudimos enviar el correo. Inténtalo de nuevo en un momento', 'MAIL_FAILED')
  }
}

/** Crea la ficha de clienta de una cuenta recién confirmada (si aún no existe). */
export async function completeSignup(t, userId) {
  const user = await t.one(
    `update users set email_verified_at = coalesce(email_verified_at, now()), updated_at = now()
      where id = $1 returning id, email, full_name, role, signup_whatsapp`, [userId])
  if (user.role !== 'client') return
  const existing = await t.one('select id from clients where user_id = $1', [userId])
  if (existing) return
  const client = await t.one(
    `insert into clients (user_id, full_name, whatsapp, email, source, status)
     values ($1,$2,$3,$4,'app','interested') returning id`,
    [userId, user.fullName, user.signupWhatsapp, user.email])
  await t.run('update users set signup_whatsapp = null where id = $1', [userId])
  await audit(t, userId, 'auth.register', 'client', client.id)
}

/** Comprueba el código; al acertar, la cuenta queda verificada y se crea su ficha. */
export async function verifyEmailCode(userId, code) {
  const outcome = await tx(async (t) => {
    const row = await t.one(
      `select id, code_hash, attempts from email_codes
        where user_id = $1 and consumed_at is null and expires_at > now()
        order by created_at desc limit 1 for update`, [userId])
    if (!row) return 'expired'
    if (row.attempts >= MAX_ATTEMPTS) return 'locked'
    const good = timingSafeEqual(Buffer.from(row.codeHash, 'hex'), hashCode(userId, code))
    if (!good) {
      await t.run('update email_codes set attempts = attempts + 1 where id = $1', [row.id])
      return row.attempts + 1 >= MAX_ATTEMPTS ? 'locked' : 'wrong'
    }
    await t.run('update email_codes set consumed_at = now() where id = $1', [row.id])
    await completeSignup(t, userId)
    return 'ok'
  })
  if (outcome === 'expired') throw new HttpError(400, 'El código venció. Pide uno nuevo', 'CODE_EXPIRED', { field: 'code' })
  if (outcome === 'locked') throw new HttpError(429, 'Demasiados intentos. Pide un código nuevo', 'CODE_LOCKED', { field: 'code' })
  if (outcome === 'wrong') throw new HttpError(400, 'El código no es correcto', 'CODE_WRONG', { field: 'code' })
}

/** Borra las cuentas que nunca confirmaron su correo (no tienen ficha, reservas ni pagos). */
export async function purgeUnverified() {
  return db.run(
    `delete from users u
      where u.role = 'client' and u.email_verified_at is null and u.is_active
        and u.created_at < now() - interval '48 hours'
        and not exists (select 1 from clients c where c.user_id = u.id)`)
}
