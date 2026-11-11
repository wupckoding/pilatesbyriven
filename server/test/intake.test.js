// Fase 3: paso de admisión, datos sensibles, órdenes de la clienta y comprobantes.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.NODE_ENV = 'test'
process.env.UPLOADS_DIR = mkdtempSync(join(tmpdir(), 'riven-uploads-'))
const { pool, db } = await import('../src/db.js')
const { migrate } = await import('../src/migrate.js')
const { createApp } = await import('../src/app.js')
const { todayCR, addDays } = await import('../src/lib/time.js')
const { encryptJson, decryptJson } = await import('../src/lib/crypto.js')
const { CONSENT_VERSION, FORM_VERSION, flagOutdated } = await import('../src/services/intake.js')
const bcrypt = (await import('bcryptjs')).default

let server
let base
let admin
let instructor
let seq = 0
const today = todayCR()

const call = async (method, path, { token = admin, body } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const buf = Buffer.from(await res.arrayBuffer())
  let data = {}
  try { data = JSON.parse(buf.toString('utf8')) } catch { data = { raw: buf } }
  return { status: res.status, data, headers: res.headers }
}
const ok = (res, status = 200) => { assert.equal(res.status, status, JSON.stringify(res.data).slice(0, 400)); return res.data }

const newClient = async () => {
  seq += 1
  return ok(await call('POST', '/api/auth/register', {
    token: null,
    body: { fullName: `Alumna ${seq}`, email: `a${seq}@admision.local`, password: 'clave-segura-1', whatsapp: `6100${String(1000 + seq)}`, acceptPrivacy: true },
  }), 201)
}
const newSession = async (daysAhead = 3, capacity = 3) => {
  seq += 1
  return ok(await call('POST', '/api/admin/sessions', {
    body: { name: `Clase ${seq}`, modality: 'reformer', kind: 'group', durationMin: 60, capacity, localDate: addDays(today, daysAhead), localTime: '10:00' },
  }), 201).session
}
const consent = { accepted: true, fullName: 'Alumna De Prueba', version: CONSENT_VERSION }
const SECRET = 'hernia L5 operada en 2021'
const health = { conditions: ['hernia_discal', 'cirugias'], surgeriesDetail: SECRET, activeInjury: 'yes', injuryZone: 'lumbar', painLevel: 6 }
const fill = (token, answers = {}, extra = {}) => call('POST', '/api/intake', { token, body: { answers, consent, ...extra } })

// Archivos mínimos válidos por su firma.
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), Buffer.alloc(200, 1)]).toString('base64')
const EXE = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(300, 2)]).toString('base64')

before(async () => {
  await pool.query('drop schema public cascade; create schema public;')
  await migrate({ log: () => {} })
  const hash = await bcrypt.hash('clave-del-personal', 4)
  await db.run(`insert into users (email, password_hash, role, full_name) values ($1,$2,'admin','Admin'), ($3,$2,'instructor','Instructora')`,
    ['admin@admision.local', hash, 'inst@admision.local'])
  server = createApp().listen(0)
  base = `http://127.0.0.1:${server.address().port}`
  admin = ok(await call('POST', '/api/auth/login', { token: null, body: { email: 'admin@admision.local', password: 'clave-del-personal' } })).token
  instructor = ok(await call('POST', '/api/auth/login', { token: null, body: { email: 'inst@admision.local', password: 'clave-del-personal' } })).token
  for (const [name, kind, n, price] of [['Clase de prueba', 'trial', 1, 1500], ['Clase suelta', 'single', 1, 2500], ['Paquete mensual', 'package', 4, 8000]]) {
    ok(await call('POST', '/api/admin/products', { body: { name, kind, sessionsCount: n, priceCents: price, currency: 'USD', validityDays: 30 } }), 201)
  }
  ok(await call('PUT', '/api/admin/settings', { body: { sinpeNumber: '8888-0000', sinpeName: 'Pilates by Riven' } }))
})

after(async () => {
  await new Promise((resolve) => server.close(resolve))
  await pool.end()
})

test('cifrado: lo guardado no contiene el texto y un dato alterado no se lee', () => {
  const enc = encryptJson({ nota: SECRET })
  assert.equal(enc.includes('hernia'), false)
  assert.deepEqual(decryptJson(enc), { nota: SECRET })
  const parts = enc.split('.')
  parts[3] = parts[3].slice(0, -2) + (parts[3].endsWith('A') ? 'B' : 'A') + parts[3].slice(-1)
  assert.throws(() => decryptJson(parts.join('.')))
})

