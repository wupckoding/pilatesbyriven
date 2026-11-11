// Pruebas de integración contra una base PostgreSQL de pruebas (TEST_DATABASE_URL).
// Ejecutar con: npm test
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'

process.env.NODE_ENV = 'test'
const { pool, db } = await import('../src/db.js')
const { migrate } = await import('../src/migrate.js')
const { createApp } = await import('../src/app.js')
const { generateSessions } = await import('../src/services/sessions.js')
const { normalizeWhatsapp } = await import('../src/lib/phone.js')
const { todayCR, addDays } = await import('../src/lib/time.js')
const bcrypt = (await import('bcryptjs')).default

let server
let base
let adminToken
let seq = 0

const call = async (method, path, { token, body } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, data: await res.json().catch(() => ({})) }
}

const newClient = async (name = 'Clienta Prueba') => {
  seq += 1
  const email = `clienta${seq}@test.local`
  const res = await call('POST', '/api/auth/register', {
    body: { fullName: name, email, password: 'clave-segura-1', whatsapp: `7000${String(1000 + seq)}`, acceptPrivacy: true },
  })
  assert.equal(res.status, 201, JSON.stringify(res.data))
  return { ...res.data, email }
}

// Crea una sesión futura suelta con la capacidad indicada.
const newSession = async (capacity = 3, daysAhead = 3, time = '10:00') => {
  seq += 1
  const res = await call('POST', '/api/admin/sessions', {
    token: adminToken,
    body: { name: `Clase ${seq}`, modality: 'reformer', kind: 'group', durationMin: 60, capacity,
      localDate: addDays(todayCR(), daysAhead), localTime: time },
  })
  assert.equal(res.status, 201, JSON.stringify(res.data))
  return res.data.session
}

before(async () => {
  await pool.query('drop schema public cascade; create schema public;')
  await migrate({ log: () => {} })
  await db.run(`insert into users (email, password_hash, role, full_name) values ($1,$2,'admin','Admin')`,
    ['admin@test.local', await bcrypt.hash('admin-clave-segura', 4)])
  server = createApp().listen(0)
  base = `http://127.0.0.1:${server.address().port}`
  const login = await call('POST', '/api/auth/login', { body: { email: 'admin@test.local', password: 'admin-clave-segura' } })
  adminToken = login.data.token
  assert.ok(adminToken)
})

after(async () => {
  await new Promise((resolve) => server.close(resolve))
  await pool.end()
})

test('normaliza WhatsApp con código de país', () => {
  assert.equal(normalizeWhatsapp('8888 7777'), '+50688887777')
  assert.equal(normalizeWhatsapp('+506 8888-7777'), '+50688887777')
  assert.equal(normalizeWhatsapp('50688887777'), '+50688887777')
  assert.equal(normalizeWhatsapp('+1 (305) 555-0100'), '+13055550100')
  assert.equal(normalizeWhatsapp('0034 612 345 678'), '+34612345678')
  assert.equal(normalizeWhatsapp('123'), null)
  assert.equal(normalizeWhatsapp(''), null)
})

test('registro crea cuenta + ficha con ID de alumna consecutivo', async () => {
  const a = await newClient('Ana Uno')
  const b = await newClient('Bea Dos')
  assert.match(a.client.studentCode, /^PR \d{4}$/)
  assert.equal(b.client.studentNumber, a.client.studentNumber + 1)
  assert.equal(a.user.role, 'client')
  assert.equal(a.client.whatsapp.startsWith('+506'), true)
})

