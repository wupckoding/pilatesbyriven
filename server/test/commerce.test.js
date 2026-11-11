// Fase 2: paquetes, créditos, pagos, Caja y exportación. Incluye los casos de aceptación del documento.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

process.env.NODE_ENV = 'test'
const { pool, db } = await import('../src/db.js')
const { migrate } = await import('../src/migrate.js')
const { createApp } = await import('../src/app.js')
const { todayCR, addDays } = await import('../src/lib/time.js')
const bcrypt = (await import('bcryptjs')).default

let server
let base
let admin
let seq = 0
const today = todayCR()

const call = async (method, path, { token = admin, body } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data = {}
  try { data = JSON.parse(text) } catch { data = { text } }
  return { status: res.status, data, headers: res.headers }
}
const ok = (res, status = 200) => { assert.equal(res.status, status, JSON.stringify(res.data)); return res.data }

const newClient = async () => {
  seq += 1
  return ok(await call('POST', '/api/auth/register', {
    token: null,
    body: { fullName: `Clienta ${seq}`, email: `c${seq}@pagos.local`, password: 'clave-segura-1', whatsapp: `6000${String(1000 + seq)}`, acceptPrivacy: true },
  }), 201)
}
const newSession = async (daysAhead, capacity = 3, time = '10:00') => {
  seq += 1
  return ok(await call('POST', '/api/admin/sessions', {
    body: { name: `Clase ${seq}`, modality: 'reformer', kind: 'group', durationMin: 60, capacity, localDate: addDays(today, daysAhead), localTime: time },
  }), 201).session
}
const newProduct = async (over = {}) => ok(await call('POST', '/api/admin/products', {
  body: { name: 'Paquete mensual', kind: 'package', sessionsCount: 4, priceCents: 8000, currency: 'USD', validityDays: 30, ...over },
}), 201).product
const sell = (clientId, productId, extra = {}) => call('POST', '/api/admin/packages', { body: { clientId, productId, startsOn: today, ...extra } })
const pay = (clientId, packageId, amountCents, extra = {}) => call('POST', '/api/admin/payments', {
  body: { clientId, packageId, amountCents, currency: 'USD', method: 'sinpe', receivedOn: today, verified: true, idempotencyKey: randomUUID(), ...extra },
})
const pkgOf = async (id) => ok(await call('GET', `/api/admin/packages/${id}`))
const taken = async (sessionId) => ok(await call('GET', `/api/admin/sessions/${sessionId}`)).session.taken
const caja = async (from = today, to = today) => ok(await call('GET', `/api/admin/caja?from=${from}&to=${to}`))

before(async () => {
  await pool.query('drop schema public cascade; create schema public;')
  await migrate({ log: () => {} })
  await db.run(`insert into users (email, password_hash, role, full_name) values ($1,$2,'admin','Admin')`,
    ['admin@pagos.local', await bcrypt.hash('admin-clave-segura', 4)])
  server = createApp().listen(0)
  base = `http://127.0.0.1:${server.address().port}`
  admin = ok(await call('POST', '/api/auth/login', { token: null, body: { email: 'admin@pagos.local', password: 'admin-clave-segura' } })).token
})

after(async () => {
  await new Promise((resolve) => server.close(resolve))
  await pool.end()
})

test('catálogo: cambiar el precio no altera paquetes ya vendidos', async () => {
  const product = await newProduct()
  const c = await newClient()
  const sold = ok(await sell(c.client.id, product.id), 201).package
  assert.equal(sold.priceCents, 8000)
  assert.equal(sold.expiresOn, addDays(today, 29))
  ok(await call('PATCH', `/api/admin/products/${product.id}`, { body: { priceCents: 9500, validityDays: 45 } }))
  assert.equal((await pkgOf(sold.id)).package.priceCents, 8000)
  assert.equal((await pkgOf(sold.id)).package.expiresOn, addDays(today, 29))
  const next = ok(await sell(c.client.id, product.id, { startsOn: addDays(today, 30) }), 201).package
  assert.equal(next.priceCents, 9500)
})

