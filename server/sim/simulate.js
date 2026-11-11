// Simulación de uso real: cientos de clientas virtuales y la administración actuando a la vez
// contra la API completa, con comprobación de invariantes de negocio al final.
//
//   npm run simulate                      (1000 usuarias)
//   SIM_USERS=200 SIM_CONCURRENCY=40 SIM_SEED=7 npm run simulate
//
// Usa su propia base (SIM_DATABASE_URL, por defecto pilates_sim) y la borra al empezar.
import { randomUUID } from 'node:crypto'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { performance } from 'node:perf_hooks'

const here = dirname(fileURLToPath(import.meta.url))
const USERS = Number(process.env.SIM_USERS || 1000)
const CONCURRENCY = Number(process.env.SIM_CONCURRENCY || 60)
const SEED = Number(process.env.SIM_SEED || 20261111)

process.env.NODE_ENV = 'test' // sin límite de peticiones por IP: aquí todas salen de la misma máquina
process.env.TEST_DATABASE_URL = process.env.SIM_DATABASE_URL || 'postgres://riven@127.0.0.1:5433/pilates_sim'
process.env.UPLOADS_DIR = mkdtempSync(join(tmpdir(), 'riven-sim-'))

const { pool, db } = await import('../src/db.js')
const { migrate } = await import('../src/migrate.js')
const { createApp } = await import('../src/app.js')
const { todayCR, addDays } = await import('../src/lib/time.js')
const bcrypt = (await import('bcryptjs')).default

// ─── Azar reproducible ───────────────────────────────────
let seed = SEED >>> 0
const rnd = () => { seed += 0x6D2B79F5; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
const chance = (p) => rnd() < p
const pick = (list) => list[Math.floor(rnd() * list.length)]
const sample = (list, n) => [...list].sort(() => rnd() - 0.5).slice(0, n)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ─── Registro de resultados ──────────────────────────────
const stats = new Map()      // acción → { n, ms[], statuses{} }
const unexpected = []        // respuestas fuera de lo esperado
const violations = []        // invariantes rotos
let requests = 0
const today = todayCR()
const SENTINEL = 'ZZ-DATO-CLINICO-SECRETO-ZZ'

let base
async function req(name, method, path, { token, body, expect, raw } = {}) {
  const started = performance.now()
  let status = 0
  let data = {}
  try {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined,
    })
    status = res.status
    const text = await res.text()
    try { data = JSON.parse(text) } catch { data = { text: text.slice(0, 200) } }
  } catch (err) {
    data = { error: `fallo de red: ${err.message}` }
  }
  const ms = performance.now() - started
  requests += 1
  const s = stats.get(name) || { n: 0, ms: [], statuses: {} }
  s.n += 1; s.ms.push(ms); s.statuses[status] = (s.statuses[status] || 0) + 1
  stats.set(name, s)
  if (status >= 500 || status === 0 || (expect && !expect.includes(status))) {
    unexpected.push({ name, method, path: path.slice(0, 90), status, expected: expect, code: data.code, error: data.error })
  }
  return { status, data }
}
const violate = (rule, detail) => { if (violations.length < 200) violations.push({ rule, detail }) }

// ─── Preparación ─────────────────────────────────────────
console.log(`Simulación: ${USERS} usuarias, concurrencia ${CONCURRENCY}, semilla ${SEED}`)
await pool.query('drop schema public cascade; create schema public;')
await migrate({ log: () => {} })
const staffHash = await bcrypt.hash('clave-del-personal-sim', 4)
await db.run(`insert into users (email, password_hash, role, full_name) values ($1,$2,'admin','Riven'), ($3,$2,'instructor','Instructora Sim')`,
  ['admin@sim.local', staffHash, 'inst@sim.local'])
const server = createApp().listen(0)
base = `http://127.0.0.1:${server.address().port}`

