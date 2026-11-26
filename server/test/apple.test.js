// Iniciar sesión con Apple y con Google desde el app de iPhone.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import jwt from 'jsonwebtoken'

process.env.NODE_ENV = 'test'
process.env.GOOGLE_CLIENT_ID = 'web.apps.googleusercontent.com'
process.env.GOOGLE_IOS_CLIENT_ID = 'ios.apps.googleusercontent.com'
process.env.APPLE_CLIENT_IDS = 'com.pilatesbyriven.app'
// Llave .p8 de mentira: activa la revocación, que las pruebas interceptan.
const p8 = generateKeyPairSync('ec', { namedCurve: 'P-256' })
process.env.APPLE_TEAM_ID = 'TEAM123456'
process.env.APPLE_KEY_ID = 'KEY1234567'
process.env.APPLE_PRIVATE_KEY = p8.privateKey.export({ type: 'pkcs8', format: 'pem' }).replace(/\n/g, '\\n')

const { pool, db } = await import('../src/db.js')
const { migrate } = await import('../src/migrate.js')
const { createApp } = await import('../src/app.js')
const { setAppleKeyFetcher, setApplePoster } = await import('../src/services/apple.js')
const { setGoogleKeyFetcher } = await import('../src/services/google.js')
const { hashPassword } = await import('../src/lib/password.js')

let server
let base
const calls = []

const call = async (method, path, { token = null, body } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, data: await res.json().catch(() => ({})) }
}
const ok = (res, status = 200) => { assert.equal(res.status, status, JSON.stringify(res.data).slice(0, 400)); return res.data }

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'a1', alg: 'RS256', use: 'sig' }
const appleToken = (claims = {}) => jwt.sign(
  { iss: 'https://appleid.apple.com', aud: 'com.pilatesbyriven.app', email_verified: 'true', ...claims },
  privateKey, { algorithm: 'RS256', keyid: 'a1', ...(claims.exp ? {} : { expiresIn: '5m' }) })
const googleToken = (claims = {}) => jwt.sign(
  { iss: 'https://accounts.google.com', email_verified: true, name: 'Persona Google', ...claims },
  privateKey, { algorithm: 'RS256', keyid: 'a1', expiresIn: '5m' })

before(async () => {
  await pool.query('drop schema public cascade; create schema public;')
  await migrate({ log: () => {} })
  setAppleKeyFetcher(async () => [jwk])
  setGoogleKeyFetcher(async () => [jwk])
  setApplePoster(async (path, form) => {
    calls.push({ path, form })
    // El secreto del cliente va firmado con la llave .p8 (ES256) para el bundle del app.
    const secret = jwt.verify(form.client_secret, p8.publicKey, { algorithms: ['ES256'], audience: 'https://appleid.apple.com', issuer: 'TEAM123456' })
    assert.equal(secret.sub, 'com.pilatesbyriven.app')
    return path === '/auth/token' ? { refresh_token: `rt-${form.code}` } : {}
  })
  server = createApp().listen(0)
  base = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  await new Promise((resolve) => server.close(resolve))
  await pool.end()
})

test('la configuración pública anuncia el acceso con Apple', async () => {
  assert.equal(ok(await call('GET', '/api/auth/config')).appleSignIn, true)
})

test('Apple: la primera vez pide WhatsApp y privacidad; crea la cuenta con el nombre que manda Apple', async () => {
  const identityToken = appleToken({ sub: 'apple-001', email: 'ana@privaterelay.appleid.com' })
  const first = await call('POST', '/api/auth/apple', { body: { identityToken, fullName: 'Ana Solís' } })
  assert.equal(first.status, 409)
  assert.equal(first.data.code, 'SIGNUP_DETAILS_REQUIRED')

  const done = ok(await call('POST', '/api/auth/apple', {
    body: { identityToken, authorizationCode: 'c1', fullName: 'Ana Solís', whatsapp: '8800 1001', acceptPrivacy: true },
  }))
  assert.ok(done.token)
  assert.equal(done.user.fullName, 'Ana Solís')
  assert.equal(done.user.apple, true)
  assert.equal(done.user.emailVerified, true)
  assert.equal(done.user.hasPassword, false)
  assert.match(done.client.studentCode, /^PR \d{4}$/)
  const row = await db.one('select apple_refresh_token from users where apple_sub = $1', ['apple-001'])
  assert.equal(row.appleRefreshToken, 'rt-c1')
})