test('registro valida datos y rechaza correo repetido', async () => {
  const a = await newClient()
  const dup = await call('POST', '/api/auth/register', {
    body: { fullName: 'Otra', email: a.email.toUpperCase(), password: 'clave-segura-1', whatsapp: '88887777', acceptPrivacy: true },
  })
  assert.equal(dup.status, 409)
  const weak = await call('POST', '/api/auth/register', {
    body: { fullName: 'Otra', email: 'x@test.local', password: '123', whatsapp: '88887777', acceptPrivacy: true },
  })
  assert.equal(weak.status, 400)
  const noPrivacy = await call('POST', '/api/auth/register', {
    body: { fullName: 'Otra', email: 'y@test.local', password: 'clave-segura-1', whatsapp: '88887777' },
  })
  assert.equal(noPrivacy.status, 400)
  // No se puede pedir rol de admin desde el registro.
  const sneaky = await call('POST', '/api/auth/register', {
    body: { fullName: 'Otra', email: 'z@test.local', password: 'clave-segura-1', whatsapp: '88887777', acceptPrivacy: true, role: 'admin' },
  })
  assert.equal(sneaky.data.user.role, 'client')
})

test('login: credenciales incorrectas y token inválido dan 401', async () => {
  const a = await newClient()
  assert.equal((await call('POST', '/api/auth/login', { body: { email: a.email, password: 'incorrecta-123' } })).status, 401)
  assert.equal((await call('POST', '/api/auth/login', { body: { email: 'nadie@test.local', password: 'incorrecta-123' } })).status, 401)
  assert.equal((await call('GET', '/api/auth/me')).status, 401)
  assert.equal((await call('GET', '/api/auth/me', { token: 'no.es.token' })).status, 401)
  assert.equal((await call('GET', '/api/auth/me', { token: a.token })).status, 200)
})

test('cambiar la contraseña cierra las sesiones anteriores', async () => {
  const a = await newClient()
  const bad = await call('POST', '/api/auth/change-password', { token: a.token, body: { currentPassword: 'no-es', newPassword: 'nueva-clave-99' } })
  assert.equal(bad.status, 401)
  const ok = await call('POST', '/api/auth/change-password', { token: a.token, body: { currentPassword: 'clave-segura-1', newPassword: 'nueva-clave-99' } })
  assert.equal(ok.status, 200)
  assert.equal((await call('GET', '/api/auth/me', { token: a.token })).status, 401)
  assert.equal((await call('GET', '/api/auth/me', { token: ok.data.token })).status, 200)
})

test('una clienta no entra al panel ni ve datos ajenos', async () => {
  const a = await newClient()
  const b = await newClient()
  for (const path of ['/api/admin/dashboard', '/api/admin/clients', '/api/admin/groups', '/api/admin/settings', `/api/admin/clients/${b.client.id}`]) {
    assert.equal((await call('GET', path, { token: a.token })).status, 403, path)
  }
  const session = await newSession()
  const booked = await call('POST', '/api/bookings', { token: b.token, body: { sessionId: session.id } })
  assert.equal(booked.status, 201)
  // A no puede cancelar la reserva de B.
  assert.equal((await call('POST', `/api/bookings/${booked.data.booking.id}/cancel`, { token: a.token })).status, 404)
  // A no ve la reserva de B, ni nombres en la lista de horarios.
  const mine = await call('GET', '/api/bookings', { token: a.token })
  assert.equal(mine.data.upcoming.length, 0)
  const list = await call('GET', '/api/sessions', { token: a.token })
  assert.equal(JSON.stringify(list.data).includes(b.client.fullName), false)
})

test('último cupo: dos solicitudes simultáneas producen una sola reserva', async () => {
  const session = await newSession(3)
  const clients = await Promise.all([newClient(), newClient(), newClient(), newClient()])
  for (const c of clients.slice(0, 2)) {
    assert.equal((await call('POST', '/api/bookings', { token: c.token, body: { sessionId: session.id } })).status, 201)
  }
  const [r1, r2] = await Promise.all(
    clients.slice(2).map((c) => call('POST', '/api/bookings', { token: c.token, body: { sessionId: session.id } })))
  assert.deepEqual([r1.status, r2.status].sort(), [201, 409])
  const loser = r1.status === 409 ? r1 : r2
  assert.equal(loser.data.code, 'SESSION_FULL')
  assert.equal(loser.data.canWaitlist, true)

  const detail = await call('GET', `/api/admin/sessions/${session.id}`, { token: adminToken })
  assert.equal(detail.data.session.taken, 3)
  assert.equal(detail.data.session.capacity, 3)

  // La que quedó fuera puede entrar a lista de espera.
  const loserClient = r1.status === 409 ? clients[2] : clients[3]
  const wait = await call('POST', '/api/bookings', { token: loserClient.token, body: { sessionId: session.id, joinWaitlist: true } })
  assert.equal(wait.status, 201)
  assert.equal(wait.data.booking.status, 'waitlisted')
})