const admin = (await req('setup', 'POST', '/api/auth/login', { body: { email: 'admin@sim.local', password: 'clave-del-personal-sim' }, expect: [200] })).data.token
const instructor = (await req('setup', 'POST', '/api/auth/login', { body: { email: 'inst@sim.local', password: 'clave-del-personal-sim' }, expect: [200] })).data.token
await req('setup', 'PUT', '/api/admin/settings', { token: admin, body: { sinpeNumber: '8888 0000', sinpeName: 'Estudio Sim' }, expect: [200] })
const products = {}
for (const [name, kind, n, price] of [['Clase de prueba', 'trial', 1, 1500], ['Clase suelta', 'single', 1, 2500], ['Paquete mensual', 'package', 4, 8000]]) {
  products[kind] = (await req('setup', 'POST', '/api/admin/products', { token: admin, body: { name, kind, sessionsCount: n, priceCents: price, currency: 'USD', validityDays: 30 }, expect: [201] })).data.product
}
// Los 10 grupos del estudio (3 cupos) y, para que haya dónde reservar con tanta gente, 14 clases abiertas más grandes.
const slots = [[2, '18:00'], [2, '19:15'], [3, '18:30'], [4, '18:00'], [4, '19:15'], [6, '13:00'], [6, '15:00'], [6, '16:30'], [0, '15:00'], [0, '16:30']]
const groups = []
for (const [weekday, startTime] of slots) {
  groups.push((await req('setup', 'POST', '/api/admin/groups', { token: admin, body: { name: `Grupo ${weekday}-${startTime}`, modality: 'reformer', kind: 'group', weekday, startTime, durationMin: 60, capacity: 3 }, expect: [201] })).data.group)
}
for (let i = 1; i <= 14; i++) {
  await req('setup', 'POST', '/api/admin/sessions', { token: admin, body: { name: `Mat abierta ${i}`, modality: 'mat', kind: 'group', durationMin: 60, capacity: 12, localDate: addDays(today, i), localTime: '09:00' }, expect: [201] })
}
const agenda = (await req('setup', 'GET', `/api/admin/agenda?from=${today}&to=${addDays(today, 28)}`, { token: admin, expect: [200] })).data.sessions
const future = agenda.filter((s) => new Date(s.startsAt) > new Date(Date.now() + 3 * 3600e3))
const hot = future.filter((s) => s.capacity === 3).slice(0, 6)   // las clases que todas quieren
const pngProof = Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), Buffer.alloc(900, 3)]).toString('base64')
const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(500, 9)]).toString('base64')

// Estado compartido entre actores (lo que una atacante podría llegar a conocer).
const pool_ = { orders: [], bookings: [], clients: [], payments: [] }
let usersDone = 0

// ─── Clienta virtual ─────────────────────────────────────
const NAMES = ['María José Solís', 'Ana Lucía Ñandú', 'Sofía O’Connor', '<script>alert(1)</script>', "Robert'); DROP TABLE users;--", '李娜', 'Zoë Müller-Åkesson', 'A'.repeat(120), 'Valeria  Mora', '🧘 Camila']
const PERSONAS = [['package', 0.34], ['trial', 0.24], ['single', 0.14], ['browser', 0.16], ['attacker', 0.12]]
const persona = () => { let x = rnd(); for (const [name, p] of PERSONAS) { if ((x -= p) < 0) return name } return 'browser' }
const doubleTap = (fn) => Promise.all([fn(), fn()])

async function bookSome(u, count, { waitlist = false } = {}) {
  const targets = sample([...hot, ...hot, ...sample(future, 12)], count)
  const results = await Promise.all(targets.map((s) => doubleTap(() => req('reservar', 'POST', '/api/bookings', {
    token: u.token, body: { sessionId: s.id, joinWaitlist: waitlist && chance(0.5) }, expect: [200, 201, 409],
  }))))
  for (const [a, b] of results) {
    const okBoth = [a, b].filter((r) => r.status < 300)
    if (okBoth.length === 2 && a.data.booking.id !== b.data.booking.id) violate('doble toque creó dos reservas', { user: u.email })
    for (const r of okBoth) if (!u.bookings.includes(r.data.booking.id)) { u.bookings.push(r.data.booking.id); pool_.bookings.push(r.data.booking.id) }
    for (const r of [a, b]) if (r.status === 409 && !['SESSION_FULL', 'SESSION_CANCELLED', 'SESSION_PAST', 'SESSION_BLOCKED'].includes(r.data.code)) violate('409 inesperado al reservar', r.data)
  }
}

async function order(u, kind, withSession) {
  const key = randomUUID()
  const sessionId = withSession ? pick(chance(0.6) ? hot : future).id : null
  const [a, b] = await doubleTap(() => req('orden', 'POST', '/api/orders', { token: u.token, body: { productId: products[kind].id, sessionId, orderKey: key }, expect: [201, 409] }))
  const created = [a, b].filter((r) => r.status === 201)
  if (created.length === 2 && a.data.package.id !== b.data.package.id) violate('doble toque creó dos órdenes', { user: u.email })
  if (!created.length) return null
  const id = created[0].data.package.id
  pool_.orders.push(id)
  return id
}

async function payByProof(u, orderId) {
  await req('info de pago', 'GET', `/api/orders/${orderId}/payment`, { token: u.token, expect: [200] })
  const [a, b] = await doubleTap(() => req('comprobante', 'POST', `/api/orders/${orderId}/proof`, { token: u.token, body: { data: pngProof, reference: `SINPE-${Math.floor(rnd() * 1e6)}` }, expect: [201, 409] }))
  if (a.status === 201 && b.status === 201) violate('doble toque registró dos comprobantes', { orderId })
}

