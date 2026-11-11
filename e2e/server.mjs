// API para las pruebas de interfaz: base propia (pilates_e2e), vacía y con datos mínimos en cada arranque.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.NODE_ENV = 'test'
process.env.TEST_DATABASE_URL = process.env.E2E_DATABASE_URL || 'postgres://riven@127.0.0.1:5433/pilates_e2e'
process.env.UPLOADS_DIR = mkdtempSync(join(tmpdir(), 'riven-e2e-'))
const PORT = Number(process.env.E2E_API_PORT || 3101)

const { pool, db } = await import('../server/src/db.js')
const { migrate } = await import('../server/src/migrate.js')
const { createApp } = await import('../server/src/app.js')
const { hashPassword } = await import('../server/src/lib/password.js')
const { generateSessions } = await import('../server/src/services/sessions.js')

await pool.query('drop schema public cascade; create schema public;')
await migrate({ log: () => {} })

// Cuentas del personal solo para estas pruebas.
const hash = await hashPassword('clave-e2e-del-personal')
await db.run(
  `insert into users (email, password_hash, role, full_name) values ($1,$2,'admin','Riven'), ($3,$2,'instructor','Instructora Prueba')`,
  ['admin@e2e.local', hash, 'instructora@e2e.local'])
await db.run(
  `insert into products (name, kind, sessions_count, price_cents, currency, validity_days, sort_order) values
     ('Clase de prueba', 'trial', 1, 1500, 'USD', 30, 1),
     ('Clase suelta', 'single', 1, 2500, 'USD', 30, 2),
     ('Paquete mensual · 4 clases', 'package', 4, 8000, 'USD', 30, 3)`)
// Un grupo cada día a las 6 p. m. y una clase grande diaria a las 9 a. m.: siempre hay dónde reservar.
const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
for (let weekday = 0; weekday < 7; weekday++) {
  await db.run(
    `insert into class_groups (name, modality, kind, weekday, start_time, duration_min, capacity) values ($1,'reformer','group',$2,'18:00',60,3)`,
    [`${days[weekday]} 6:00 p. m.`, weekday])
  await db.run(
    `insert into class_groups (name, modality, kind, weekday, start_time, duration_min, capacity) values ($1,'mat','group',$2,'09:00',60,12)`,
    [`Mat ${days[weekday]}`, weekday])
}
await generateSessions()
await db.run(
  `insert into settings (key, value) values ('sinpeNumber', '"8888 0000"'), ('sinpeName', '"Estudio de Prueba"')`)

createApp().listen(PORT, () => console.log(`API e2e en ${PORT}`))
