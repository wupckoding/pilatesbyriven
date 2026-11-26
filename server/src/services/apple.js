// Iniciar sesión con Apple (app de iPhone). La App Store lo exige cuando el app ofrece entrar con Google.
import jwt from 'jsonwebtoken'
import { config } from '../config.js'
import { HttpError } from '../lib/http.js'
import { jwksVerifier } from '../lib/jwks.js'

const APPLE = 'https://appleid.apple.com'
const verifier = jwksVerifier({ url: `${APPLE}/auth/keys`, issuers: [APPLE] })
export const setAppleKeyFetcher = (fn) => verifier.setFetcher(fn)

export const appleEnabled = () => config.apple.clientIds.length > 0

/**
 * Valida el token de identidad de Apple. El correo puede ser el real o uno de reenvío de Apple
 * (@privaterelay.appleid.com); los dos llegan verificados. En cuentas ya vinculadas el correo puede faltar.
 */
export async function verifyAppleCredential(identityToken) {
  if (!appleEnabled()) throw new HttpError(404, 'El acceso con Apple no está disponible', 'NOT_FOUND')
  const bad = () => new HttpError(401, 'No pudimos validar tu cuenta de Apple. Inténtalo de nuevo', 'APPLE_INVALID')
  let payload
  try {
    payload = await verifier.verify(identityToken, config.apple.clientIds)
  } catch (err) {
    if (err.reason === 'unavailable') {
      console.error('apple keys', err.message)
      throw new HttpError(502, 'No pudimos conectar con Apple. Inténtalo de nuevo', 'APPLE_UNAVAILABLE')
    }
    throw bad()
  }
  if (!payload.sub) throw bad()
  const verified = payload.email_verified === true || payload.email_verified === 'true'
  const email = payload.email && verified ? String(payload.email).toLowerCase() : ''
  return { sub: String(payload.sub), email, clientId: payload.aud }
}

// ─── Revocación al eliminar la cuenta (pedido por Apple) ──────────────────
// Necesita la llave "Sign in with Apple" (.p8) del portal de desarrolladores. Sin ella no se revoca,
// y la persona puede quitar el acceso desde Ajustes del iPhone; el resto funciona igual.
export const appleRevocationEnabled = () => Boolean(config.apple.teamId && config.apple.keyId && config.apple.privateKey)

const clientSecret = (clientId) => jwt.sign({}, config.apple.privateKey, {
  algorithm: 'ES256',
  keyid: config.apple.keyId,
  issuer: config.apple.teamId,
  audience: APPLE,
  subject: clientId,
  expiresIn: '5m',
})

let post = async (path, form) => {
  const res = await fetch(`${APPLE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form),
    signal: AbortSignal.timeout(8000),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`apple ${path} ${res.status} ${data.error || ''}`)
  return data
}
export const setApplePoster = (fn) => { post = fn }

/** Cambia el código de autorización del primer acceso por un refresh token (para poder revocarlo después). */
export async function appleRefreshToken(authorizationCode, clientId) {
  if (!appleRevocationEnabled() || !authorizationCode) return null
  try {
    const data = await post('/auth/token', {
      client_id: clientId, client_secret: clientSecret(clientId), code: authorizationCode, grant_type: 'authorization_code',
    })
    return data.refresh_token || null
  } catch (err) {
    console.error('apple token', err.message)
    return null
  }
}

export async function revokeAppleToken(refreshToken, clientId = config.apple.clientIds[0]) {
  if (!appleRevocationEnabled() || !refreshToken) return
  try {
    await post('/auth/revoke', {
      client_id: clientId, client_secret: clientSecret(clientId), token: refreshToken, token_type_hint: 'refresh_token',
    })
  } catch (err) {
    console.error('apple revoke', err.message)
  }
}