test('renovación con pago parcial: saldo visible y confirmación una sola vez', async () => {
  const product = await newProduct()
  const c = await newClient()
  const sessions = [await newSession(2), await newSession(9), await newSession(16), await newSession(23)]
  const pkg = ok(await sell(c.client.id, product.id, { sessionIds: sessions.map((s) => s.id) }), 201).package
  assert.equal(pkg.status, 'pending_payment')
  assert.equal(pkg.reserved, 4)
  assert.equal(pkg.available, 0)
  assert.equal(await taken(sessions[0].id), 1) // el cupo queda retenido

  // Pago parcial: se ve en Caja por lo cobrado y deja saldo abierto.
  const before = (await caja()).totals.USD.collected
  ok(await pay(c.client.id, pkg.id, 3000), 201)
  let detail = await pkgOf(pkg.id)
  assert.equal(detail.package.status, 'pending_payment')
  assert.equal(detail.package.paidCents, 3000)
  assert.equal(detail.package.balanceCents, 5000)
  assert.equal(detail.bookings.every((b) => b.status === 'pending'), true)
  assert.equal((await caja()).totals.USD.collected, before + 3000)
  assert.equal((await caja()).totals.USD.receivable >= 5000, true)

  // Pago por verificar: no suma hasta confirmarlo.
  const pending = ok(await pay(c.client.id, pkg.id, 5000, { verified: false }), 201).payment
  assert.equal((await pkgOf(pkg.id)).package.status, 'pending_payment')
  assert.equal((await pkgOf(pkg.id)).package.toVerifyCents, 5000)
  assert.equal((await caja()).totals.USD.collected, before + 3000)

  // Al verificar se completa: paquete activo y clases confirmadas.
  ok(await call('POST', `/api/admin/payments/${pending.id}/verify`))
  detail = await pkgOf(pkg.id)
  assert.equal(detail.package.status, 'active')
  assert.equal(detail.package.balanceCents, 0)
  assert.equal(detail.bookings.every((b) => b.status === 'confirmed'), true)

  // Repetir la acción no duplica nada.
  ok(await call('POST', `/api/admin/payments/${pending.id}/verify`))
  ok(await call('POST', `/api/admin/payments/${pending.id}/verify`))
  detail = await pkgOf(pkg.id)
  assert.equal(detail.payments.length, 2)
  assert.equal(detail.package.paidCents, 8000)
  assert.equal((await caja()).totals.USD.collected, before + 8000)
})

test('registrar el mismo pago dos veces (doble toque) crea un solo cobro', async () => {
  const product = await newProduct()
  const c = await newClient()
  const pkg = ok(await sell(c.client.id, product.id), 201).package
  const key = randomUUID()
  const results = await Promise.all([1, 2, 3, 4, 5].map(() => pay(c.client.id, pkg.id, 8000, { idempotencyKey: key })))
  assert.equal(results.every((r) => r.status === 200 || r.status === 201), true, JSON.stringify(results.map((r) => r.data)))
  assert.equal(new Set(results.map((r) => r.data.payment.id)).size, 1)
  const detail = await pkgOf(pkg.id)
  assert.equal(detail.payments.length, 1)
  assert.equal(detail.package.paidCents, 8000)
  assert.equal(detail.package.status, 'active')
})

test('renovación con una fecha llena: no se crea nada y se indica la fecha', async () => {
  const product = await newProduct()
  const c = await newClient()
  const free = await newSession(3)
  const full = await newSession(4, 1)
  const other = await newClient()
  ok(await call('POST', '/api/admin/bookings', { body: { sessionId: full.id, clientId: other.client.id } }), 201)
  const res = await sell(c.client.id, product.id, { sessionIds: [free.id, full.id] })
  assert.equal(res.status, 409)
  assert.equal(res.data.code, 'SESSION_FULL')
  assert.equal(res.data.localDate, full.localDate)
  assert.equal(await taken(free.id), 0) // la transacción se deshizo completa
  assert.equal(ok(await call('GET', `/api/admin/packages?clientId=${c.client.id}`)).packages.length, 0)
})