test('20 solicitudes simultáneas nunca superan la capacidad', async () => {
  const session = await newSession(3)
  const clients = []
  for (let i = 0; i < 20; i++) clients.push(await newClient())
  const results = await Promise.all(
    clients.map((c) => call('POST', '/api/bookings', { token: c.token, body: { sessionId: session.id } })))
  assert.equal(results.filter((r) => r.status === 201).length, 3)
  assert.equal(results.filter((r) => r.status === 409).length, 17)
})

test('doble toque: la misma reserva no se duplica', async () => {
  const session = await newSession(3)
  const a = await newClient()
  const results = await Promise.all(
    [1, 2, 3, 4].map(() => call('POST', '/api/bookings', { token: a.token, body: { sessionId: session.id } })))
  assert.equal(results.every((r) => r.status === 201 || r.status === 200), true)
  assert.equal(new Set(results.map((r) => r.data.booking.id)).size, 1)
  const detail = await call('GET', `/api/admin/sessions/${session.id}`, { token: adminToken })
  assert.equal(detail.data.session.taken, 1)
})

test('cancelar libera el cupo y promover desde la espera respeta la capacidad', async () => {
  const session = await newSession(1)
  const a = await newClient()
  const b = await newClient()
  const first = await call('POST', '/api/bookings', { token: a.token, body: { sessionId: session.id } })
  const waiting = await call('POST', '/api/bookings', { token: b.token, body: { sessionId: session.id, joinWaitlist: true } })
  assert.equal(waiting.data.booking.status, 'waitlisted')

  // Con la clase llena no se puede promover.
  const blocked = await call('PATCH', `/api/admin/bookings/${waiting.data.booking.id}`, { token: adminToken, body: { status: 'confirmed' } })
  assert.equal(blocked.status, 409)

  const cancel = await call('POST', `/api/bookings/${first.data.booking.id}/cancel`, { token: a.token })
  assert.equal(cancel.status, 200)
  assert.equal(cancel.data.late, false)
  assert.equal(cancel.data.booking.attendance, 'cancelled_notice')

  const promoted = await call('PATCH', `/api/admin/bookings/${waiting.data.booking.id}`, { token: adminToken, body: { status: 'confirmed' } })
  assert.equal(promoted.status, 200)
  assert.equal(promoted.data.booking.status, 'confirmed')
})

test('cancelación dentro de la ventana de aviso queda como tardía', async () => {
  // Clase que empieza en ~2 horas (la ventana por defecto es de 8).
  const soon = new Date(Date.now() + 2 * 36e5)
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Costa_Rica' }).format(soon)
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Costa_Rica', hour: '2-digit', minute: '2-digit' }).format(soon)
  const created = await call('POST', '/api/admin/sessions', {
    token: adminToken,
    body: { name: 'Pronto', modality: 'mat', kind: 'group', durationMin: 60, capacity: 2, localDate: date, localTime: time },
  })
  assert.equal(created.status, 201, JSON.stringify(created.data))
  const a = await newClient()
  const booked = await call('POST', '/api/bookings', { token: a.token, body: { sessionId: created.data.session.id } })
  await call('PATCH', `/api/admin/bookings/${booked.data.booking.id}`, { token: adminToken, body: { status: 'confirmed' } })
  const cancel = await call('POST', `/api/bookings/${booked.data.booking.id}/cancel`, { token: a.token })
  assert.equal(cancel.data.late, true)
  assert.equal(cancel.data.booking.attendance, 'cancelled_late')
  // Una solicitud aún sin confirmar no cuenta como tardía.
  const b = await newClient()
  const pending = await call('POST', '/api/bookings', { token: b.token, body: { sessionId: created.data.session.id } })
  const cancelPending = await call('POST', `/api/bookings/${pending.data.booking.id}/cancel`, { token: b.token })
  assert.equal(cancelPending.data.late, false)
  assert.equal(cancelPending.data.booking.attendance, 'cancelled_notice')
})