test('una clienta nueva debe pasar por admisión antes de reservar o comprar', async () => {
  const c = await newClient()
  const s = await newSession()
  assert.equal(ok(await call('GET', '/api/intake', { token: c.token })).status, 'pending')
  const blocked = await call('POST', '/api/bookings', { token: c.token, body: { sessionId: s.id } })
  assert.equal(blocked.status, 409)
  assert.equal(blocked.data.code, 'INTAKE_REQUIRED')
  const products = ok(await call('GET', '/api/products', { token: c.token })).products
  const order = await call('POST', '/api/orders', { token: c.token, body: { productId: products[0].id, orderKey: randomUUID() } })
  assert.equal(order.data.code, 'INTAKE_REQUIRED')

  // Sin aceptar la declaración no se guarda nada.
  assert.equal((await call('POST', '/api/intake', { token: c.token, body: { answers: {}, consent: { accepted: false, fullName: 'X Y Z' } } })).status, 400)
  assert.equal((await call('POST', '/api/intake', { token: c.token, body: { answers: {}, consent: { accepted: true, fullName: '' } } })).status, 400)

  // Puede reservarse todas las respuestas de salud: el paso queda cumplido igual.
  ok(await fill(c.token), 201)
  assert.equal(ok(await call('GET', '/api/intake', { token: c.token })).status, 'completed')
  ok(await call('POST', '/api/bookings', { token: c.token, body: { sessionId: s.id } }), 201)
})

test('informar una condición no bloquea: queda para revisión privada y puede reservar', async () => {
  const c = await newClient()
  const s = await newSession()
  const res = ok(await fill(c.token, health, { personal: { birthDate: '1990-05-20', emergencyName: 'Mamá', emergencyPhone: '8888 1111' } }), 201)
  assert.equal(res.status, 'needs_review')
  ok(await call('POST', '/api/bookings', { token: c.token, body: { sessionId: s.id } }), 201)
  const me = ok(await call('GET', '/api/auth/me', { token: c.token }))
  assert.equal(me.client.intakeStatus, 'needs_review')
  assert.equal(me.client.birthDate, '1990-05-20')
  assert.equal(me.client.emergencyName, 'Mamá')
  // Revisar la quita de pendientes.
  assert.equal(ok(await call('GET', '/api/admin/dashboard')).counts.intakeToReview >= 1, true)
  assert.equal(ok(await call('POST', `/api/admin/clients/${c.client.id}/intake/review`)).status, 'completed')
})

test('las respuestas se guardan cifradas y sus opciones dependientes se limpian', async () => {
  const c = await newClient()
  ok(await fill(c.token, { ...health, exercises: ['yoga', 'ninguno'], sportsDetail: 'tenis', goals: ['core'], goalDetail: 'no debe guardarse', pilatesBefore: 'no', pilatesTypes: ['mat'] }), 201)
  const row = await db.one('select answers_enc, form_version, consent_version, consent_name from intake_submissions where client_id = $1', [c.client.id])
  assert.equal(row.answersEnc.includes('hernia'), false)
  assert.equal(row.formVersion, FORM_VERSION)
  assert.equal(row.consentVersion, CONSENT_VERSION)
  assert.equal(row.consentName, 'Alumna De Prueba')
  const mine = ok(await call('GET', '/api/intake', { token: c.token })).answers
  assert.equal(mine.surgeriesDetail, SECRET)
  assert.deepEqual(mine.exercises, ['ninguno']) // "Ninguno" es excluyente
  assert.equal(mine.sportsDetail, '')
  assert.equal(mine.goalDetail, '')
  assert.deepEqual(mine.pilatesTypes, [])
  assert.equal(mine.avoidMovements, '') // sin informar
  // Entradas fuera de catálogo se rechazan.
  assert.equal((await fill(c.token, { conditions: ['inventada'] })).status, 400)
  assert.equal((await fill(c.token, { painLevel: 11 })).status, 400)
})

