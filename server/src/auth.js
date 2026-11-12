import jwt from 'jsonwebtoken'
import { config } from './config.js'
import { db } from './db.js'
import { HttpError } from './lib/http.js'
import { verificationRequired } from './services/verification.js'

export const signToken = (user) =>
  jwt.sign({ sub: user.id, v: user.tokenVersion }, config.jwtSecret, { expiresIn: config.jwtTtl })

/** Exige sesión válida. Relee la cuenta en cada petición: rol, baja o cambio de contraseña aplican al instante. */
export async function requireAuth(req, _res, next) {
  try {
    const header = req.headers.authorization || ''
    if (!header.startsWith('Bearer ')) throw new HttpError(401, 'Inicia sesión para continuar', 'UNAUTHENTICATED')
    let payload
    try {
      payload = jwt.verify(header.slice(7), config.jwtSecret)
    } catch {
      throw new HttpError(401, 'Tu sesión expiró. Inicia sesión de nuevo', 'UNAUTHENTICATED')
    }
    const user = await db.one(
      `select id, email, role, full_name, token_version, is_active, email_verified_at, password_hash, google_sub
         from users where id = $1`, [payload.sub])
    if (!user || !user.isActive || user.tokenVersion !== payload.v) {
      throw new HttpError(401, 'Tu sesión expiró. Inicia sesión de nuevo', 'UNAUTHENTICATED')
    }
    // Una clienta que aún no confirma su correo solo puede usar las rutas de su propia cuenta.
    if (user.role === 'client' && !user.emailVerifiedAt && verificationRequired() && !req.originalUrl.startsWith('/api/auth/')) {
      throw new HttpError(403, 'Confirma tu correo para continuar', 'EMAIL_NOT_VERIFIED')
    }
    req.user = user
    next()
  } catch (err) {
    next(err)
  }
}

export const requireRole = (...roles) => (req, _res, next) =>
  roles.includes(req.user?.role)
    ? next()
    : next(new HttpError(403, 'No tienes permiso para esta acción', 'FORBIDDEN'))