test('Apple: las veces siguientes entra solo con el vínculo, aunque Apple ya no mande el correo', async () => {
  const again = ok(await call('POST', '/api/auth/apple', { body: { identityToken: appleToken({ sub: 'apple-001' }) } }))
  assert.equal(again.user.email, 'ana@privaterelay.appleid.com')
  assert.equal(again.user.fullName, 'Ana Solís')
})

test('Apple sin correo y sin cuenta vinculada explica cómo volver a autorizar', async () => {
  const res = await call('POST', '/api/auth/apple', { body: { identityToken: appleToken({ sub: 'apple-sin-correo' }), whatsapp: '8800 1002', acceptPrivacy: true } })
  assert.equal(res.status, 400)
  assert.equal(res.data.code, 'EMAIL_REQUIRED')
})

test('Apple con el correo de una cuenta existente la vincula sin pedir datos', async () => {
  ok(await call('POST', '/api/auth/register', { body: { fullName: 'Lucía Mora', email: 'lucia@correo.local', password: 'clave-segura-1', whatsapp: '8800 1003', acceptPrivacy: true } }), 201)
  const linked = ok(await call('POST', '/api/auth/apple', { body: { identityToken: appleToken({ sub: 'apple-002', email: 'lucia@correo.local' }) } }))
  assert.equal(linked.user.fullName, 'Lucía Mora')
  assert.equal(linked.user.apple, true)
  assert.equal(linked.user.hasPassword, true)
})

test('se rechazan tokens de Apple para otro app, vencidos o con otro emisor', async () => {
  const bad = [
    appleToken({ sub: 'x', email: 'x@x.local', aud: 'com.otra.app' }),
    appleToken({ sub: 'x', email: 'x@x.local', iss: 'https://accounts.google.com' }),
    appleToken({ sub: 'x', email: 'x@x.local', exp: Math.floor(Date.now() / 1000) - 60 }),
    'no-es-un-token-de-verdad-pero-largo',
  ]
  for (const identityToken of bad) {
    const res = await call('POST', '/api/auth/apple', { body: { identityToken, whatsapp: '8800 1004', acceptPrivacy: true } })
    assert.equal(res.status, 401, identityToken.slice(0, 20))
  }
})

test('Google desde el app de iPhone: se acepta el ID de cliente iOS además del web', async () => {
  for (const [aud, sub] of [['ios.apps.googleusercontent.com', 'g-ios'], ['web.apps.googleusercontent.com', 'g-web']]) {
    const res = ok(await call('POST', '/api/auth/google', {
      body: { credential: googleToken({ aud, sub, email: `${sub}@gmail.com` }), whatsapp: '8800 1010', acceptPrivacy: true },
    }))
    assert.equal(res.user.google, true)
  }
  const other = await call('POST', '/api/auth/google', { body: { credential: googleToken({ aud: 'otro.apps.googleusercontent.com', sub: 'g-x', email: 'gx@gmail.com' }) } })
  assert.equal(other.status, 401)
})

test('eliminar una cuenta de Apple revoca el acceso en Apple y borra el vínculo', async () => {
  const { token } = ok(await call('POST', '/api/auth/apple', { body: { identityToken: appleToken({ sub: 'apple-001' }) } }))
  const before = calls.length
  ok(await call('DELETE', '/api/auth/me', { token, body: { confirm: 'ELIMINAR' } }))
  const revoke = calls.slice(before).find((c) => c.path === '/auth/revoke')
  assert.ok(revoke, 'no se llamó a la revocación')
  assert.equal(revoke.form.token, 'rt-c1')
  assert.equal(await db.one('select id from users where apple_sub = $1', ['apple-001']), null)
  // Volver a entrar con Apple crea una cuenta nueva (pide los datos otra vez).
  const back = await call('POST', '/api/auth/apple', { body: { identityToken: appleToken({ sub: 'apple-001', email: 'ana@privaterelay.appleid.com' }) } })
  assert.equal(back.status, 409)
})

test('el app de iPhone puede llamar a la API (CORS para capacitor://localhost)', async () => {
  const pre = await fetch(`${base}/api/auth/apple`, {
    method: 'OPTIONS',
    headers: { Origin: 'capacitor://localhost', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,authorization' },
  })
  assert.equal(pre.headers.get('access-control-allow-origin'), 'capacitor://localhost')
  const stranger = await fetch(`${base}/api/auth/config`, { headers: { Origin: 'https://otro-sitio.example' } })
  assert.equal(stranger.headers.get('access-control-allow-origin'), null)
})