test('solo administración ve las respuestas, y cada acceso queda registrado', async () => {
  const c = await newClient()
  const other = await newClient()
  ok(await fill(c.token, health), 201)
  const paths = [['GET', `/api/admin/clients/${c.client.id}/intake`], ['POST', `/api/admin/clients/${c.client.id}/intake/reveal`]]
  for (const [method, path] of paths) {
    const body = method === 'POST' ? {} : undefined
    assert.equal((await call(method, path, { token: other.token, body })).status, 403, path)
    assert.equal((await call(method, path, { token: instructor, body })).status, 403, path)
    assert.equal((await call(method, path, { token: null, body })).status, 401, path)
  }
  // Otra clienta solo ve su propio formulario.
  assert.equal(ok(await call('GET', '/api/intake', { token: other.token })).answers, null)

  // El estado y el historial no traen respuestas.
  const meta = ok(await call('GET', `/api/admin/clients/${c.client.id}/intake`))
  assert.equal(meta.status, 'needs_review')
  assert.equal(JSON.stringify(meta).includes('hernia'), false)
  assert.equal(meta.log.filter((l) => l.action === 'view').length, 0)

  const revealed = await call('POST', `/api/admin/clients/${c.client.id}/intake/reveal`, { body: {} })
  assert.equal(ok(revealed).answers.surgeriesDetail, SECRET)
  assert.equal(revealed.headers.get('cache-control'), 'no-store')
  ok(await call('POST', `/api/admin/clients/${c.client.id}/intake/reveal`, { body: {} }))
  const log = ok(await call('GET', `/api/admin/clients/${c.client.id}/intake`)).log
  assert.equal(log.filter((l) => l.action === 'view' && l.actorName === 'Admin').length, 2)
  assert.equal(log.some((l) => l.action === 'submit'), true)
})

test('las respuestas no aparecen en ficha, listas, agenda, Caja ni exportaciones', async () => {
  const c = await newClient()
  const s = await newSession()
  ok(await fill(c.token, health), 201)
  ok(await call('POST', '/api/bookings', { token: c.token, body: { sessionId: s.id } }), 201)
  const from = addDays(today, -1)
  const to = addDays(today, 10)
  const places = [
    `/api/admin/clients/${c.client.id}`, '/api/admin/clients', '/api/admin/dashboard', `/api/admin/sessions/${s.id}`,
    `/api/admin/agenda?from=${from}&to=${to}`, '/api/admin/caja', '/api/admin/payments', '/api/admin/packages',
    '/api/admin/export/payments.csv', '/api/admin/bookings?view=pending',
  ]
  for (const path of places) {
    const res = await call('GET', path)
    assert.equal(res.status, 200, path)
    const text = res.data.raw ? res.data.raw.toString('utf8') : JSON.stringify(res.data)
    assert.equal(/hernia|lumbar|answers_enc|answersEnc/i.test(text), false, path)
  }
  // La instructora ve el estado de admisión en su lista, no el contenido ni el contacto.
  const audit = await db.query(`select detail from audit_log where action = 'intake.submit' and entity_id = $1`, [c.client.id])
  assert.equal(JSON.stringify(audit).includes('hernia'), false)
})

test('las versiones anteriores se conservan y un cambio de formulario pide actualización', async () => {
  const c = await newClient()
  ok(await fill(c.token, { goals: ['core'] }), 201)
  ok(await fill(c.token, { goals: ['postura'] }), 201)
  const meta = ok(await call('GET', `/api/admin/clients/${c.client.id}/intake`))
  assert.equal(meta.submissions.length, 2)
  const old = ok(await call('POST', `/api/admin/clients/${c.client.id}/intake/reveal`, { body: { submissionId: meta.submissions[1].id } }))
  assert.deepEqual(old.answers.goals, ['core'])
  // No se puede pedir la versión de otra clienta por su id.
  const other = await newClient()
  assert.equal((await call('POST', `/api/admin/clients/${other.client.id}/intake/reveal`, { body: { submissionId: meta.submissions[0].id } })).status, 404)

  // Simula que el formulario cambió de versión.
  await db.run(`update intake_submissions set form_version = 'vieja' where client_id = $1`, [c.client.id])
  await flagOutdated(db)
  assert.equal(ok(await call('GET', '/api/intake', { token: c.token })).status, 'needs_update')
  const s = await newSession()
  assert.equal((await call('POST', '/api/bookings', { token: c.token, body: { sessionId: s.id } })).data.code, 'INTAKE_REQUIRED')
  // Aceptar una declaración que ya no es la vigente se rechaza.
  assert.equal((await call('POST', '/api/intake', { token: c.token, body: { answers: {}, consent: { ...consent, version: 'otra' } } })).status, 409)
  ok(await fill(c.token), 201)
  ok(await call('POST', '/api/bookings', { token: c.token, body: { sessionId: s.id } }), 201)
})

