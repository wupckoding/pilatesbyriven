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

export const config = {
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
