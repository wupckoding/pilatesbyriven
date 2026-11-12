// Defectos que encontraron las pruebas con agentes: cada uno queda fijado aquí.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'

process.env.NODE_ENV = 'test'
const { pool, db } = await import('../src/db.js')
const { migrate } = await import('../src/migrate.js')
const { createApp } = await import('../src/app.js')
const { hashPassword } = await import('../src/lib/password.js')

let server
let base
let admin

const call = async (method, path, { token = admin, body, raw = false } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, data: raw ? await res.text() : await res.json().catch(() => ({})) }
}
const ok = (res, status = 200) => { assert.equal(res.status, status, JSON.stringify(res.data).slice(0, 400)); return res.data }
const newClient = (fullName, whatsapp) => call('POST', '/api/admin/clients', { body: { fullName, whatsapp } })

before(async () => {
  await pool.query('drop schema public cascade; create schema public;')
  await migrate({ log: () => {} })
  await db.run(`insert into users (email, password_hash, role, full_name) values ($1,$2,'admin','Admin')`,
    ['admin@fixes.local', await hashPassword('clave-del-personal')])
  server = createApp().listen(0)
  base = `http://127.0.0.1:${server.address().port}`
  admin = ok(await call('POST', '/api/auth/login', { token: null, body: { email: 'admin@fixes.local', password: 'clave-del-personal' } })).token
  ok(await newClient('Sofía Vargas Núñez', '7000 1001'), 201)
  ok(await newClient('Sofia Mora', '7000 1002'), 201)
  ok(await newClient('Camila Jiménez', '7000 1003'), 201)
})

after(async () => {
  await new Promise((resolve) => server.close(resolve))
  await pool.end()
})

test('el filtro de admisión de la lista de clientas responde (antes daba error 500)', async () => {
  for (const intake of ['pending', 'completed', 'needs_review', 'needs_update']) {
    const res = await call('GET', `/api/admin/clients?status=all&intake=${intake}`)
    assert.equal(res.status, 200, intake)
    assert.ok(Array.isArray(res.data.clients), intake)
  }
  assert.equal(ok(await call('GET', '/api/admin/clients?status=all&intake=pending')).clients.length, 3)
  assert.equal(ok(await call('GET', '/api/admin/clients?status=all&intake=completed')).clients.length, 0)
})

test('la búsqueda de clientas no distingue tildes ni mayúsculas', async () => {
  const names = async (search) => ok(await call('GET', `/api/admin/clients?status=all&search=${encodeURIComponent(search)}`)).clients.map((c) => c.fullName).sort()
  assert.deepEqual(await names('sofia'), ['Sofia Mora', 'Sofía Vargas Núñez'])
  assert.deepEqual(await names('SOFÍA'), ['Sofia Mora', 'Sofía Vargas Núñez'])
  assert.deepEqual(await names('camila jimenez'), ['Camila Jiménez'])
  assert.deepEqual(await names('nunez'), ['Sofía Vargas Núñez'])
  assert.deepEqual(await names('7000 1003'), ['Camila Jiménez'])
  // Los comodines escritos por la persona no actúan como comodines.
  assert.deepEqual(await names('%'), [])
})

test('los mensajes de validación salen en español', async () => {
  const long = await newClient('A'.repeat(121), '7000 1010')
  assert.equal(long.status, 400)
  assert.match(long.data.error, /Demasiado largo \(máximo 120 caracteres\)/)
  const reg = await call('POST', '/api/auth/register', { token: null, body: { fullName: 'B'.repeat(121), email: 'largo@fixes.local', password: 'clave-segura-1', whatsapp: '7000 1011', acceptPrivacy: true } })
  assert.equal(reg.status, 400)
  assert.doesNotMatch(reg.data.error, /String must|character/)
})

test('una fecha de nacimiento futura o de hace más de 110 años se rechaza', async () => {
  for (const birthDate of ['2090-01-01', '1885-01-01']) {
    const res = await call('POST', '/api/admin/clients', { body: { fullName: 'Fecha Rara', whatsapp: '7000 1020', birthDate } })
    assert.equal(res.status, 400, birthDate)
    assert.equal(res.data.field, 'birthDate', birthDate)
  }
  ok(await call('POST', '/api/admin/clients', { body: { fullName: 'Fecha Buena', whatsapp: '7000 1021', birthDate: '1990-05-17' } }), 201)
})

test('agregar a una clase a quien ya está avisa que no se creó otra reserva', async () => {
  const { clients } = ok(await call('GET', '/api/admin/clients?status=all&search=camila'))
  const tomorrow = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10)
  const { session } = ok(await call('POST', '/api/admin/sessions', { body: { name: 'Clase', modality: 'reformer', kind: 'group', durationMin: 60, capacity: 3, localDate: tomorrow, localTime: '10:00' } }), 201)
  const first = await call('POST', '/api/admin/bookings', { body: { sessionId: session.id, clientId: clients[0].id } })
  assert.equal(first.status, 201)
  assert.equal(first.data.created, true)
  const second = await call('POST', '/api/admin/bookings', { body: { sessionId: session.id, clientId: clients[0].id } })
  assert.equal(second.status, 200)
  assert.equal(second.data.created, false)
  assert.equal(second.data.booking.id, first.data.booking.id)
})

test('el CSV de pagos deja los reembolsos como números negativos, no como texto', async () => {
  const { clients } = ok(await call('GET', '/api/admin/clients?status=all&search=camila'))
  const today = new Date().toISOString().slice(0, 10)
  const pay = ok(await call('POST', '/api/admin/payments', { body: { clientId: clients[0].id, amountCents: 3000, currency: 'USD', method: 'sinpe', receivedOn: today, verified: true, idempotencyKey: crypto.randomUUID() } }), 201)
  const paymentId = pay.payment?.id || pay.id
  ok(await call('POST', `/api/admin/payments/${paymentId}/refund`, { body: { amountCents: 3000, reason: 'Prueba', refundedOn: today, idempotencyKey: crypto.randomUUID() } }), 201)
  const file = await call('GET', '/api/admin/export/payments.csv', { raw: true })
  assert.equal(file.status, 200)
  assert.match(file.data, /;-30\.00;/)
  assert.doesNotMatch(file.data, /'-30\.00/)
  // La protección contra fórmulas sigue activa para texto.
  ok(await call('POST', '/api/admin/expenses', { body: { date: today, category: 'otros', amountCents: 100, currency: 'USD', note: '=SUM(A1:A9)' } }), 201)
  const expenses = await call('GET', '/api/admin/export/expenses.csv', { raw: true })
  assert.match(expenses.data, /'=SUM\(A1:A9\)/)
})
