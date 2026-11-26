// Editar y borrar clases; corregir y anular pagos.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'crypto'

process.env.NODE_ENV = 'test'
const { pool, db } = await import('../src/db.js')
const { migrate } = await import('../src/migrate.js')
const { createApp } = await import('../src/app.js')
const { hashPassword } = await import('../src/lib/password.js')
const { addDays, todayCR } = await import('../src/lib/time.js')

let server
let base
let admin
let clientId
const today = todayCR()
const soon = addDays(today, 5)

const call = async (method, path, { token = admin, body } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, data: await res.json().catch(() => ({})) }
}
const ok = (res, status = 200) => { assert.equal(res.status, status, JSON.stringify(res.data).slice(0, 400)); return res.data }
const newSession = (over = {}) => call('POST', '/api/admin/sessions', {
  body: { name: 'Prueba', modality: 'reformer', kind: 'trial', durationMin: 60, capacity: 3, localDate: soon, localTime: '09:00', ...over },
})
const book = (sessionId) => call('POST', '/api/admin/bookings', { body: { sessionId, clientId } })
const caja = async () => ok(await call('GET', `/api/admin/caja?from=${today}&to=${today}`)).totals

before(async () => {
  await pool.query('drop schema public cascade; create schema public;')
  await migrate({ log: () => {} })
  await db.run(`insert into users (email, password_hash, role, full_name) values ($1,$2,'admin','Admin')`,
    ['admin@editing.local', await hashPassword('clave-del-personal')])
  server = createApp().listen(0)
  base = `http://127.0.0.1:${server.address().port}`
  admin = ok(await call('POST', '/api/auth/login', { token: null, body: { email: 'admin@editing.local', password: 'clave-del-personal' } })).token
  clientId = ok(await call('POST', '/api/admin/clients', { body: { fullName: 'Valeria Rojas', whatsapp: '7000 2001' } }), 201).client.id
})

after(async () => {
  await new Promise((resolve) => server.close(resolve))
  await pool.end()
})

test('una clase suelta se edita entera: nombre, modalidad, tipo, duración, fecha y hora', async () => {
  const { session } = ok(await newSession(), 201)
  const later = addDays(soon, 1)
  const res = ok(await call('PATCH', `/api/admin/sessions/${session.id}`, {
    body: { name: 'Privada · Ana', modality: 'cadillac', kind: 'private', durationMin: 50, openBooking: false, localDate: later, localTime: '10:30', capacity: 1 },
  }))
  assert.equal(res.session.name, 'Privada · Ana')
  assert.equal(res.session.modality, 'cadillac')
  assert.equal(res.session.kind, 'private')
  assert.equal(res.session.durationMin, 50)
  assert.equal(res.session.openBooking, false)
  assert.equal(res.session.localDate, later)
  assert.equal(res.session.localTime, '10:30')
  assert.equal(res.affected, 0)
  const detail = ok(await call('GET', `/api/admin/sessions/${session.id}`)).session
  assert.equal(new Date(detail.startsAt).toISOString(), new Date(`${later}T16:30:00Z`).toISOString()) // 10:30 en Costa Rica
})

test('al mover una clase con reservas se informa cuántas clientas avisar; el tipo ya no cambia', async () => {
  const { session } = ok(await newSession({ kind: 'group', name: 'Grupo' }), 201)
  ok(await book(session.id), 201)
  const moved = ok(await call('PATCH', `/api/admin/sessions/${session.id}`, { body: { localTime: '11:00' } }))
  assert.equal(moved.affected, 1)
  const same = ok(await call('PATCH', `/api/admin/sessions/${session.id}`, { body: { localTime: '11:00', name: 'Grupo mañana' } }))
  assert.equal(same.affected, 0)
  const kind = await call('PATCH', `/api/admin/sessions/${session.id}`, { body: { kind: 'private' } })
  assert.equal(kind.status, 409)
  assert.equal(kind.data.field, 'kind')
  const cap = await call('PATCH', `/api/admin/sessions/${session.id}`, { body: { capacity: 0 } })
  assert.equal(cap.status, 400)
})

test('una clase ya empezada no cambia de fecha ni de datos', async () => {
  const { session } = ok(await newSession(), 201)
  await db.run(`update class_sessions set starts_at = now() - interval '1 hour' where id = $1`, [session.id])
  const res = await call('PATCH', `/api/admin/sessions/${session.id}`, { body: { localTime: '12:00' } })
  assert.equal(res.status, 409)
  assert.equal(res.data.code, 'SESSION_STARTED')
  ok(await call('PATCH', `/api/admin/sessions/${session.id}`, { body: { capacity: 4 } }))
})

