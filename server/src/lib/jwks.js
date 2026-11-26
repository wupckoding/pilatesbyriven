import { createPublicKey } from 'crypto'
import jwt from 'jsonwebtoken'

/**
 * Verificador de tokens de identidad firmados por un proveedor (Google, Apple) con sus llaves públicas (JWKS).
 * Las llaves se guardan una hora; una llave nueva (kid desconocido) fuerza otra descarga.
 */
export function jwksVerifier({ url, issuers }) {
  let cache = { keys: new Map(), until: 0 }
  let fetchKeys = async () => {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) throw new Error(`jwks ${res.status}`)
    return (await res.json()).keys
  }

  async function keyFor(kid) {
    if (Date.now() > cache.until || !cache.keys.has(kid)) {
      const keys = await fetchKeys()
      cache = { keys: new Map(keys.map((k) => [k.kid, createPublicKey({ key: k, format: 'jwk' })])), until: Date.now() + 60 * 60 * 1000 }
    }
    return cache.keys.get(kid)
  }

  return {
    // Las pruebas sustituyen la descarga para no depender del proveedor.
    setFetcher(fn) { fetchKeys = fn; cache = { keys: new Map(), until: 0 } },
    /**
     * Devuelve el contenido del token, o lanza:
     *   { reason: 'invalid' } si el token no es válido, { reason: 'unavailable' } si no se pudo descargar las llaves.
     */
    async verify(token, audience) {
      const decoded = jwt.decode(token, { complete: true })
      if (!decoded?.header?.kid) throw Object.assign(new Error('sin kid'), { reason: 'invalid' })
      let key
      try {
        key = await keyFor(decoded.header.kid)
      } catch (err) {
        throw Object.assign(err, { reason: 'unavailable' })
      }
      if (!key) throw Object.assign(new Error('kid desconocido'), { reason: 'invalid' })
      try {
        return jwt.verify(token, key, { algorithms: ['RS256'], audience, issuer: issuers })
      } catch (err) {
        throw Object.assign(err, { reason: 'invalid' })
      }
    },
  }
}
