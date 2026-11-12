// Verificación de correo al registrarse y acceso con Google.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import jwt from 'jsonwebtoken'

process.env.NODE_ENV = 'test'
process.env.MAIL_CAPTURE = 'test' // correo "encendido": los mensajes quedan en memoria
process.env.GOOGLE_CLIENT_ID = 'prueba.apps.googleusercontent.com'
const { pool, db } = await import('../src/db.js')
const { migrate } = await import('../src/migrate.js')
const { createApp } = await import('../src/app.js')
const { outbox } = await import('../src/lib/mail.js')
const { purgeUnverified } = await import('../src/services/verification.js')
const { setGoogleKeyFetcher } = await import('../src/services/google.js')
const { hashPassword } = await import('../src/lib/password.js')

let server
let base
let admin
let seq = 0

const call = async (method, path, { token = null, body } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, data: await res.json().catch(() => ({})) }
}
const ok = (res, status = 200) => { assert.equal(res.status, status, JSON.stringify(res.data).slice(0, 400)); return res.data }

const form = (extra = {}) => {
  seq += 1
  return { fullName: `Alumna ${seq}`, email: `v${seq}@verifica.local`, password: 'clave-segura-1', whatsapp: `6200${String(1000 + seq)}`, acceptPrivacy: true, ...extra }
}
const register = async (extra) => {
  const body = form(extra)
  return { ...ok(await call('POST', '/api/auth/register', { body }), 201), form: body }
}
const lastCode = (email) => {
  const mail = outbox.filter((m) => m.to === email).at(-1)
  assert.ok(mail, `no se envió correo a ${email}`)
  return mail.text.match(/\b(\d{6})\b/)[1]
}
const otherCode = (code) => (code === '000000' ? '111111' : '000000')
const clientRow = (email) => db.one('select id, student_number, whatsapp from clients where email = $1', [email])
// Simula que pasó el tiempo de espera entre envíos.
const ageCodes = (email, seconds = 120) => db.run(
  `update email_codes set created_at = created_at - make_interval(secs => $2)
    where user_id = (select id from users where email = $1)`, [email, seconds])

// Google de mentira: una llave propia firma los tokens y el servidor la recibe como si viniera de Google.
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const other = generateKeyPairSync('rsa', { modulusLength: 2048 })
const googleToken = (claims = {}, { key = privateKey, kid = 'k1' } = {}) => jwt.sign(
  { iss: 'https://accounts.google.com', aud: process.env.GOOGLE_CLIENT_ID, email_verified: true, name: 'Persona Google', ...claims },
  key, { algorithm: 'RS256', keyid: kid, expiresIn: '5m' })