async function waitActive(u, orderId, tries = 12) {
  for (let i = 0; i < tries; i++) {
    const res = await req('mis paquetes', 'GET', '/api/packages', { token: u.token, expect: [200] })
    const pkg = res.data.packages?.find((p) => p.id === orderId)
    if (pkg?.status === 'active') return pkg
    await sleep(120 + rnd() * 200)
  }
  return null
}

async function attack(u) {
  const other = pick(pool_.orders) || randomUUID()
  const otherBooking = pick(pool_.bookings) || randomUUID()
  const otherClient = pick(pool_.clients) || randomUUID()
  const otherPayment = pick(pool_.payments) || randomUUID()
  const forbidden = [
    ['GET', '/api/admin/dashboard'], ['GET', '/api/admin/clients'], ['GET', `/api/admin/clients/${otherClient}`], ['GET', '/api/admin/caja'],
    ['GET', '/api/admin/payments'], ['GET', '/api/admin/export/payments.csv'], ['GET', `/api/admin/clients/${otherClient}/intake`],
    ['POST', `/api/admin/clients/${otherClient}/intake/reveal`, {}], ['GET', `/api/admin/payments/${otherPayment}/proof`],
    ['POST', `/api/admin/payments/${otherPayment}/verify`, {}], ['PUT', '/api/admin/settings', { intakeRequired: false }],
    ['POST', '/api/admin/payments', { clientId: otherClient, amountCents: 1, currency: 'USD', method: 'cash', receivedOn: today, verified: true, idempotencyKey: randomUUID() }],
    ['PATCH', `/api/admin/bookings/${otherBooking}`, { status: 'confirmed' }], ['PUT', `/api/admin/packages/${other}/payment-link`, { paymentLink: 'https://mal.test' }],
  ]
  for (const [method, path, body] of sample(forbidden, 7)) await req('ataque: panel', method, path, { token: u.token, body, expect: [403] })
  // Datos de otra clienta: deben comportarse como si no existieran.
  await req('ataque: orden ajena', 'GET', `/api/orders/${other}/payment`, { token: u.token, expect: [404] })
  await req('ataque: comprobante ajeno', 'POST', `/api/orders/${other}/proof`, { token: u.token, body: { data: pngProof }, expect: [404] })
  await req('ataque: cancelar ajena', 'POST', `/api/bookings/${otherBooking}/cancel`, { token: u.token, expect: [404] })
  await req('ataque: cancelar orden ajena', 'POST', `/api/orders/${other}/cancel`, { token: u.token, expect: [404] })
  // Entradas malformadas: siempre 4xx, nunca 500.
  const bad = [
    ['POST', '/api/bookings', { sessionId: "1' OR '1'='1" }, [400]], ['POST', '/api/bookings', { sessionId: null }, [400]],
    ['POST', '/api/bookings/abc/cancel', undefined, [400]], ['GET', '/api/sessions?from=2026-99-99&to=x', undefined, [400]],
    ['POST', '/api/orders', { productId: randomUUID(), orderKey: randomUUID() }, [404, 409]], ['POST', '/api/orders', { productId: 'x' }, [400]],
    ['POST', '/api/intake', { answers: { conditions: ['<img src=x>'] }, consent: { accepted: true, fullName: 'X Y Z' } }, [400]],
    ['POST', '/api/intake', { answers: { painLevel: 99 }, consent: { accepted: true, fullName: 'X Y Z' } }, [400]],
    ['PATCH', '/api/auth/me', { whatsapp: 'no-es-un-numero' }, [400]], ['GET', '/api/no/existe', undefined, [404]],
  ]
  for (const [method, path, body, expect] of sample(bad, 6)) await req('ataque: entrada inválida', method, path, { token: u.token, body, expect })
  await req('ataque: json roto', 'POST', '/api/bookings', { token: u.token, raw: '{"sessionId": ', expect: [400] })
  await req('ataque: cuerpo enorme', 'POST', '/api/bookings', { token: u.token, raw: JSON.stringify({ sessionId: 'x'.repeat(300_000) }), expect: [413] })
  await req('ataque: token falso', 'GET', '/api/auth/me', { token: `${u.token.slice(0, -6)}AAAAAA`, expect: [401] })
  await req('ataque: sin sesión', 'GET', '/api/bookings', { expect: [401] })
  if (u.orderId) await req('ataque: archivo disfrazado', 'POST', `/api/orders/${u.orderId}/proof`, { token: u.token, body: { data: exe }, expect: [400, 409] })
}