test('cuatro clases y una reposición: mover libera el cupo anterior y conserva el crédito', async () => {
  const product = await newProduct()
  const c = await newClient()
  // Mes con cinco fechas del mismo grupo: el paquete sigue incluyendo cuatro.
  const five = [await newSession(1), await newSession(8), await newSession(15), await newSession(22), await newSession(29)]
  const pkg = ok(await sell(c.client.id, product.id, { sessionIds: five.slice(0, 4).map((s) => s.id) }), 201).package
  ok(await pay(c.client.id, pkg.id, 8000), 201)
  const tooMany = await sell(c.client.id, product.id, { startsOn: addDays(today, 40), sessionIds: five.map((s) => s.id) })
  assert.equal(tooMany.status, 400)

  // Una quinta reserva no gasta un crédito que no existe.
  const fifth = ok(await call('POST', '/api/admin/bookings', { body: { sessionId: five[4].id, clientId: c.client.id } }), 201).booking
  assert.equal(fifth.packageId, null)
  ok(await call('PATCH', `/api/admin/bookings/${fifth.id}`, { body: { status: 'cancelled' } }))

  // Reposición: mover la segunda clase a la quinta fecha.
  let detail = await pkgOf(pkg.id)
  const second = detail.bookings.find((b) => b.sessionId === five[1].id)
  assert.equal(await taken(five[1].id), 1)
  const moved = ok(await call('POST', `/api/admin/bookings/${second.id}/reschedule`, { body: { sessionId: five[4].id, reason: 'Viaje' } }), 201).booking
  assert.equal(moved.packageId, pkg.id)
  assert.equal(moved.rescheduledFromId, second.id)
  assert.equal(await taken(five[1].id), 0)
  assert.equal(await taken(five[4].id), 1)
  detail = await pkgOf(pkg.id)
  assert.equal(detail.package.reserved, 4)
  assert.equal(detail.package.available, 0)
  assert.equal(detail.bookings.length, 4)

  // No se puede mover a una clase llena ni fuera de la vigencia.
  const fullOne = await newSession(5, 1)
  const other = await newClient()
  ok(await call('POST', '/api/admin/bookings', { body: { sessionId: fullOne.id, clientId: other.client.id } }), 201)
  assert.equal((await call('POST', `/api/admin/bookings/${moved.id}/reschedule`, { body: { sessionId: fullOne.id } })).status, 409)
  const late = await newSession(45)
  const outside = await call('POST', `/api/admin/bookings/${moved.id}/reschedule`, { body: { sessionId: late.id } })
  assert.equal(outside.status, 409)
  assert.equal(outside.data.code, 'PACKAGE_EXPIRED')
  assert.equal(await taken(five[4].id), 1)
})

