import { config } from './config.js'
import { db, pool } from './db.js'
import { flagOutdated } from './services/intake.js'
import { migrate } from './migrate.js'
import { createApp } from './app.js'
import { generateSessions } from './services/sessions.js'
import { purgeUnverified } from './services/verification.js'
import { mailEnabled } from './lib/mail.js'

if (config.isProd && !mailEnabled()) {
  console.warn('AVISO: sin SMTP configurado; las cuentas nuevas no confirman su correo.')
}

await migrate()
await generateSessions()
await flagOutdated(db)
// Mantiene siempre 8 semanas de agenda por delante.
const timer = setInterval(
  () => {
    generateSessions().catch((err) => console.error('generateSessions', err))
    // Limpia los registros que nunca confirmaron su correo.
    purgeUnverified().catch((err) => console.error('purgeUnverified', err))
  },
  6 * 60 * 60 * 1000,
)

const server = createApp().listen(config.port, () => {
  console.log(`Pilates by Riven API · puerto ${config.port} · ${config.env}`)
})

const shutdown = () => {
  clearInterval(timer)
  server.close(() => pool.end().then(() => process.exit(0)))
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
