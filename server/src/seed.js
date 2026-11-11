import bcrypt from 'bcryptjs'
import { config } from './config.js'
import { db, pool, tx } from './db.js'
import { migrate } from './migrate.js'
import { generateSessions } from './services/sessions.js'

const demo = process.argv.includes('--demo')
await migrate()

// 1. Cuenta de administración (credenciales en server/.env, nunca en el código).
if (config.admin.email && config.admin.password) {
  const exists = await db.one('select 1 as x from users where email = $1', [config.admin.email])
  if (!exists) {
    if (config.admin.password.length < 12) throw new Error('ADMIN_PASSWORD debe tener al menos 12 caracteres')
    await db.run(
      `insert into users (email, password_hash, role, full_name) values ($1,$2,'admin',$3)`,
      [config.admin.email, await bcrypt.hash(config.admin.password, 11), config.admin.name],
    )
    console.log(`admin creado: ${config.admin.email}`)
  }
} else {
  console.log('ADMIN_EMAIL / ADMIN_PASSWORD no definidos: no se creó cuenta de administración')
}

// 2. Catálogo inicial del documento de requisitos.
if (!(await db.one('select 1 as x from products limit 1'))) {
  await db.run(
    `insert into products (name, kind, sessions_count, price_cents, currency, validity_days, sort_order) values
       ('Clase de prueba', 'trial', 1, 1500, 'USD', 30, 1),
       ('Clase suelta', 'single', 1, 2500, 'USD', 30, 2),
       ('Paquete mensual · 4 clases', 'package', 4, 8000, 'USD', 30, 3)`,
  )
  console.log('catálogo inicial creado')
}

// 3. Los 10 grupos semanales de ejemplo (3 cupos cada uno = 30 cupos).
if (!(await db.one('select 1 as x from class_groups limit 1'))) {
  const slots = [
    [2, '18:00'], [2, '19:15'], [3, '18:30'], [4, '18:00'], [4, '19:15'],
    [6, '13:00'], [6, '15:00'], [6, '16:30'], [0, '15:00'], [0, '16:30'],
  ]
  const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
  const label = (t) => {
    const [h, m] = t.split(':').map(Number)
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'a. m.' : 'p. m.'}`
  }
  for (const [weekday, time] of slots) {
    await db.run(
      `insert into class_groups (name, modality, kind, weekday, start_time, duration_min, capacity)
       values ($1, 'reformer', 'group', $2, $3, 60, 3)`,
      [`${days[weekday]} ${label(time)}`, weekday, time],
    )
  }
  console.log('grupos de ejemplo creados')
}
await generateSessions()

// 4. Datos de demostración (solo local): clientas ficticias con reservas.
if (demo) {
  if (config.isProd) throw new Error('--demo no se permite en producción')
  if (!(await db.one(`select 1 as x from clients where source <> 'app' limit 1`))) {
    const names = ['Valeria Mora', 'Camila Jiménez', 'Sofía Vargas', 'Daniela Rojas', 'María José Solís', 'Paola Castro',
      'Gabriela Chaves', 'Natalia Quesada', 'Andrea Montero', 'Fernanda Alfaro', 'Laura Brenes', 'Mariana Ulate']
    const statuses = ['active', 'active', 'active', 'active', 'trial_scheduled', 'interested', 'active', 'paused',
      'active', 'interested', 'active', 'inactive']
    const sources = ['instagram', 'whatsapp', 'referral', 'instagram', 'form', 'instagram', 'referral', 'whatsapp',
      'instagram', 'whatsapp', 'referral', 'other']
    await tx(async (t) => {
      const ids = []
      for (let i = 0; i < names.length; i++) {
        const c = await t.one(
          `insert into clients (full_name, whatsapp, status, source, intake_status) values ($1,$2,$3,$4,$5) returning id`,
          [names[i], `+5067000${String(1000 + i)}`, statuses[i], sources[i], i % 3 === 0 ? 'pending' : 'completed'],
        )
        ids.push(c.id)
      }
      const sessions = await t.query(
        'select id, capacity from class_sessions where starts_at > now() order by starts_at limit 14')
      let k = 0
      for (const s of sessions) {
        const n = (k % 3) + 1 // 1, 2 o 3 reservas por clase
        for (let j = 0; j < Math.min(n, s.capacity); j++) {
          await t.run(
            'insert into bookings (session_id, client_id, status) values ($1,$2,$3) on conflict do nothing',
            [s.id, ids[(k + j * 5) % ids.length], j === 2 ? 'pending' : 'confirmed'],
          )
        }
        k++
      }
    })
    console.log('datos de demostración creados')
  }
}

await pool.end()