test('administración: llenado asistido, pedir actualización y eliminar respuestas', async () => {
  const created = ok(await call('POST', '/api/admin/clients', { body: { fullName: 'Alta Manual', whatsapp: '6200 0001' } }), 201).client
  assert.equal(created.intakeStatus, 'pending')
  assert.equal(ok(await call('POST', `/api/admin/clients/${created.id}/intake`, { body: { answers: health, consent } }), 201).status, 'needs_review')
  let meta = ok(await call('GET', `/api/admin/clients/${created.id}/intake`))
  assert.equal(meta.submissions[0].assisted, true)
  assert.equal(ok(await call('POST', `/api/admin/clients/${created.id}/intake/request-update`)).status, 'needs_update')
  assert.equal((await call('DELETE', `/api/admin/clients/${created.id}/intake`, { body: {} })).status, 400)
  ok(await call('DELETE', `/api/admin/clients/${created.id}/intake`, { body: { reason: 'Solicitud de la clienta' } }))
  meta = ok(await call('GET', `/api/admin/clients/${created.id}/intake`))
  assert.equal(meta.status, 'pending')
  assert.equal(meta.submissions[0].hasAnswers, false)
  assert.equal(meta.log[0].action, 'delete')
  assert.equal((await call('POST', `/api/admin/clients/${created.id}/intake/reveal`, { body: {} })).status, 404)
  assert.equal((await db.one('select answers_enc from intake_submissions where client_id = $1', [created.id])).answersEnc, null)
})

test('orden de la clienta: referencia, total, comprobante SINPE y verificación', async () => {
  const c = await newClient()
  ok(await fill(c.token), 201)
  const products = ok(await call('GET', '/api/products', { token: c.token })).products
  const monthly = products.find((p) => p.kind === 'package')
  const key = randomUUID()
  const [o1, o2] = await Promise.all([1, 2].map(() => call('POST', '/api/orders', { token: c.token, body: { productId: monthly.id, orderKey: key } })))
  assert.equal(o1.data.package.id, o2.data.package.id) // doble toque: una sola orden
  const order = o1.data.package
  assert.equal(order.status, 'pending_payment')
  assert.equal(order.balanceCents, 8000)

  const info = ok(await call('GET', `/api/orders/${order.id}/payment`, { token: c.token }))
  assert.match(info.reference, /^PR\d{4}-[0-9A-F]{6}$/)
  assert.equal(info.sinpe.number, '8888-0000')
  assert.equal(info.cardLink, null)

  // Archivo disfrazado o vacío: rechazado.
  assert.equal((await call('POST', `/api/orders/${order.id}/proof`, { token: c.token, body: { data: EXE } })).status, 400)
  assert.equal((await call('POST', `/api/orders/${order.id}/proof`, { token: c.token, body: {} })).status, 400)
  const proof = ok(await call('POST', `/api/orders/${order.id}/proof`, { token: c.token, body: { data: `data:image/png;base64,${PNG}`, reference: 'SINPE 123' } }), 201)
  assert.equal((await call('POST', `/api/orders/${order.id}/proof`, { token: c.token, body: { data: PNG } })).data.code, 'PROOF_PENDING')
  assert.equal(readdirSync(join(process.env.UPLOADS_DIR, 'proofs')).length, 1)

  // Enviar el comprobante no confirma el cobro.
  let mine = ok(await call('GET', '/api/packages', { token: c.token })).packages[0]
  assert.equal(mine.status, 'pending_payment')
  assert.equal(mine.toVerifyCents, 8000)
  assert.equal(ok(await call('GET', '/api/admin/caja')).totals.USD.collected, 0)

  // Solo administración abre el comprobante.
  const other = await newClient()
  for (const token of [c.token, other.token, instructor, null]) {
    assert.notEqual((await call('GET', `/api/admin/payments/${proof.paymentId}/proof`, { token })).status, 200)
  }
  const file = await call('GET', `/api/admin/payments/${proof.paymentId}/proof`)
  assert.equal(file.status, 200)
  assert.equal(file.headers.get('content-type'), 'image/png')
  assert.equal(file.data.raw.length, 208)

  ok(await call('POST', `/api/admin/payments/${proof.paymentId}/verify`))
  mine = ok(await call('GET', '/api/packages', { token: c.token })).packages[0]
  assert.deepEqual([mine.status, mine.balanceCents, mine.available], ['active', 0, 4])
  assert.equal(ok(await call('GET', '/api/admin/caja')).totals.USD.collected, 8000)
  assert.equal((await call('POST', `/api/orders/${order.id}/proof`, { token: c.token, body: { data: PNG } })).data.code, 'ALREADY_PAID')
})

