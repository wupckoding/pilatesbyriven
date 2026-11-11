import { config } from './config.js'
import { pool } from './db.js'
import { migrate } from './migrate.js'
import { createApp } from './app.js'
import { generateSessions } from './services/sessions.js'

await migrate()
await generateSessions()
// Mantiene siempre 8 semanas de agenda por delante.
const timer = setInterval(
  () => generateSessions().catch((err) => console.error('generateSessions', err)),
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