async function journey(i) {
  const u = { email: `u${i}@sim.local`, password: `clave-sim-${i}-xyz`, bookings: [], kind: persona() }
  await sleep(rnd() * 40)
  const reg = await req('registro', 'POST', '/api/auth/register', {
    body: { fullName: chance(0.1) ? pick(NAMES) : `Clienta Sim ${i}`, email: u.email, password: u.password, whatsapp: `6${String(1000000 + i)}`, acceptPrivacy: true, role: 'admin' },
    expect: [201],
  })
  if (reg.status !== 201) return
  u.token = reg.data.token
  pool_.clients.push(reg.data.client.id)
  if (reg.data.user.role !== 'client') violate('el registro permitió elegir rol', { email: u.email })
  if (chance(0.03)) await req('registro repetido', 'POST', '/api/auth/register', { body: { fullName: 'Otra', email: u.email.toUpperCase(), password: u.password, whatsapp: '88887777', acceptPrivacy: true }, expect: [409] })

  // Antes de la admisión no se puede reservar ni comprar.
  if (chance(0.3)) {
    const r = await req('reservar sin admisión', 'POST', '/api/bookings', { token: u.token, body: { sessionId: pick(future).id }, expect: [409] })
    if (r.data.code !== 'INTAKE_REQUIRED') violate('reservó sin pasar por admisión', r.data)
  }
  if (chance(0.12)) return // abandona antes del formulario

  const health = chance(0.4)
  const intake = await req('admisión', 'POST', '/api/intake', {
    token: u.token,
    body: {
      personal: { birthDate: chance(0.6) ? '1991-04-12' : null, emergencyName: 'Contacto', emergencyPhone: '8888 1111' },
      answers: health
        ? { conditions: sample(['rodilla', 'cadera', 'cirugias', 'embarazo', 'otras'], 2), surgeriesDetail: SENTINEL, otherConditionsDetail: SENTINEL, careNotes: SENTINEL, activeInjury: pick(['yes', 'no']), painLevel: 1 + Math.floor(rnd() * 10), goals: ['core'] }
        : { goals: sample(['core', 'postura', 'bienestar'], 2), exercises: ['yoga'], weeklyFrequency: 2, schedules: ['tarde'] },
      consent: { accepted: true, fullName: `Clienta Sim ${i}` },
    },
    expect: [201],
  })
  if (intake.status !== 201) return
  if ((intake.data.status === 'needs_review') !== health) violate('estado de admisión incorrecto', { health, status: intake.data.status })
  await req('ver horarios', 'GET', `/api/sessions?from=${today}&to=${addDays(today, 21)}`, { token: u.token, expect: [200] })

  if (u.kind === 'package' || u.kind === 'single') {
    u.orderId = await order(u, u.kind, u.kind === 'single' && chance(0.6))
    if (u.orderId && chance(0.85)) {
      await payByProof(u, u.orderId)
      const active = await waitActive(u, u.orderId)
      if (active) {
        await bookSome(u, u.kind === 'package' ? 3 + Math.floor(rnd() * 4) : 1, { waitlist: true })
        const mine = await req('mis paquetes', 'GET', '/api/packages', { token: u.token, expect: [200] })
        const p = mine.data.packages?.find((x) => x.id === u.orderId)
        if (p && p.used + p.reserved > p.sessionsTotal) violate('paquete con más clases que créditos', p)
      }
    } else if (u.orderId && chance(0.4)) {
      await req('cancelar orden', 'POST', `/api/orders/${u.orderId}/cancel`, { token: u.token, expect: [200, 409] })
    }
  } else if (u.kind === 'trial') {
    u.orderId = await order(u, 'trial', true)
    if (u.orderId && chance(0.7)) await payByProof(u, u.orderId)
    // Otra prueba no se puede.
    const again = await req('segunda prueba', 'POST', '/api/orders', { token: u.token, body: { productId: products.trial.id, orderKey: randomUUID() }, expect: u.orderId ? [409] : [201, 409] })
    if (u.orderId && again.status === 201) violate('dos clases de prueba para la misma clienta', { email: u.email })
  } else if (u.kind === 'browser') {
    await bookSome(u, 2 + Math.floor(rnd() * 3), { waitlist: true })
  } else {
    await attack(u)
  }

  // Vida normal después: mirar, cancelar, editar el perfil.
  const mine = await req('mis clases', 'GET', '/api/bookings', { token: u.token, expect: [200] })
  for (const b of (mine.data.upcoming || [])) {
    if (chance(0.2)) await doubleTap(() => req('cancelar reserva', 'POST', `/api/bookings/${b.id}/cancel`, { token: u.token, expect: [200, 409] }))
  }
  if (chance(0.1)) await req('editar perfil', 'PATCH', '/api/auth/me', { token: u.token, body: { fullName: `Clienta Editada ${i}`, emergencyName: pick(NAMES).slice(0, 100) }, expect: [200] })
  if (chance(0.03)) {
    const changed = await req('cambiar contraseña', 'POST', '/api/auth/change-password', { token: u.token, body: { currentPassword: u.password, newPassword: `${u.password}-nueva` }, expect: [200] })
    const old = await req('token viejo', 'GET', '/api/auth/me', { token: u.token, expect: [401] })
    if (old.status === 200) violate('el token anterior siguió sirviendo tras cambiar la contraseña', { email: u.email })
    if (changed.data.token) { u.token = changed.data.token; u.password = `${u.password}-nueva` }
  }
  if (chance(0.02)) {
    await req('eliminar cuenta', 'DELETE', '/api/auth/me', { token: u.token, body: { password: u.password }, expect: [200] })
    const gone = await req('cuenta eliminada', 'GET', '/api/auth/me', { token: u.token, expect: [401] })
    if (gone.status === 200) violate('una cuenta eliminada siguió con acceso', { email: u.email })
  }
}