test('asistencia: marcar y contar alumnas que asistieron una sola vez', async () => {
  const a = await newClient()
  const before = (await call('GET', '/api/admin/dashboard', { token: adminToken })).data.counts.clientsAttended
  for (const time of ['08:00', '09:00']) {
    const s = await newSession(3, 2, time)
    const b = await call('POST', '/api/admin/bookings', { token: adminToken, body: { sessionId: s.id, clientId: a.client.id } })
    assert.equal(b.data.booking.status, 'confirmed')
    const marked = await call('PATCH', `/api/admin/bookings/${b.data.booking.id}`, { token: adminToken, body: { attendance: 'attended' } })
    assert.equal(marked.data.booking.attendance, 'attended')
  }
  const afterCount = (await call('GET', '/api/admin/dashboard', { token: adminToken })).data.counts.clientsAttended
  assert.equal(afterCount, before + 1)
})

test('ficha desde administración: detecta duplicados por WhatsApp', async () => {
  const first = await call('POST', '/api/admin/clients', { token: adminToken, body: { fullName: 'Lucía Prueba', whatsapp: '6111 2222', source: 'instagram' } })
  assert.equal(first.status, 201)
  assert.equal(first.data.client.whatsapp, '+50661112222')
  const dup = await call('POST', '/api/admin/clients', { token: adminToken, body: { fullName: 'Lucia P.', whatsapp: '+506 61112222' } })
  assert.equal(dup.status, 409)
  assert.equal(dup.data.code, 'POSSIBLE_DUPLICATE')
  assert.equal(dup.data.duplicates[0].id, first.data.client.id)
  const forced = await call('POST', '/api/admin/clients', { token: adminToken, body: { fullName: 'Lucia P.', whatsapp: '+506 61112222', confirmDuplicate: true } })
  assert.equal(forced.status, 201)
  assert.notEqual(forced.data.client.studentNumber, first.data.client.studentNumber)
  const bad = await call('POST', '/api/admin/clients', { token: adminToken, body: { fullName: 'X Y', whatsapp: '12' } })
  assert.equal(bad.status, 400)
})

test('grupos: generar sesiones es idempotente y usa la hora de Costa Rica', async () => {
  const created = await call('POST', '/api/admin/groups', {
    token: adminToken,
    body: { name: 'Martes 6 pm', modality: 'reformer', kind: 'group', weekday: 2, startTime: '18:00', durationMin: 60, capacity: 3 },
  })
  assert.equal(created.status, 201, JSON.stringify(created.data))
  const count = async () => (await db.one('select count(*)::int as n from class_sessions where group_id = $1', [created.data.group.id])).n
  const n1 = await count()
  assert.ok(n1 >= 8 && n1 <= 9, `sesiones generadas: ${n1}`)
  await generateSessions()
  await generateSessions()
  assert.equal(await count(), n1)
  // 18:00 en Costa Rica (UTC-6) es 00:00 UTC del día siguiente.
  const s = await db.one('select starts_at, local_date from class_sessions where group_id = $1 order by local_date limit 1', [created.data.group.id])
  assert.equal(new Date(s.startsAt).getUTCHours(), 0)
  assert.equal(new Date(s.startsAt).toISOString().slice(0, 10), addDays(s.localDate, 1))
  assert.equal(new Date(`${s.localDate}T12:00:00Z`).getUTCDay(), 2)
})

