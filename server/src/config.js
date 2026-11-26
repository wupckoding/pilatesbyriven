import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import dotenv from 'dotenv'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: join(root, '.env') })

const list = (value) => (value || '').split(',').map((s) => s.trim()).filter(Boolean)

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

// Correo saliente. 'smtp' envía de verdad; 'capture' (pruebas y desarrollo, MAIL_CAPTURE=1) guarda
// los mensajes en memoria y los imprime; 'off' = sin correo: no se exige verificar el correo.
// En pruebas nunca se envía correo real, y solo capturan las que lo piden (MAIL_CAPTURE=test):
// así el MAIL_CAPTURE=1 del .env de desarrollo no cambia el resto de pruebas ni la simulación.
const smtpHost = isTest ? '' : (process.env.SMTP_HOST || '')
const capture = isTest ? process.env.MAIL_CAPTURE === 'test' : (process.env.MAIL_CAPTURE === '1' && !isProd)
const mailMode = smtpHost ? 'smtp' : (capture ? 'capture' : 'off')

export const config = {
  mail: {
    mode: mailMode,
    host: smtpHost,
    port: Number(process.env.SMTP_PORT || 465),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || (process.env.SMTP_USER ? `Pilates by Riven <${process.env.SMTP_USER}>` : ''),
  },
  // ID de cliente OAuth de Google (público). Vacío = sin botón de Google.
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  // Otros IDs de cliente de Google aceptados (el del app de iPhone), separados por coma.
  googleExtraClientIds: list(process.env.GOOGLE_IOS_CLIENT_ID),
  apple: {
    // Bundle ID del app de iPhone: es la "audiencia" de los tokens de Apple.
    clientIds: list(process.env.APPLE_CLIENT_IDS ?? 'com.pilatesbyriven.app'),
    // Opcional: llave .p8 de "Sign in with Apple" para revocar el acceso al eliminar la cuenta.
    teamId: process.env.APPLE_TEAM_ID || '',
    keyId: process.env.APPLE_KEY_ID || '',
    privateKey: (process.env.APPLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  },
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
  // El app de iPhone (Capacitor) llama a la API desde el origen capacitor://localhost.
  corsOrigins: [...new Set([...list(process.env.CORS_ORIGIN), 'capacitor://localhost'])],
  timezone: 'America/Costa_Rica',
  admin: {
    email: process.env.ADMIN_EMAIL || '',
    password: process.env.ADMIN_PASSWORD || '',
    name: process.env.ADMIN_NAME || 'Riven',
  },
}