// ─── Administración trabajando al mismo tiempo ───────────
async function adminWorker(n) {
  while (usersDone < USERS) {
    const pending = await req('admin: pagos por verificar', 'GET', '/api/admin/payments?status=to_verify', { token: admin, expect: [200] })
    for (const y of sample(pending.data.payments || [], 25)) {
      pool_.payments.push(y.id)
      if (chance(0.06)) await req('admin: rechazar pago', 'POST', `/api/admin/payments/${y.id}/reject`, { token: admin, body: { reason: 'Comprobante ilegible' }, expect: [200, 409] })
      else await doubleTap(() => req('admin: verificar pago', 'POST', `/api/admin/payments/${y.id}/verify`, { token: admin, expect: [200, 409] }))
      if (chance(0.3)) await req('admin: ver comprobante', 'GET', `/api/admin/payments/${y.id}/proof`, { token: admin, expect: [200] })
    }
    const toConfirm = await req('admin: por confirmar', 'GET', '/api/admin/bookings?view=pending', { token: admin, expect: [200] })
    for (const b of sample(toConfirm.data.bookings || [], 15)) {
      await req('admin: confirmar reserva', 'PATCH', `/api/admin/bookings/${b.id}`, { token: admin, body: { status: chance(0.9) ? 'confirmed' : 'cancelled' }, expect: [200, 409] })
    }
    const waiting = await req('admin: lista de espera', 'GET', '/api/admin/bookings?view=waitlist', { token: admin, expect: [200] })
    for (const b of sample(waiting.data.bookings || [], 6)) {
      await req('admin: dar cupo', 'PATCH', `/api/admin/bookings/${b.id}`, { token: admin, body: { status: 'confirmed' }, expect: [200, 409] })
    }
    // Operación diaria al azar.
    const roll = rnd()
    const booking = pick(pool_.bookings)
    const client = pick(pool_.clients)
    if (roll < 0.25 && booking) {
      await req('admin: asistencia', 'PATCH', `/api/admin/bookings/${booking}`, { token: admin, body: { attendance: pick(['attended', 'absent', 'cancelled_notice', 'cancelled_late', 'made_up', null]) }, expect: [200, 409] })
    } else if (roll < 0.45 && booking) {
      await req('admin: mover reserva', 'POST', `/api/admin/bookings/${booking}/reschedule`, { token: admin, body: { sessionId: pick(future).id, reason: 'Reposición' }, expect: [201, 400, 409] })
    } else if (roll < 0.6 && client) {
      const sessions = sample(groups, 1).flatMap((g) => future.filter((s) => s.groupId === g.id).slice(0, 4)).map((s) => s.id)
      const sold = await req('admin: vender paquete', 'POST', '/api/admin/packages', { token: admin, body: { clientId: client, productId: products.package.id, startsOn: today, sessionIds: sessions }, expect: [201, 404, 409] })
      if (sold.status === 201) {
        const key = randomUUID()
        const id = sold.data.package.id
        await req('admin: pago parcial', 'POST', '/api/admin/payments', { token: admin, body: { clientId: client, packageId: id, amountCents: 3000, currency: 'USD', method: 'sinpe', receivedOn: today, verified: true, idempotencyKey: randomUUID() }, expect: [201, 409] })
        const [a, b] = await doubleTap(() => req('admin: completar pago', 'POST', '/api/admin/payments', { token: admin, body: { clientId: client, packageId: id, amountCents: 5000, currency: 'USD', method: 'card', receivedOn: today, verified: true, idempotencyKey: key }, expect: [200, 201, 409] }))
        if (a.status < 300 && b.status < 300 && a.data.payment.id !== b.data.payment.id) violate('doble toque duplicó un pago', { id })
        if (chance(0.3)) await req('admin: cancelar paquete', 'PATCH', `/api/admin/packages/${id}`, { token: admin, body: { action: 'cancel', reason: 'Simulación' }, expect: [200] })
      }
    } else if (roll < 0.68) {
      const s = pick(future)
      await req('admin: cancelar clase', 'PATCH', `/api/admin/sessions/${s.id}`, { token: admin, body: { status: 'cancelled', cancelReason: 'Simulación' }, expect: [200] })
      await sleep(30)
      await req('admin: reactivar clase', 'PATCH', `/api/admin/sessions/${s.id}`, { token: admin, body: { status: 'scheduled' }, expect: [200] })
    } else if (roll < 0.78) {
      await req('admin: gasto', 'POST', '/api/admin/expenses', { token: admin, body: { date: today, amountCents: 100 + Math.floor(rnd() * 9000), currency: pick(['USD', 'CRC']), category: 'Otro' }, expect: [201] })
      await req('admin: transferencia', 'POST', '/api/admin/transfers', { token: admin, body: { date: today, amountCents: 5000, currency: 'USD' }, expect: [201] })
    } else if (roll < 0.86) {
      const paid = await req('admin: pagos verificados', 'GET', '/api/admin/payments?status=verified', { token: admin, expect: [200] })
      const y = pick((paid.data.payments || []).filter((p) => p.kind === 'payment'))
      if (y) await req('admin: reembolso', 'POST', `/api/admin/payments/${y.id}/refund`, { token: admin, body: { amountCents: 500, refundedOn: today, reason: 'Simulación', idempotencyKey: randomUUID() }, expect: [201, 409] })
    } else if (client) {
      await req('admin: ficha', 'GET', `/api/admin/clients/${client}`, { token: admin, expect: [200, 404] })
      await req('admin: ver respuestas', 'POST', `/api/admin/clients/${client}/intake/reveal`, { token: admin, body: {}, expect: [200, 404] })
      await req('instructora: respuestas', 'POST', `/api/admin/clients/${client}/intake/reveal`, { token: instructor, body: {}, expect: [403] })
    }
    if (n === 0) {
      await req('admin: inicio', 'GET', '/api/admin/dashboard', { token: admin, expect: [200] })
      await req('admin: caja', 'GET', '/api/admin/caja', { token: admin, expect: [200] })
      await req('instructora: agenda', 'GET', `/api/admin/agenda?from=${today}&to=${addDays(today, 7)}`, { token: instructor, expect: [200] })
    }
    await sleep(40)
  }
}

