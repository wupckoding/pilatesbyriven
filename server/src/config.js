import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import dotenv from 'dotenv'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: join(root, '.env') })

const env = process.env.NODE_ENV || 'development'
const isTest = env === 'test'
const isProd = env === 'production'

const databaseUrl = isTest ? process.env.TEST_DATABASE_URL : process.env.DATABASE_URL
if (!databaseUrl) throw new Error(`Falta ${isTest ? 'TEST_DATABASE_URL' : 'DATABASE_URL'} en server/.env`)

const jwtSecret = process.env.JWT_SECRET
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error('JWT_SECRET ausente o demasiado corto (mínimo 32 caracteres). Ver server/.env.example')
}

// Llave de cifrado de las respuestas clínicas (32 bytes en base64). Obligatoria fuera de pruebas.
const rawIntakeKey = process.env.INTAKE_KEY || (isTest ? Buffer.alloc(32, 7).toString('base64') : '')
const intakeKey = rawIntakeKey ? Buffer.from(rawIntakeKey, 'base64') : null
if (intakeKey && intakeKey.length !== 32) throw new Error('INTAKE_KEY debe ser de 32 bytes en base64')
if (isProd && !intakeKey) throw new Error('Falta INTAKE_KEY en producción. Ver server/.env.example')

export const config = {
  intakeKey,
  uploadsDir: process.env.UPLOADS_DIR || join(root, 'uploads'),
  env,
  isTest,
  isProd,
  root,
  port: Number(process.env.PORT || 3001),
  databaseUrl,
  jwtSecret,
  jwtTtl: '7d',
  corsOrigins: (process.env.CORS_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean),
  timezone: 'America/Costa_Rica',
  admin: {
    email: process.env.ADMIN_EMAIL || '',
    password: process.env.ADMIN_PASSWORD || '',
    name: process.env.ADMIN_NAME || 'Riven',
  },
}
