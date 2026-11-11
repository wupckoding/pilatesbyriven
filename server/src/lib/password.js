import { randomBytes, scrypt, timingSafeEqual } from 'crypto'
import bcrypt from 'bcryptjs'

// scrypt corre en el pool de hilos de Node: muchas altas o inicios de sesión a la vez
// no congelan la API (con bcrypt en JavaScript puro, sí lo hacían).
// Parámetros según la recomendación de OWASP (N = 2^15, r = 8, p = 3).
const LOG_N = 15
const R = 8
const P = 3
const KEYLEN = 64

const derive = (password, salt, logN, r, p) => new Promise((resolve, reject) => {
  scrypt(password.normalize('NFKC'), salt, KEYLEN, { N: 2 ** logN, r, p, maxmem: 256 * 1024 * 1024 }, (err, key) => (err ? reject(err) : resolve(key)))
})

export async function hashPassword(password) {
  const salt = randomBytes(16)
  const key = await derive(password, salt, LOG_N, R, P)
  return ['scrypt', LOG_N, R, P, salt.toString('base64'), key.toString('base64')].join('$')
}

/** Acepta también los hashes bcrypt anteriores; `legacy` indica que conviene volver a guardarlo. */
export async function verifyPassword(password, stored) {
  if (!stored) return { ok: false, legacy: false }
  if (stored.startsWith('$2')) return { ok: await bcrypt.compare(password, stored), legacy: true }
  const [scheme, logN, r, p, salt, hash] = stored.split('$')
  if (scheme !== 'scrypt' || !hash) return { ok: false, legacy: false }
  const expected = Buffer.from(hash, 'base64')
  const key = await derive(password, Buffer.from(salt, 'base64'), Number(logN), Number(r), Number(p))
  return { ok: key.length === expected.length && timingSafeEqual(key, expected), legacy: false }
}