// Vigilancia continua: en ningún instante una clase puede pasar de su capacidad.
let peakOversell = 0
const watchdog = setInterval(async () => {
  const rows = await db.query(
    `select s.id, s.capacity, count(*)::int as taken from class_sessions s join bookings b on b.session_id = s.id
      where b.status in ('pending','confirmed') group by s.id having count(*) > s.capacity`).catch(() => [])
  if (rows.length) { peakOversell = Math.max(peakOversell, rows.length); violate('clase por encima de su capacidad (durante la corrida)', rows[0]) }
}, 700)

// ─── Corrida ─────────────────────────────────────────────
const started = performance.now()
let next = 0
const worker = async () => { while (next < USERS) { const i = ++next; try { await journey(i) } catch (err) { violate('excepción en el recorrido', { i, error: err.message }) } usersDone += 1; if (usersDone % 100 === 0) console.log(`  ${usersDone}/${USERS} usuarias · ${requests} peticiones`) } }
await Promise.all([...Array.from({ length: CONCURRENCY }, worker), adminWorker(0), adminWorker(1), adminWorker(2)])
clearInterval(watchdog)
const seconds = (performance.now() - started) / 1000

// ─── Invariantes finales (consultas directas, independientes de la API) ──
const check = async (rule, sql, params = []) => { const rows = await db.query(sql, params); if (rows.length) violate(rule, { casos: rows.length, ejemplo: rows[0] }); return rows.length }
const checks = []
const run = async (rule, sql, params) => checks.push([rule, await check(rule, sql, params)])
await run('ninguna clase supera su capacidad',
  `select s.id, s.capacity, count(*)::int as taken from class_sessions s join bookings b on b.session_id = s.id
    where b.status in ('pending','confirmed') group by s.id having count(*) > s.capacity`)
await run('una clienta no tiene dos reservas vivas en la misma clase',
  `select session_id, client_id from bookings where status in ('pending','confirmed','waitlisted') group by 1,2 having count(*) > 1`)
await run('ningún paquete tiene más clases cubiertas que créditos',
  `select p.id, p.sessions_total, count(*)::int as usadas from client_packages p join bookings b on b.package_id = p.id join class_sessions s on s.id = b.session_id
    where (b.attendance in ('attended','made_up','absent','cancelled_late')) or (b.status in ('pending','confirmed') and b.attendance is null and s.status = 'scheduled')
    group by p.id having count(*) > p.sessions_total`)