test('clase de prueba: una sola vez, con la clase elegida y el cupo retenido', async () => {
  const c = await newClient()
  ok(await fill(c.token), 201)
  const s = await newSession(4, 1)
  const trial = ok(await call('GET', '/api/products', { token: c.token })).products.find((p) => p.kind === 'trial')
  const order = ok(await call('POST', '/api/orders', { token: c.token, body: { productId: trial.id, sessionId: s.id, orderKey: randomUUID() } }), 201).package
  assert.equal(order.reserved, 1)
  assert.equal(ok(await call('GET', `/api/admin/sessions/${s.id}`)).session.taken, 1)
  const bookings = ok(await call('GET', '/api/bookings', { token: c.token })).upcoming
  assert.equal(bookings[0].status, 'pending')
  // Ya no se ofrece ni se puede comprar otra prueba.
  assert.equal(ok(await call('GET', '/api/products', { token: c.token })).products.some((p) => p.kind === 'trial'), false)
  assert.equal((await call('POST', '/api/orders', { token: c.token, body: { productId: trial.id, orderKey: randomUUID() } })).data.code, 'TRIAL_USED')
  // Un paquete de varias clases no acepta clase en la orden.
  const monthly = ok(await call('GET', '/api/products', { token: c.token })).products.find((p) => p.kind === 'package')
  assert.equal((await call('POST', '/api/orders', { token: c.token, body: { productId: monthly.id, sessionId: s.id, orderKey: randomUUID() } })).status, 400)

  // Cancelar la orden sin pagar libera el cupo; con un comprobante enviado ya no se puede.
  ok(await call('POST', `/api/orders/${order.id}/cancel`, { token: c.token }))
  assert.equal(ok(await call('GET', `/api/admin/sessions/${s.id}`)).session.taken, 0)
  const again = ok(await call('POST', '/api/orders', { token: c.token, body: { productId: trial.id, sessionId: s.id, orderKey: randomUUID() } }), 201).package
  ok(await call('POST', `/api/orders/${again.id}/proof`, { token: c.token, body: { data: PNG } }), 201)
  assert.equal((await call('POST', `/api/orders/${again.id}/cancel`, { token: c.token })).status, 409)
})

test('una clienta no ve ni paga órdenes ajenas; el enlace de tarjeta lo pone administración', async () => {
  const a = await newClient()
  const b = await newClient()
  ok(await fill(a.token), 201)
  const single = ok(await call('GET', '/api/products', { token: a.token })).products.find((p) => p.kind === 'single')
  const order = ok(await call('POST', '/api/orders', { token: a.token, body: { productId: single.id, orderKey: randomUUID() } }), 201).package
  assert.equal((await call('GET', `/api/orders/${order.id}/payment`, { token: b.token })).status, 404)
  assert.equal((await call('POST', `/api/orders/${order.id}/proof`, { token: b.token, body: { data: PNG } })).status, 404)
  assert.equal((await call('POST', `/api/orders/${order.id}/cancel`, { token: b.token })).status, 404)
  assert.equal((await call('PUT', `/api/admin/packages/${order.id}/payment-link`, { token: a.token, body: { paymentLink: 'https://x.test' } })).status, 403)
  assert.equal((await call('PUT', `/api/admin/packages/${order.id}/payment-link`, { body: { paymentLink: 'javascript:alert(1)' } })).status, 400)
  assert.equal((await call('PUT', `/api/admin/packages/${order.id}/payment-link`, { body: { paymentLink: 'http://sin-https.test/pago' } })).status, 400)
  ok(await call('PUT', `/api/admin/packages/${order.id}/payment-link`, { body: { paymentLink: 'https://compraclick.test/pago/abc' } }))
  assert.equal(ok(await call('GET', `/api/orders/${order.id}/payment`, { token: a.token })).cardLink, 'https://compraclick.test/pago/abc')
  // Volver del enlace no confirma nada: sigue por cobrar hasta que administración registre el pago.
  assert.equal(ok(await call('GET', '/api/packages', { token: a.token })).packages[0].status, 'pending_payment')
  const detail = ok(await call('GET', `/api/admin/packages/${order.id}`))
  assert.equal(detail.package.createdByClient, true)
  assert.match(detail.package.reference, /^PR\d{4}-/)
})