before(async () => {
  await pool.query('drop schema public cascade; create schema public;')
  await migrate({ log: () => {} })
  await db.run(`insert into users (email, password_hash, role, full_name) values ($1,$2,'admin','Admin')`,
    ['admin@verifica.local', await hashPassword('clave-del-personal')])
  setGoogleKeyFetcher(async () => [{ ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' }])
  server = createApp().listen(0)
  base = `http://127.0.0.1:${server.address().port}`
  admin = ok(await call('POST', '/api/auth/login', { body: { email: 'admin@verifica.local', password: 'clave-del-personal' } })).token
})

after(async () => {
  await new Promise((resolve) => server.close(resolve))
  await pool.end()
})

test('la configuración pública dice si hay Google y si se confirma el correo', async () => {
  const cfg = ok(await call('GET', '/api/auth/config'))
  assert.deepEqual(cfg, { googleClientId: process.env.GOOGLE_CLIENT_ID, emailVerification: true })
})

test('una cuenta nueva no tiene ficha ni puede usar la app hasta confirmar el correo', async () => {
  const c = await register()
  assert.equal(c.user.emailVerified, false)
  assert.equal(c.client, null)
  assert.equal(await clientRow(c.form.email), null, 'la ficha no debe existir todavía')

  for (const path of ['/api/sessions', '/api/bookings', '/api/packages', '/api/intake']) {
    const res = await call('GET', path, { token: c.token })
    assert.equal(res.status, 403, path)
    assert.equal(res.data.code, 'EMAIL_NOT_VERIFIED', path)
  }
  // El panel no la ve.
  const list = ok(await call('GET', '/api/admin/clients', { token: admin }))
  assert.equal(JSON.stringify(list).includes(c.form.email), false)

  const code = lastCode(c.form.email)
  const done = ok(await call('POST', '/api/auth/verify-email', { token: c.token, body: { code } }))
  assert.equal(done.user.emailVerified, true)
  assert.match(done.client.studentCode, /^PR \d{4}$/)
  assert.equal((await clientRow(c.form.email)).whatsapp, `+506${c.form.whatsapp}`)
  ok(await call('GET', '/api/sessions', { token: c.token }))
  // Repetir la confirmación no rompe nada ni duplica la ficha.
  ok(await call('POST', '/api/auth/verify-email', { token: c.token, body: { code } }))
  assert.equal((await db.one('select count(*) as n from clients where email = $1', [c.form.email])).n, 1)
})

test('el correo no guarda el código en claro en la base', async () => {
  const c = await register()
  const code = lastCode(c.form.email)
  const rows = await db.query('select code_hash from email_codes')
  assert.equal(rows.some((r) => r.codeHash.includes(code)), false)
})

test('código incorrecto: avisa, y al quinto intento el código queda bloqueado', async () => {
  const c = await register()
  const code = lastCode(c.form.email)
  assert.equal((await call('POST', '/api/auth/verify-email', { token: c.token, body: { code: '12' } })).status, 400)
  for (let i = 1; i <= 4; i += 1) {
    const res = await call('POST', '/api/auth/verify-email', { token: c.token, body: { code: otherCode(code) } })
    assert.equal(res.data.code, 'CODE_WRONG', `intento ${i}`)
  }
  assert.equal((await call('POST', '/api/auth/verify-email', { token: c.token, body: { code: otherCode(code) } })).data.code, 'CODE_LOCKED')
  // Ni el código correcto sirve ya.
  assert.equal((await call('POST', '/api/auth/verify-email', { token: c.token, body: { code } })).data.code, 'CODE_LOCKED')

  // Con un código nuevo sí entra.
  await ageCodes(c.form.email)
  ok(await call('POST', '/api/auth/resend-code', { token: c.token }))
  const fresh = lastCode(c.form.email)
  assert.equal(ok(await call('POST', '/api/auth/verify-email', { token: c.token, body: { code: fresh } })).user.emailVerified, true)
})

test('reenviar: hay que esperar, el código anterior deja de servir y hay un tope diario', async () => {
  const c = await register()
  const first = lastCode(c.form.email)
  const soon = await call('POST', '/api/auth/resend-code', { token: c.token })
  assert.equal(soon.status, 429)
  assert.equal(soon.data.code, 'CODE_WAIT')

  await ageCodes(c.form.email)
  ok(await call('POST', '/api/auth/resend-code', { token: c.token }))
  const second = lastCode(c.form.email)
  if (second !== first) {
    assert.equal((await call('POST', '/api/auth/verify-email', { token: c.token, body: { code: first } })).data.code, 'CODE_WRONG')
  }
  for (let i = 0; i < 4; i += 1) {
    await ageCodes(c.form.email)
    ok(await call('POST', '/api/auth/resend-code', { token: c.token }))
  }
  await ageCodes(c.form.email)
  assert.equal((await call('POST', '/api/auth/resend-code', { token: c.token })).data.code, 'CODE_LIMIT')
})

test('un código vencido no sirve', async () => {
  const c = await register()
  const code = lastCode(c.form.email)
  await db.run(`update email_codes set expires_at = now() - interval '1 minute'
                 where user_id = (select id from users where email = $1)`, [c.form.email])
  assert.equal((await call('POST', '/api/auth/verify-email', { token: c.token, body: { code } })).data.code, 'CODE_EXPIRED')
})

test('quien registra un correo ajeno no lo bloquea: la dueña puede registrarse de nuevo', async () => {
  const intruder = await register({ password: 'clave-de-otra-persona' })
  const email = intruder.form.email
  await ageCodes(email)
  const owner = ok(await call('POST', '/api/auth/register', { body: form({ email, password: 'clave-de-la-duena' }) }), 201)
  // La sesión y la contraseña de la primera persona dejan de servir.
  assert.equal((await call('GET', '/api/auth/me', { token: intruder.token })).status, 401)
  assert.equal((await call('POST', '/api/auth/login', { body: { email, password: 'clave-de-otra-persona' } })).status, 401)
  ok(await call('POST', '/api/auth/verify-email', { token: owner.token, body: { code: lastCode(email) } }))
  // Ya confirmada, el correo queda tomado.
  const again = await call('POST', '/api/auth/register', { body: form({ email }) })
  assert.equal(again.status, 409)
  assert.equal(again.data.code, 'EMAIL_TAKEN')
})

test('iniciar sesión sin haber confirmado deja pedir el código y confirmar', async () => {
  const c = await register()
  const login = ok(await call('POST', '/api/auth/login', { body: { email: c.form.email, password: c.form.password } }))
  assert.equal(login.user.emailVerified, false)
  ok(await call('POST', '/api/auth/verify-email', { token: login.token, body: { code: lastCode(c.form.email) } }))
  assert.equal((await call('POST', '/api/auth/resend-code', { token: login.token })).data.code, 'ALREADY_VERIFIED')
})

test('las cuentas sin confirmar se borran a las 48 horas; las confirmadas no', async () => {
  const stale = await register()
  const recent = await register()
  const verified = await register()
  ok(await call('POST', '/api/auth/verify-email', { token: verified.token, body: { code: lastCode(verified.form.email) } }))
  await db.run(`update users set created_at = now() - interval '3 days' where email = any($1)`, [[stale.form.email, verified.form.email]])
  await purgeUnverified()
  const left = (await db.query('select email from users where email = any($1)', [[stale.form.email, recent.form.email, verified.form.email]])).map((r) => r.email)
  assert.deepEqual(left.sort(), [recent.form.email, verified.form.email].sort())
  // El correo liberado se puede volver a registrar.
  ok(await call('POST', '/api/auth/register', { body: form({ email: stale.form.email }) }), 201)
})

test('eliminar la cuenta funciona también antes de confirmar', async () => {
  const c = await register()
  ok(await call('DELETE', '/api/auth/me', { token: c.token, body: { password: c.form.password } }))
  assert.equal((await call('GET', '/api/auth/me', { token: c.token })).status, 401)
})

test('Google: la primera vez pide WhatsApp y privacidad, luego entra directo', async () => {
  const credential = googleToken({ sub: 'g-100', email: 'nueva@gmail.test', name: 'Nueva Persona' })
  const need = await call('POST', '/api/auth/google', { body: { credential } })
  assert.equal(need.status, 409)
  assert.equal(need.data.code, 'SIGNUP_DETAILS_REQUIRED')
  assert.equal(need.data.email, 'nueva@gmail.test')
  assert.equal(await db.one('select 1 as x from users where email = $1', ['nueva@gmail.test']), null)

  const badPhone = await call('POST', '/api/auth/google', { body: { credential, whatsapp: '12', acceptPrivacy: true } })
  assert.equal(badPhone.status, 400)
  assert.equal(badPhone.data.field, 'whatsapp')

  const created = ok(await call('POST', '/api/auth/google', { body: { credential, whatsapp: '6300 1000', acceptPrivacy: true } }))
  assert.equal(created.user.emailVerified, true)
  assert.equal(created.user.hasPassword, false)
  assert.equal(created.user.google, true)
  assert.equal(created.client.fullName, 'Nueva Persona')
  assert.equal(created.client.whatsapp, '+50663001000')
  ok(await call('GET', '/api/sessions', { token: created.token }))

  const again = ok(await call('POST', '/api/auth/google', { body: { credential } }))
  assert.equal(again.user.id, created.user.id)
  // No hay contraseña con la que entrar.
  assert.equal((await call('POST', '/api/auth/login', { body: { email: 'nueva@gmail.test', password: '' } })).status, 400)
  assert.equal((await call('POST', '/api/auth/login', { body: { email: 'nueva@gmail.test', password: 'cualquiera-123' } })).status, 401)
})

test('Google: se rechazan tokens de otra app, sin firma válida, vencidos o con correo sin confirmar', async () => {
  const base64 = { sub: 'g-200', email: 'mala@gmail.test' }
  const cases = {
    'otra app': googleToken({ ...base64, aud: 'otra.apps.googleusercontent.com' }),
    'otra llave': googleToken(base64, { key: other.privateKey }),
    'llave desconocida': googleToken(base64, { kid: 'zzz' }),
    'otro emisor': googleToken({ ...base64, iss: 'https://evil.example' }),
    'correo sin confirmar': googleToken({ ...base64, email_verified: false }),
    'vencido': jwt.sign({ ...base64, iss: 'https://accounts.google.com', aud: process.env.GOOGLE_CLIENT_ID, email_verified: true, exp: Math.floor(Date.now() / 1000) - 60 }, privateKey, { algorithm: 'RS256', keyid: 'k1' }),
    'sin firma': `${googleToken(base64).split('.').slice(0, 2).join('.')}.`,
    'HS256 con la llave pública': jwt.sign({ ...base64, iss: 'https://accounts.google.com', aud: process.env.GOOGLE_CLIENT_ID, email_verified: true }, publicKey.export({ type: 'spki', format: 'pem' }), { algorithm: 'HS256', keyid: 'k1' }),
  }
  for (const [name, credential] of Object.entries(cases)) {
    const res = await call('POST', '/api/auth/google', { body: { credential, whatsapp: '6300 2000', acceptPrivacy: true } })
    assert.equal(res.status, 401, name)
    assert.equal(res.data.code, 'GOOGLE_INVALID', name)
  }
  assert.equal(await db.one('select 1 as x from users where email = $1', ['mala@gmail.test']), null)
})

test('Google: se une a una cuenta confirmada del mismo correo y conserva su contraseña', async () => {
  const c = await register()
  ok(await call('POST', '/api/auth/verify-email', { token: c.token, body: { code: lastCode(c.form.email) } }))
  const g = ok(await call('POST', '/api/auth/google', { body: { credential: googleToken({ sub: 'g-300', email: c.form.email }) } }))
  assert.equal(g.user.id, c.user.id)
  assert.equal(g.user.hasPassword, true)
  ok(await call('POST', '/api/auth/login', { body: { email: c.form.email, password: c.form.password } }))
  assert.equal((await db.one('select count(*) as n from clients where email = $1', [c.form.email])).n, 1)
})

test('Google: si alguien registró ese correo sin confirmarlo, su contraseña y su sesión se anulan', async () => {
  const intruder = await register({ password: 'clave-de-otra-persona' })
  const email = intruder.form.email
  const credential = googleToken({ sub: 'g-400', email, name: 'Dueña Real' })
  assert.equal((await call('POST', '/api/auth/google', { body: { credential } })).data.code, 'SIGNUP_DETAILS_REQUIRED')
  const owner = ok(await call('POST', '/api/auth/google', { body: { credential, whatsapp: '6300 4000', acceptPrivacy: true } }))
  assert.equal(owner.user.hasPassword, false)
  assert.equal(owner.client.fullName, 'Dueña Real')
  assert.equal(owner.client.whatsapp, '+50663004000')
  assert.equal((await call('GET', '/api/auth/me', { token: intruder.token })).status, 401)
  assert.equal((await call('POST', '/api/auth/login', { body: { email, password: 'clave-de-otra-persona' } })).status, 401)
})

test('cuenta de Google: puede crear una contraseña y eliminar su cuenta sin tener una', async () => {
  const a = ok(await call('POST', '/api/auth/google', { body: { credential: googleToken({ sub: 'g-500', email: 'a500@gmail.test' }), whatsapp: '6300 5000', acceptPrivacy: true } }))
  const set = ok(await call('POST', '/api/auth/change-password', { token: a.token, body: { newPassword: 'mi-clave-nueva-1' } }))
  ok(await call('POST', '/api/auth/login', { body: { email: 'a500@gmail.test', password: 'mi-clave-nueva-1' } }))
  // Con contraseña definida, cambiarla vuelve a exigir la actual.
  assert.equal((await call('POST', '/api/auth/change-password', { token: set.token, body: { newPassword: 'otra-clave-22' } })).status, 400)

  const credential = googleToken({ sub: 'g-501', email: 'b501@gmail.test' })
  const b = ok(await call('POST', '/api/auth/google', { body: { credential, whatsapp: '6300 5001', acceptPrivacy: true } }))
  assert.equal((await call('DELETE', '/api/auth/me', { token: b.token, body: {} })).status, 400)
  assert.equal((await call('DELETE', '/api/auth/me', { token: b.token, body: { confirm: 'borrar' } })).status, 400)
  ok(await call('DELETE', '/api/auth/me', { token: b.token, body: { confirm: 'eliminar' } }))
  // Puede volver a crear su cuenta con Google más adelante.
  const back = ok(await call('POST', '/api/auth/google', { body: { credential, whatsapp: '6300 5001', acceptPrivacy: true } }))
  assert.notEqual(back.user.id, b.user.id)
})

test('el personal no necesita confirmar correo', async () => {
  ok(await call('GET', '/api/admin/clients', { token: admin }))
  assert.equal(ok(await call('GET', '/api/auth/me', { token: admin })).user.emailVerified, true)
})