test('ausencia o cancelación: se aplica la regla del paquete y el grupo sigue programado', async () => {
  const product = await newProduct()
  const c = await newClient()
  const mate = await newClient()
  const s = [await newSession(1, 3, '08:00'), await newSession(2, 3, '08:00'), await newSession(3, 3, '08:00'), await newSession(4, 3, '08:00')]
  const pkg = ok(await sell(c.client.id, product.id, { sessionIds: s.map((x) => x.id) }), 201).package
  ok(await pay(c.client.id, pkg.id, 8000), 201)
  ok(await call('POST', '/api/admin/bookings', { body: { sessionId: s[1].id, clientId: mate.client.id } }), 201)
  const bookings = (await pkgOf(pkg.id)).bookings
  const mark = (i, attendance) => call('PATCH', `/api/admin/bookings/${bookings[i].id}`, { body: { attendance } })
  const credits = async () => { const p = (await pkgOf(pkg.id)).package; return [p.used, p.reserved, p.available] }

  ok(await mark(0, 'attended'))
  assert.deepEqual(await credits(), [1, 3, 0])
  ok(await mark(1, 'absent')) // ausencia sin aviso: cuenta como clase tomada
  assert.deepEqual(await credits(), [2, 2, 0])
  // La ausencia es de la clienta: la sesión y la compañera siguen igual.
  const session = ok(await call('GET', `/api/admin/sessions/${s[1].id}`)).session
  assert.equal(session.status, 'scheduled')
  assert.equal(session.taken, 2)

  ok(await mark(2, 'cancelled_notice')) // con aviso: devuelve el crédito y libera el cupo
  assert.deepEqual(await credits(), [2, 1, 1])
  assert.equal(await taken(s[2].id), 0)
  ok(await mark(3, 'cancelled_late')) // tardía: se cobra
  assert.deepEqual(await credits(), [3, 0, 1])

  // La regla es ajustable: si las ausencias no se cobran, el crédito vuelve.
  ok(await call('PUT', '/api/admin/settings', { body: { absentConsumesCredit: false } }))
  assert.deepEqual(await credits(), [2, 0, 2])
  ok(await call('PUT', '/api/admin/settings', { body: { absentConsumesCredit: true } }))

  // El crédito devuelto se usa en otra fecha, una sola vez.
  const extra = await newSession(6)
  const again = ok(await call('POST', '/api/admin/bookings', { body: { sessionId: extra.id, clientId: c.client.id } }), 201).booking
  assert.equal(again.packageId, pkg.id)
  assert.deepEqual(await credits(), [3, 1, 0])
})

test('si el estudio cancela la clase, el crédito vuelve y queda el registro', async () => {
  const product = await newProduct()
  const c = await newClient()
  const s = await newSession(3)
  const pkg = ok(await sell(c.client.id, product.id, { sessionIds: [s.id] }), 201).package
  ok(await pay(c.client.id, pkg.id, 8000), 201)
  assert.equal((await pkgOf(pkg.id)).package.available, 3)
  ok(await call('PATCH', `/api/admin/sessions/${s.id}`, { body: { status: 'cancelled', cancelReason: 'Mantenimiento del Reformer' } }))
  assert.equal((await pkgOf(pkg.id)).package.available, 4)
  const log = await db.one(`select detail from audit_log where action = 'session.update' and entity_id = $1 order by id desc limit 1`, [s.id])
  assert.equal(log.detail.changes.cancelReason, 'Mantenimiento del Reformer')
})

test('último crédito: dos reservas simultáneas no lo gastan dos veces', async () => {
  const product = await newProduct({ name: 'Clase suelta', kind: 'single', sessionsCount: 1, priceCents: 2500 })
  const c = await newClient()
  const pkg = ok(await sell(c.client.id, product.id), 201).package
  ok(await pay(c.client.id, pkg.id, 2500), 201)
  const sessions = [await newSession(2), await newSession(3), await newSession(4), await newSession(5)]
  const results = await Promise.all(sessions.map((s) => call('POST', '/api/admin/bookings', { body: { sessionId: s.id, clientId: c.client.id } })))
  assert.equal(results.every((r) => r.status === 201), true)
  assert.equal(results.filter((r) => r.data.booking.packageId === pkg.id).length, 1)
  const p = (await pkgOf(pkg.id)).package
  assert.deepEqual([p.used, p.reserved, p.available], [0, 1, 0])
})

