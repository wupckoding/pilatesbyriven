import { createPublicKey } from 'crypto'
import jwt from 'jsonwebtoken'
import { config } from '../config.js'
import { HttpError } from '../lib/http.js'

const CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs'
let cache = { keys: new Map(), until: 0 }

// Las pruebas sustituyen esta función para no depender de Google.
let fetchKeys = async () => {
  const res = await fetch(CERTS_URL, { signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw new Error(`certs ${res.status}`)
  return (await res.json()).keys
}
export const setGoogleKeyFetcher = (fn) => { fetchKeys = fn; cache = { keys: new Map(), until: 0 } }

async function keyFor(kid) {
  if (Date.now() > cache.until || !cache.keys.has(kid)) {
    const keys = await fetchKeys()
    cache = { keys: new Map(keys.map((k) => [k.kid, createPublicKey({ key: k, format: 'jwk' })])), until: Date.now() + 60 * 60 * 1000 }
  }
  return cache.keys.get(kid)
}

export const googleEnabled = () => Boolean(config.googleClientId)

/** Valida el token de identidad que entrega el botón de Google y devuelve los datos de la persona. */
export async function verifyGoogleCredential(credential) {
  if (!googleEnabled()) throw new HttpError(404, 'El acceso con Google no está disponible', 'NOT_FOUND')
  const bad = () => new HttpError(401, 'No pudimos validar tu cuenta de Google. Inténtalo de nuevo', 'GOOGLE_INVALID')
  const decoded = jwt.decode(credential, { complete: true })
  if (!decoded?.header?.kid) throw bad()
  let key
  try {
    key = await keyFor(decoded.header.kid)
  } catch (err) {
    console.error('google certs', err.message)
    throw new HttpError(502, 'No pudimos conectar con Google. Inténtalo de nuevo', 'GOOGLE_UNAVAILABLE')
  }
  if (!key) throw bad()
  let payload
  try {
    payload = jwt.verify(credential, key, {
      algorithms: ['RS256'],
      audience: config.googleClientId,
      issuer: ['accounts.google.com', 'https://accounts.google.com'],
    })
  } catch {
    throw bad()
  }
  if (!payload.sub || !payload.email || payload.email_verified !== true) throw bad()
  return { sub: String(payload.sub), email: String(payload.email).toLowerCase(), name: String(payload.name || '').trim() }
}
