import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import { config } from '../config.js'

// AES-256-GCM: confidencialidad + integridad. Formato: v1.<iv>.<tag>.<datos> en base64url.
const key = () => {
  if (!config.intakeKey) throw new Error('Falta INTAKE_KEY en server/.env (32 bytes en base64). Ver .env.example')
  return config.intakeKey
}

export function encryptJson(value) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.')
}

export function decryptJson(text) {
  const [version, iv, tag, data] = String(text).split('.')
  if (version !== 'v1') throw new Error('Formato de cifrado desconocido')
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8'))
}