test('la clienta reserva desde la app y su paquete cubre la clase', async () => {
  const product = await newProduct()
  const c = await newClient()
  const s = await newSession(2)
  const pkg = ok(await sell(c.client.id, product.id), 201).package
  // Sin pagar todavía: la reserva no usa el paquete.
  const early = ok(await call('POST', '/api/bookings', { token: c.token, body: { sessionId: s.id } }), 201).booking
  assert.equal(early.packageId, null)
  ok(await call('POST', `/api/bookings/${early.id}/cancel`, { token: c.token }))
  ok(await pay(c.client.id, pkg.id, 8000), 201)
  const covered = ok(await call('POST', '/api/bookings', { token: c.token, body: { sessionId: s.id } }), 201).booking
  assert.equal(covered.packageId, pkg.id)
  const mine = ok(await call('GET', '/api/packages', { token: c.token })).packages
  assert.equal(mine.length, 1)
  assert.deepEqual([mine[0].sessionsTotal, mine[0].reserved, mine[0].available], [4, 1, 3])
  // Otra clienta no ve este paquete.
  const other = await newClient()
  assert.equal(ok(await call('GET', '/api/packages', { token: other.token })).packages.length, 0)
})

test('retención vencida: liberar el cupo, extender o cancelar', async () => {
  const product = await newProduct()
  const c = await newClient()
  const s = await newSession(6)
  const pkg = ok(await sell(c.client.id, product.id, { sessionIds: [s.id], holdUntil: addDays(today, 2) }), 201).package
  assert.equal(pkg.holdUntil, addDays(today, 2))
  ok(await call('PATCH', `/api/admin/packages/${pkg.id}`, { body: { action: 'extend_hold', holdUntil: addDays(today, 5) } }))
  assert.equal(await taken(s.id), 1)
  ok(await call('PATCH', `/api/admin/packages/${pkg.id}`, { body: { action: 'release_hold' } }))
  assert.equal(await taken(s.id), 0)
  // Un pago que llega después activa el paquete sin clases: hay que revisar disponibilidad y asignarlas.
  ok(await pay(c.client.id, pkg.id, 8000), 201)
  let p = (await pkgOf(pkg.id)).package
  assert.deepEqual([p.status, p.reserved, p.available], ['active', 0, 4])
  // Cancelar exige motivo y conserva el cobro para reasignarlo o reembolsarlo.
  assert.equal((await call('PATCH', `/api/admin/packages/${pkg.id}`, { body: { action: 'cancel' } })).status, 400)
  ok(await call('PATCH', `/api/admin/packages/${pkg.id}`, { body: { action: 'cancel', reason: 'Se muda' } }))
  p = (await pkgOf(pkg.id)).package
  assert.equal(p.status, 'cancelled')
  assert.equal(p.paidCents, 8000)
})

test('excepción autorizada y prórroga quedan con motivo y autor', async () => {
  const product = await newProduct()
  const c = await newClient()
  const s = await newSession(3)
  const pkg = ok(await sell(c.client.id, product.id, { sessionIds: [s.id] }), 201).package
  assert.equal((await call('PATCH', `/api/admin/packages/${pkg.id}`, { body: { action: 'activate_exception' } })).status, 400)
  ok(await call('PATCH', `/api/admin/packages/${pkg.id}`, { body: { action: 'activate_exception', reason: 'Paga el viernes' } }))
  let detail = await pkgOf(pkg.id)
  assert.equal(detail.package.status, 'active')
  assert.equal(detail.package.balanceCents, 8000) // el saldo sigue por cobrar
  assert.equal(detail.bookings[0].status, 'confirmed')
  ok(await call('PATCH', `/api/admin/packages/${pkg.id}`, { body: { action: 'extend_validity', expiresOn: addDays(today, 60), reason: 'Lesión' } }))
  detail = await pkgOf(pkg.id)
  assert.equal(detail.package.expiresOn, addDays(today, 60))
  const logs = await db.query(`select action, actor_id from audit_log where entity = 'package' and entity_id = $1 order by id`, [pkg.id])
  assert.equal(logs.some((l) => l.action === 'package.activate' && l.actorId), true)
  assert.equal(logs.some((l) => l.action === 'package.extend_validity'), true)
})