test('borrar: solo una clase suelta sin reservas; las demás se cancelan', async () => {
  const { session: empty } = ok(await newSession(), 201)
  ok(await call('DELETE', `/api/admin/sessions/${empty.id}`))
  assert.equal((await call('GET', `/api/admin/sessions/${empty.id}`)).status, 404)

  const { session: used } = ok(await newSession({ kind: 'group' }), 201)
  const { booking } = ok(await book(used.id), 201)
  ok(await call('PATCH', `/api/admin/bookings/${booking.id}`, { body: { status: 'cancelled' } }))
  const res = await call('DELETE', `/api/admin/sessions/${used.id}`)
  assert.equal(res.status, 409)
  assert.equal(res.data.code, 'HAS_BOOKINGS')

  ok(await call('POST', '/api/admin/groups', { body: { name: 'Martes', modality: 'mat', kind: 'group', durationMin: 60, capacity: 4, weekday: 2, startTime: '18:00' } }), 201)
  const groupSession = await db.one('select id from class_sessions where group_id is not null limit 1')
  const inGroup = await call('DELETE', `/api/admin/sessions/${groupSession.id}`)
  assert.equal(inGroup.status, 409)
  assert.equal(inGroup.data.code, 'IN_GROUP')
})

test('un pago se corrige; el monto solo mientras no esté verificado', async () => {
  const pending = ok(await call('POST', '/api/admin/payments', {
    body: { clientId, amountCents: 5000, currency: 'USD', method: 'sinpe', receivedOn: today, verified: false, idempotencyKey: randomUUID() },
  }), 201).payment
  const fixed = ok(await call('PATCH', `/api/admin/payments/${pending.id}`, { body: { amountCents: 4500, method: 'cash', reference: 'R-1', note: 'Corregido' } })).payment
  assert.equal(fixed.amountCents, 4500)
  assert.equal(fixed.appliedCents, 4500)
  assert.equal(fixed.method, 'cash')
  assert.equal(fixed.reference, 'R-1')

  ok(await call('POST', `/api/admin/payments/${pending.id}/verify`))
  const locked = await call('PATCH', `/api/admin/payments/${pending.id}`, { body: { amountCents: 9999 } })
  assert.equal(locked.status, 409)
  assert.equal(locked.data.field, 'amountCents')
  // Con el mismo monto solo cambian los datos de registro.
  ok(await call('PATCH', `/api/admin/payments/${pending.id}`, { body: { amountCents: 4500, reference: 'R-2' } }))
  const future = await call('PATCH', `/api/admin/payments/${pending.id}`, { body: { receivedOn: addDays(today, 3) } })
  assert.equal(future.status, 400)
})

test('anular un pago lo saca del saldo del paquete y de Caja, sin borrarlo', async () => {
  const product = ok(await call('POST', '/api/admin/products', { body: { name: 'Mensual', kind: 'package', sessionsCount: 4, priceCents: 10000, currency: 'USD', validityDays: 30 } }), 201).product
  const pkg = ok(await call('POST', '/api/admin/packages', { body: { clientId, productId: product.id, startsOn: today } }), 201).package
  const before = (await caja()).USD
  const payment = ok(await call('POST', '/api/admin/payments', {
    body: { clientId, packageId: pkg.id, amountCents: 10000, currency: 'USD', method: 'sinpe', receivedOn: today, verified: true, idempotencyKey: randomUUID() },
  }), 201).payment
  assert.equal(ok(await call('GET', `/api/admin/packages/${pkg.id}`)).package.paidCents, 10000)

  // Con un reembolso vigente no se anula; anulado el reembolso, sí.
  const refund = ok(await call('POST', `/api/admin/payments/${payment.id}/refund`, { body: { amountCents: 2000, refundedOn: today, reason: 'Prueba', idempotencyKey: randomUUID() } }), 201).payment
  const blocked = await call('POST', `/api/admin/payments/${payment.id}/void`, { body: { reason: 'Duplicado' } })
  assert.equal(blocked.status, 409)
  assert.equal(blocked.data.code, 'HAS_REFUNDS')
  ok(await call('POST', `/api/admin/payments/${refund.id}/void`, { body: { reason: 'Reembolso de prueba' } }))

  const voided = ok(await call('POST', `/api/admin/payments/${payment.id}/void`, { body: { reason: 'Registrado dos veces' } })).payment
  assert.equal(voided.status, 'voided')
  assert.equal(voided.voidReason, 'Registrado dos veces')
  ok(await call('POST', `/api/admin/payments/${payment.id}/void`, { body: { reason: 'Otra vez' } })) // repetir no cambia nada

  const detail = ok(await call('GET', `/api/admin/packages/${pkg.id}`))
  assert.equal(detail.package.paidCents, 0)
  assert.equal(detail.package.balanceCents, 10000)
  assert.ok(detail.payments.some((y) => y.id === payment.id && y.status === 'voided'), 'sigue en el historial')
  const after = (await caja()).USD
  assert.equal(after.collected, before.collected)
  assert.equal(after.refunds, before.refunds)
  assert.equal(after.collected, 4500) // solo el pago corregido del test anterior

  assert.equal((await call('PATCH', `/api/admin/payments/${payment.id}`, { body: { note: 'x' } })).status, 409)
  assert.equal((await call('POST', `/api/admin/payments/${payment.id}/refund`, { body: { amountCents: 100, refundedOn: today, reason: 'No', idempotencyKey: randomUUID() } })).status, 409)
  assert.equal((await call('POST', `/api/admin/payments/${payment.id}/void`, { body: { reason: '' } })).status, 400)
  const listed = ok(await call('GET', '/api/admin/payments?status=voided')).payments
  assert.equal(listed.length, 2)
})