await run('ningún paquete activo sin estar pagado (salvo excepción autorizada)',
  `select p.id from client_packages p
    where p.status = 'active' and p.exception_reason = ''
      and p.price_cents > coalesce((select sum(case when kind='payment' then applied_cents when kind='refund' then -applied_cents else 0 end)
                                      from payments y where y.package_id = p.id and y.status = 'verified'), 0)
      and not exists (select 1 from payments r where r.package_id = p.id and r.kind = 'refund')`)
await run('ningún paquete pagado quedó sin activar',
  `select p.id from client_packages p
    where p.status = 'pending_payment'
      and p.price_cents <= coalesce((select sum(case when kind='payment' then applied_cents when kind='refund' then -applied_cents else 0 end)
                                       from payments y where y.package_id = p.id and y.status = 'verified'), 0)`)
await run('las clases retenidas de un paquete activo quedaron confirmadas',
  `select b.id from bookings b join client_packages p on p.id = b.package_id where p.status = 'active' and b.status = 'pending' and b.created_at < p.activated_at and b.updated_at < p.activated_at`)
await run('IDs de alumna únicos', 'select student_number from clients group by 1 having count(*) > 1')
await run('máximo una clase de prueba vigente por clienta', `select client_id from client_packages where kind = 'trial' and status <> 'cancelled' group by 1 having count(*) > 1`)
await run('ningún pago duplicado por la misma clave', 'select idempotency_key from payments where idempotency_key is not null group by 1 having count(*) > 1')
await run('ningún reembolso supera su pago',
  `select y.id from payments y where y.kind = 'payment'
      and y.amount_cents < coalesce((select sum(amount_cents) from payments r where r.related_payment_id = y.id and r.kind = 'refund'), 0)`)
await run('un solo comprobante por verificar por orden', `select package_id from payments where status = 'to_verify' and kind = 'payment' and proof_path is not null group by 1 having count(*) > 1`)
await run('las respuestas clínicas están cifradas en la base', `select id from intake_submissions where answers_enc like '%' || $1 || '%' or answers_enc not like 'v1.%'`, [SENTINEL])
await run('la auditoría no guarda contenido clínico', `select id from audit_log where detail::text like '%' || $1 || '%'`, [SENTINEL])
await run('una cuenta eliminada no conserva reservas futuras vivas',
  `select b.id from bookings b join clients c on c.id = b.client_id join class_sessions s on s.id = b.session_id
    where c.archived_at is not null and b.status in ('pending','confirmed','waitlisted') and s.starts_at > now() and b.created_at < c.archived_at`)

// Caja debe coincidir con la suma independiente de los pagos.
const caja = (await req('cierre', 'GET', `/api/admin/caja?from=${today}&to=${today}`, { token: admin, expect: [200] })).data
const truth = await db.query(`select currency, kind, sum(amount_cents)::int as total from payments where status = 'verified' and received_on = $1 group by 1,2`, [today])
const sumOf = (cur, kind) => truth.find((r) => r.currency === cur && r.kind === kind)?.total || 0
const exp = await db.query('select currency, sum(amount_cents)::int as total from expenses where spent_on = $1 group by 1', [today])
for (const cur of ['USD', 'CRC']) {
  const e = exp.find((r) => r.currency === cur)?.total || 0
  const t = caja.totals?.[cur] || {}
  if (t.collected !== sumOf(cur, 'payment') || t.refunds !== sumOf(cur, 'refund') || t.expenses !== e || t.available !== sumOf(cur, 'payment') - sumOf(cur, 'refund') - e) {
    violate('Caja no concilia con los registros', { cur, caja: t, pagos: sumOf(cur, 'payment'), reembolsos: sumOf(cur, 'refund'), gastos: e })
  }
}
checks.push(['Caja concilia con la suma de pagos, reembolsos y gastos', violations.filter((v) => v.rule.startsWith('Caja')).length])

// Las respuestas clínicas no aparecen en ninguna vista operativa.
let leaks = 0
for (const path of ['/api/admin/clients?limit=200', '/api/admin/dashboard', '/api/admin/caja', '/api/admin/payments', '/api/admin/packages', '/api/admin/export/payments.csv',
  `/api/admin/agenda?from=${today}&to=${addDays(today, 28)}`, '/api/admin/bookings?view=pending']) {
  const res = await req('fuga de datos clínicos', 'GET', path, { token: admin, expect: [200] })
  if (JSON.stringify(res.data).includes(SENTINEL)) { leaks += 1; violate('respuestas clínicas visibles fuera de admisión', { path }) }
}
checks.push(['las respuestas clínicas no aparecen en listas, agenda, Caja ni exportaciones', leaks])