test('pago en colones para un paquete en dólares guarda el tipo de cambio', async () => {
  const product = await newProduct()
  const c = await newClient()
  const pkg = ok(await sell(c.client.id, product.id), 201).package
  const noRate = await pay(c.client.id, pkg.id, 4000000, { currency: 'CRC' })
  assert.equal(noRate.status, 400)
  const before = (await caja()).totals
  const paid = ok(await pay(c.client.id, pkg.id, 4000000, { currency: 'CRC', fxRate: 500 }), 201).payment // ₡40.000 a ₡500 = US$80
  assert.equal(paid.appliedCents, 8000)
  assert.equal(Number(paid.fxRate), 500)
  assert.equal((await pkgOf(pkg.id)).package.status, 'active')
  const after = (await caja()).totals
  assert.equal(after.CRC.collected, before.CRC.collected + 4000000) // Caja suma el dinero real, por moneda
  assert.equal(after.USD.collected, before.USD.collected)
})

test('reembolso: corrige totales, conserva el historial y no puede exceder el pago', async () => {
  const product = await newProduct()
  const c = await newClient()
  const pkg = ok(await sell(c.client.id, product.id), 201).package
  const payment = ok(await pay(c.client.id, pkg.id, 8000), 201).payment
  const before = (await caja()).totals.USD
  const refund = (amountCents, key = randomUUID()) => call('POST', `/api/admin/payments/${payment.id}/refund`, {
    body: { amountCents, refundedOn: today, reason: 'Clase no tomada', idempotencyKey: key },
  })
  assert.equal((await refund(9000)).status, 409)
  const key = randomUUID()
  ok(await refund(2000, key), 201)
  ok(await refund(2000, key), 201) // reintento: mismo reembolso
  const after = (await caja()).totals.USD
  assert.equal(after.refunds, before.refunds + 2000)
  assert.equal(after.available, before.available - 2000)
  assert.equal(after.collected, before.collected)
  const detail = await pkgOf(pkg.id)
  assert.equal(detail.payments.length, 2)
  assert.equal(detail.package.paidCents, 6000)
  assert.equal((await refund(6001)).status, 409)
  // Un pago por verificar se rechaza con motivo; uno verificado no.
  const pending = ok(await pay(c.client.id, pkg.id, 1000, { verified: false }), 201).payment
  assert.equal((await call('POST', `/api/admin/payments/${pending.id}/reject`, { body: {} })).status, 400)
  ok(await call('POST', `/api/admin/payments/${pending.id}/reject`, { body: { reason: 'Comprobante ilegible' } }))
  assert.equal((await call('POST', `/api/admin/payments/${pending.id}/verify`)).status, 409)
  assert.equal((await call('POST', `/api/admin/payments/${payment.id}/reject`, { body: { reason: 'x y' } })).status, 409)
})

test('cierre de caja y ahorro: el ejemplo del documento concilia', async () => {
  // Período aislado en el pasado para que el ejemplo sea exacto.
  const day = addDays(today, -400)
  const product = await newProduct()
  for (let i = 0; i < 30; i++) {
    const c = await newClient()
    const pkg = ok(await sell(c.client.id, product.id), 201).package
    ok(await pay(c.client.id, pkg.id, 8000, { receivedOn: day }), 201)
  }
  ok(await call('POST', '/api/admin/expenses', { body: { date: day, amountCents: 60000, currency: 'USD', category: 'Alquiler' } }), 201)
  ok(await call('POST', '/api/admin/expenses', { body: { date: day, amountCents: 30000, currency: 'USD', category: 'Equipo', note: 'Resortes' } }), 201)
  const transfer = ok(await call('POST', '/api/admin/transfers', { body: { date: day, amountCents: 120000, currency: 'USD' } }), 201).item
  const summary = await caja(day, day)
  assert.equal(summary.totals.USD.collected, 240000)  // US$2.400
  assert.equal(summary.totals.USD.expenses, 90000)    // US$900
  assert.equal(summary.totals.USD.available, 150000)  // US$1.500
  assert.equal(summary.savings.period, 120000)        // US$1.200
  assert.equal(summary.savings.gapMonth, 30000)       // US$300 frente a la meta de US$1.500
  assert.equal(summary.savings.goalTotal, 1800000)
  assert.equal(summary.paymentsCount, 30)
  // Solo las transferencias registradas aumentan el ahorro; al borrar una, baja.
  ok(await call('DELETE', `/api/admin/transfers/${transfer.id}`))
  assert.equal((await caja(day, day)).savings.period, 0)
  assert.equal((await caja(day, day)).totals.USD.available, 150000)
  assert.equal((await call('POST', '/api/admin/expenses', { body: { date: addDays(today, 3), amountCents: 100, currency: 'USD', category: 'Otro' } })).status, 400)
})