test('cambiar la serie no toca sesiones con cambio puntual y respeta reservas', async () => {
  const created = await call('POST', '/api/admin/groups', {
    token: adminToken,
    body: { name: 'Jueves 7 am', modality: 'mat', kind: 'group', weekday: 4, startTime: '07:00', durationMin: 60, capacity: 3 },
  })
  const gid = created.data.group.id
  const sessions = await db.query('select id from class_sessions where group_id = $1 and starts_at > now() order by local_date', [gid])
  // Cambio puntual en la primera sesión.
  const moved = await call('PATCH', `/api/admin/sessions/${sessions[0].id}`, { token: adminToken, body: { localTime: '09:30' } })
  assert.equal(moved.status, 200)
  // Tres reservas en la segunda.
  for (let i = 0; i < 3; i++) {
    const c = await newClient()
    await call('POST', '/api/bookings', { token: c.token, body: { sessionId: sessions[1].id } })
  }
  const tooSmall = await call('PATCH', `/api/admin/groups/${gid}`, { token: adminToken, body: { capacity: 2 } })
  assert.equal(tooSmall.status, 409)
  const ok = await call('PATCH', `/api/admin/groups/${gid}`, { token: adminToken, body: { startTime: '07:30' } })
  assert.equal(ok.status, 200)
  const after = await db.query('select id, local_time from class_sessions where group_id = $1 and starts_at > now() order by local_date', [gid])
  assert.equal(after[0].localTime, '09:30')
  assert.equal(after[1].localTime, '07:30')
  // Reducir capacidad de una sesión por debajo de lo reservado también se rechaza.
  const cap = await call('PATCH', `/api/admin/sessions/${sessions[1].id}`, { token: adminToken, body: { capacity: 2 } })
  assert.equal(cap.status, 409)
})

test('eliminar cuenta: cancela reservas futuras, archiva la ficha y bloquea el acceso', async () => {
  const a = await newClient()
  const session = await newSession(2)
  await call('POST', '/api/bookings', { token: a.token, body: { sessionId: session.id } })
  assert.equal((await call('DELETE', '/api/auth/me', { token: a.token, body: { password: 'mala' } })).status, 401)
  assert.equal((await call('DELETE', '/api/auth/me', { token: a.token, body: { password: 'clave-segura-1' } })).status, 200)
  assert.equal((await call('GET', '/api/auth/me', { token: a.token })).status, 401)
  assert.equal((await call('POST', '/api/auth/login', { body: { email: a.email, password: 'clave-segura-1' } })).status, 401)
  const detail = await call('GET', `/api/admin/sessions/${session.id}`, { token: adminToken })
  assert.equal(detail.data.session.taken, 0)
  // El correo queda libre para registrarse de nuevo.
  const again = await call('POST', '/api/auth/register', {
    body: { fullName: 'De Vuelta', email: a.email, password: 'clave-segura-1', whatsapp: '88880000', acceptPrivacy: true },
  })
  assert.equal(again.status, 201)
  assert.ok(again.data.client.studentNumber > a.client.studentNumber)
})

test('entradas inválidas responden 400, no 500', async () => {
  const a = await newClient()
  assert.equal((await call('POST', '/api/bookings', { token: a.token, body: { sessionId: 'abc' } })).status, 400)
  assert.equal((await call('POST', '/api/bookings', { token: a.token, body: {} })).status, 400)
  assert.equal((await call('POST', '/api/bookings/not-a-uuid/cancel', { token: a.token })).status, 400)
  assert.equal((await call('GET', '/api/admin/agenda?from=2026-13-45&to=x', { token: adminToken })).status, 400)
  assert.equal((await call('GET', '/api/admin/agenda?from=2026-02-30&to=2026-03-01', { token: adminToken })).status, 400)
  assert.equal((await call('GET', '/api/no-existe', { token: a.token })).status, 404)
  const res = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{mal json' })
  assert.equal(res.status, 400)
})