// ─── Informe ─────────────────────────────────────────────
const pct = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : 0 }
const all = [...stats.values()].flatMap((s) => s.ms)
const counts = await db.one(
  `select (select count(*)::int from clients) as clientas, (select count(*)::int from bookings) as reservas,
          (select count(*)::int from client_packages) as paquetes, (select count(*)::int from payments) as pagos,
          (select count(*)::int from intake_submissions) as formularios, (select count(*)::int from audit_log) as auditoria,
          (select count(*)::int from bookings where status = 'waitlisted') as en_espera`)
const hotFill = await db.query(
  `select s.capacity, count(b.id) filter (where b.status in ('pending','confirmed'))::int as taken
     from class_sessions s left join bookings b on b.session_id = s.id where s.id = any($1) group by s.id`, [hot.map((s) => s.id)])
const serverErrors = unexpected.filter((u) => u.status >= 500 || u.status === 0)

const lines = []
const out = (t = '') => lines.push(t)
out('# Simulación de uso — Pilates by Riven')
out()
out(`- Fecha: ${new Date().toISOString()}`)
out(`- Usuarias virtuales: **${USERS}** (concurrencia ${CONCURRENCY}, semilla ${SEED}) + 3 sesiones de administración y 1 instructora en paralelo`)
out(`- Duración: **${seconds.toFixed(1)} s** · Peticiones: **${requests}** (${(requests / seconds).toFixed(0)} por segundo)`)
out(`- Latencia: p50 ${pct(all, 0.5).toFixed(0)} ms · p95 ${pct(all, 0.95).toFixed(0)} ms · p99 ${pct(all, 0.99).toFixed(0)} ms · máx ${Math.max(...all).toFixed(0)} ms`)
out(`- Datos generados: ${counts.clientas} clientas, ${counts.reservas} reservas (${counts.enEspera} en lista de espera), ${counts.paquetes} paquetes, ${counts.pagos} pagos, ${counts.formularios} formularios, ${counts.auditoria} registros de auditoría`)
out(`- Clases más disputadas (3 cupos): ${hotFill.map((h) => `${h.taken}/${h.capacity}`).join(', ')}`)
out()
out(`## Resultado: ${violations.length === 0 && serverErrors.length === 0 && unexpected.length === 0 ? 'SIN FALLOS' : 'CON HALLAZGOS'}`)
out()
out(`- Errores del servidor (5xx o sin respuesta): **${serverErrors.length}**`)
out(`- Respuestas fuera de lo esperado: **${unexpected.length}**`)
out(`- Invariantes de negocio rotos: **${violations.length}**`)
out()
out('## Invariantes comprobados')
out()
out('| Regla | Casos que la rompen |')
out('|---|---|')
for (const [rule, n] of checks) out(`| ${rule} | ${n} |`)
out(`| en ningún instante de la corrida una clase superó su capacidad (vigilancia cada 0,7 s) | ${peakOversell} |`)
if (violations.length) { out(); out('## Invariantes rotos'); out(); for (const v of violations.slice(0, 30)) out(`- **${v.rule}** — \`${JSON.stringify(v.detail).slice(0, 300)}\``) }
if (unexpected.length) { out(); out('## Respuestas inesperadas (primeras 30)'); out(); for (const u of unexpected.slice(0, 30)) out(`- ${u.name}: ${u.method} ${u.path} → **${u.status}** (esperado ${JSON.stringify(u.expected)}) ${u.code || ''} ${u.error || ''}`) }
out()
out('## Acciones')
out()
out('| Acción | Peticiones | Respuestas | p50 ms | p95 ms |')
out('|---|---:|---|---:|---:|')
for (const [name, s] of [...stats.entries()].sort((a, b) => b[1].n - a[1].n)) {
  out(`| ${name} | ${s.n} | ${Object.entries(s.statuses).map(([k, v]) => `${k}×${v}`).join(' ')} | ${pct(s.ms, 0.5).toFixed(0)} | ${pct(s.ms, 0.95).toFixed(0)} |`)
}
const report = lines.join('\n')
writeFileSync(join(here, 'report.md'), `${report}\n`)
console.log(`\n${lines.slice(0, 12 + checks.length + 8).join('\n')}`)
if (violations.length) console.log('\nInvariantes rotos:\n', violations.slice(0, 8))
if (unexpected.length) console.log('\nInesperadas:\n', unexpected.slice(0, 12))
console.log(`\nInforme completo: server/sim/report.md`)

await new Promise((resolve) => server.close(resolve))
await pool.end()
process.exit(violations.length || unexpected.length ? 1 : 0)
