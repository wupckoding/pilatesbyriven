import { config } from '../config.js'
import { HttpError } from '../lib/http.js'
import { jwksVerifier } from '../lib/jwks.js'

const verifier = jwksVerifier({
  url: 'https://www.googleapis.com/oauth2/v3/certs',
  issuers: ['accounts.google.com', 'https://accounts.google.com'],
})
export const setGoogleKeyFetcher = (fn) => verifier.setFetcher(fn)

export const googleEnabled = () => Boolean(config.googleClientId)

// El botón web firma para el ID de cliente web; el app de iPhone puede firmar para su ID de cliente iOS.
const audiences = () => [config.googleClientId, ...config.googleExtraClientIds].filter(Boolean)

/** Valida el token de identidad de Google (botón web o app nativo) y devuelve los datos de la persona. */
export async function verifyGoogleCredential(credential) {
  if (!googleEnabled()) throw new HttpError(404, 'El acceso con Google no está disponible', 'NOT_FOUND')
  const bad = () => new HttpError(401, 'No pudimos validar tu cuenta de Google. Inténtalo de nuevo', 'GOOGLE_INVALID')
  let payload
  try {
    payload = await verifier.verify(credential, audiences())
  } catch (err) {
    if (err.reason === 'unavailable') {
      console.error('google certs', err.message)
      throw new HttpError(502, 'No pudimos conectar con Google. Inténtalo de nuevo', 'GOOGLE_UNAVAILABLE')
    }
    throw bad()
  }
  if (!payload.sub || !payload.email || payload.email_verified !== true) throw bad()
  return { sub: String(payload.sub), email: String(payload.email).toLowerCase(), name: String(payload.name || '').trim() }
}