test('pago adelantado: el cobro queda en su fecha y el paquete en su ciclo', async () => {
  const product = await newProduct()
  const c = await newClient()
  const cycleStart = addDays(today, 35)
  const paidOn = addDays(today, -1)
  const pkg = ok(await sell(c.client.id, product.id, { startsOn: cycleStart }), 201).package
  const before = (await caja(paidOn, paidOn)).totals.USD.collected
  ok(await pay(c.client.id, pkg.id, 8000, { receivedOn: paidOn }), 201)
  assert.equal((await caja(paidOn, paidOn)).totals.USD.collected, before + 8000)
  assert.equal((await caja(cycleStart, addDays(cycleStart, 29))).totals.USD.collected, 0)
  const detail = await pkgOf(pkg.id)
  assert.equal(detail.package.startsOn, cycleStart)
  assert.equal(detail.payments[0].receivedOn, paidOn)
  assert.equal((await pay(c.client.id, pkg.id, 100, { receivedOn: addDays(today, 2) })).status, 400)
})

test('exportación CSV respeta los filtros y concilia con la lista', async () => {
  const day = addDays(today, -400)
  const list = ok(await call('GET', `/api/admin/payments?from=${day}&to=${day}&status=verified`)).payments
  const res = await call('GET', `/api/admin/export/payments.csv?from=${day}&to=${day}&status=verified`)
  assert.equal(res.status, 200)
  assert.match(res.headers.get('content-type'), /text\/csv/)
  const lines = res.data.text.trim().split('\r\n')
  assert.equal(lines.length - 1, list.length)
  assert.equal(lines[0].replace('﻿', '').startsWith('Fecha de recepción;Tipo;Estado'), true)
  const total = lines.slice(1).reduce((sum, line) => sum + Number(line.split(';')[10]), 0)
  assert.equal(Math.round(total * 100), list.reduce((sum, y) => sum + y.amountCents, 0))
  const expenses = await call('GET', `/api/admin/export/expenses.csv?from=${day}&to=${day}`)
  assert.equal(expenses.data.text.trim().split('\r\n').length, 3)
})

test('solo administración accede a paquetes, pagos y Caja', async () => {
  const c = await newClient()
  for (const path of ['/api/admin/products', '/api/admin/packages', '/api/admin/payments', '/api/admin/caja', '/api/admin/expenses',
    '/api/admin/transfers', '/api/admin/export/payments.csv']) {
    assert.equal((await call('GET', path, { token: c.token })).status, 403, path)
    assert.equal((await call('GET', path, { token: null })).status, 401, path)
  }
  assert.equal((await call('POST', '/api/admin/payments', { token: c.token, body: {} })).status, 403)
  // Entradas inválidas no rompen el servidor.
  assert.equal((await call('POST', '/api/admin/payments', { body: { clientId: c.client.id, amountCents: -5 } })).status, 400)
  assert.equal((await call('POST', '/api/admin/payments', { body: { clientId: c.client.id, amountCents: 10.5, currency: 'USD', method: 'sinpe', receivedOn: today, verified: true, idempotencyKey: randomUUID() } })).status, 400)
  assert.equal((await call('GET', '/api/admin/caja?from=2026-05-10&to=2026-05-01')).status, 400)
})
