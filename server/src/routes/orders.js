import { Router } from 'express'
import { z } from 'zod'
import { randomBytes, randomUUID } from 'crypto'
import { createReadStream, existsSync } from 'fs'
import { mkdir, writeFile } from 'fs/promises'
import { basename, join } from 'path'
import { config } from '../config.js'
import { db, tx } from '../db.js'
import { h, parse, HttpError } from '../lib/http.js'
import { audit } from '../lib/audit.js'
import { addDays, todayCR } from '../lib/time.js'
import { requireAuth, requireRole } from '../auth.js'
import { getSettings } from '../services/settings.js'
import { getPackage } from '../services/packages.js'
import { createBookingIn } from '../services/bookings.js'
import { intakeDone } from '../services/intake.js'

const uuid = z.string().uuid('Identificador inválido')
const proofsDir = join(config.uploadsDir, 'proofs')

// Tipo real del archivo según sus primeros bytes (no se confía en el nombre ni en lo que diga el navegador).
const sniff = (buf) => {
  if (buf.length > 3 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return { mime: 'image/jpeg', ext: 'jpg' }
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) return { mime: 'image/png', ext: 'png' }
  if (buf.length > 4 && buf.subarray(0, 5).toString('latin1') === '%PDF-') return { mime: 'application/pdf', ext: 'pdf' }
  if (buf.length > 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return { mime: 'image/webp', ext: 'webp' }
  return null
}

const publicPackage = (p) => ({
  id: p.id, name: p.name, kind: p.kind, status: p.status, startsOn: p.startsOn, expiresOn: p.expiresOn, holdUntil: p.holdUntil,
  sessionsTotal: p.sessionsTotal, used: p.used, reserved: p.reserved, available: p.available,
  priceCents: p.priceCents, currency: p.currency, paidCents: p.paidCents, balanceCents: p.balanceCents, toVerifyCents: p.toVerifyCents,
})

// ─── Clienta: comprar y pagar ──────────────────────────
export const clientOrders = Router()
clientOrders.use(requireAuth)

const ownClient = async (req) => {
  const client = await db.one(
    'select id, student_number, intake_status from clients where user_id = $1 and archived_at is null', [req.user.id])
  if (!client) throw new HttpError(403, 'Tu cuenta no tiene una ficha de clienta', 'NO_CLIENT')
  return client
}

clientOrders.get('/products', h(async (req, res) => {
  const client = await ownClient(req)
  const products = await db.query(
    `select id, name, kind, sessions_count, price_cents, currency, validity_days from products where is_active order by sort_order`)
  const trial = await db.one(`select 1 as x from client_packages where client_id = $1 and kind = 'trial' and status <> 'cancelled'`, [client.id])
  // La clase de prueba se ofrece una sola vez.
  res.json({ products: products.filter((p) => p.kind !== 'trial' || !trial) })
}))

// Datos para pagar: SINPE del estudio y, por orden, el enlace de Compra Click que administración asoció.
clientOrders.get('/orders/:id/payment', h(async (req, res) => {
  const { id } = parse(z.object({ id: uuid }), req.params)
  const client = await ownClient(req)
  const pkg = await getPackage(db, id)
  if (!pkg || pkg.clientId !== client.id) throw new HttpError(404, 'Orden no encontrada', 'NOT_FOUND')
  const extra = await db.one('select reference, payment_link from client_packages where id = $1', [id])
  const settings = await getSettings()
  const proofs = await db.query(
    `select id, status, amount_cents, currency, method, received_on, reject_reason, created_at
       from payments where package_id = $1 and kind = 'payment' order by created_at desc`, [id])
  res.json({
    package: publicPackage(pkg),
    reference: extra.reference,
    cardLink: extra.paymentLink || null,
    sinpe: { number: settings.sinpeNumber, name: settings.sinpeName },
    studioWhatsapp: settings.studioWhatsapp,
    payments: proofs,
  })
}))

/**
 * Orden de compra: crea el paquete "por cobrar" con su referencia y muestra el total antes de pagar.
 * Volver del enlace de pago no confirma nada: el cobro lo verifica administración.
 */
clientOrders.post('/orders', h(async (req, res) => {
  const b = parse(z.object({
    productId: uuid,
    sessionId: uuid.nullable().optional(),
    orderKey: z.string().min(8).max(100),
  }), req.body)
  const client = await ownClient(req)
  const settings = await getSettings()
  if (settings.intakeRequired && !intakeDone(client.intakeStatus)) {
    throw new HttpError(409, 'Completa tu formulario de admisión antes de comprar', 'INTAKE_REQUIRED')
  }

  const id = await tx(async (t) => {
    const repeated = await t.one('select id from client_packages where order_key = $1 and client_id = $2', [b.orderKey, client.id])
    if (repeated) return repeated.id
    const product = await t.one('select * from products where id = $1 and is_active', [b.productId])
    if (!product) throw new HttpError(404, 'Este producto ya no está disponible', 'NOT_FOUND')
    if (product.kind === 'trial') {
      // Bloqueo de la ficha: dos compras simultáneas no generan dos clases de prueba.
      await t.one('select id from clients where id = $1 for update', [client.id])
      const used = await t.one(`select 1 as x from client_packages where client_id = $1 and kind = 'trial' and status <> 'cancelled'`, [client.id])
      if (used) throw new HttpError(409, 'Ya utilizaste tu clase de prueba', 'TRIAL_USED')
    }
    if (b.sessionId && product.sessionsCount !== 1) throw new HttpError(400, 'Las clases del paquete se reservan después de pagar', 'VALIDATION')

    const today = todayCR()
    const reference = `PR${String(client.studentNumber).padStart(4, '0')}-${randomBytes(3).toString('hex').toUpperCase()}`
    const pkg = await t.one(
      `insert into client_packages (client_id, product_id, name, kind, price_cents, currency, sessions_total, starts_on, expires_on,
                                    status, hold_until, created_by, reference, order_key, created_by_client)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending_payment',$10,$11,$12,$13,true)
       on conflict (order_key) do nothing returning id`,
      [client.id, product.id, product.name, product.kind, product.priceCents, product.currency, product.sessionsCount,
        today, addDays(today, product.validityDays - 1), addDays(today, settings.holdDays), req.user.id, reference, b.orderKey])
    // Dos toques a la vez: el segundo espera al primero y devuelve la misma orden.
    if (!pkg) {
      const first = await t.one('select id from client_packages where order_key = $1 and client_id = $2', [b.orderKey, client.id])
      if (!first) throw new HttpError(409, 'No se pudo crear la orden. Inténtalo de nuevo', 'ORDER_CONFLICT')
      return first.id
    }
    if (b.sessionId) {
      await createBookingIn(t, { sessionId: b.sessionId, clientId: client.id, actor: req.user, packageId: pkg.id, status: 'pending' })
    }
    await audit(t, req.user.id, 'order.create', 'package', pkg.id, { productId: product.id, sessionId: b.sessionId || null })
    return pkg.id
  })
  const pkg = await getPackage(db, id)
  res.status(201).json({ package: publicPackage(pkg) })
}))

// La clienta puede cancelar una orden que aún no pagó.
clientOrders.post('/orders/:id/cancel', h(async (req, res) => {
  const { id } = parse(z.object({ id: uuid }), req.params)
  const client = await ownClient(req)
  await tx(async (t) => {
    const pkg = await t.one('select * from client_packages where id = $1 and client_id = $2 for update', [id, client.id])
    if (!pkg) throw new HttpError(404, 'Orden no encontrada', 'NOT_FOUND')
    if (pkg.status === 'cancelled') return
    const paid = await t.one(`select 1 as x from payments where package_id = $1 and status in ('verified','to_verify') limit 1`, [id])
    if (pkg.status !== 'pending_payment' || paid) {
      throw new HttpError(409, 'Esta orden ya tiene un pago. Escríbenos por WhatsApp para cambiarla', 'INVALID_STATE')
    }
    await t.run(
      `update bookings set status = 'cancelled', cancelled_at = now(), updated_at = now(), reason = 'Orden cancelada'
        where package_id = $1 and status in ('pending','confirmed','waitlisted') and attendance is null`, [id])
    await t.run(`update client_packages set status = 'cancelled', cancel_reason = 'Cancelada por la clienta', hold_until = null, updated_at = now() where id = $1`, [id])
    await audit(t, req.user.id, 'order.cancel', 'package', id)
  })
  res.json({ ok: true })
}))

/** Comprobante de SINPE: se guarda en carpeta privada y el pago queda "por verificar". */
clientOrders.post('/orders/:id/proof', h(async (req, res) => {
  const { id } = parse(z.object({ id: uuid }), req.params)
  const b = parse(z.object({
    data: z.string({ required_error: 'Adjunta el comprobante' }).min(100, 'Adjunta el comprobante').max(11_000_000, 'El archivo es demasiado grande (máximo 7 MB)'),
    reference: z.string().trim().max(120).optional(),
  }), req.body)
  const client = await ownClient(req)
  const file = Buffer.from(b.data.replace(/^data:[^,]*,/, ''), 'base64')
  const type = sniff(file)
  if (!type) throw new HttpError(400, 'Sube una foto (JPG, PNG) o un PDF del comprobante', 'BAD_FILE', { field: 'data' })
  if (file.length > 7 * 1024 * 1024) throw new HttpError(413, 'El archivo es demasiado grande (máximo 7 MB)', 'TOO_LARGE', { field: 'data' })

  const name = `${randomUUID()}.${type.ext}`
  const paymentId = await tx(async (t) => {
    const pkg = await t.one('select id, status from client_packages where id = $1 and client_id = $2 for update', [id, client.id])
    if (!pkg) throw new HttpError(404, 'Orden no encontrada', 'NOT_FOUND')
    if (pkg.status === 'cancelled') throw new HttpError(409, 'Esta orden está cancelada', 'INVALID_STATE')
    const full = await getPackage(t, id)
    if (full.balanceCents <= 0) throw new HttpError(409, 'Esta orden ya está pagada', 'ALREADY_PAID')
    const waiting = await t.one(`select 1 as x from payments where package_id = $1 and status = 'to_verify' and kind = 'payment'`, [id])
    if (waiting) throw new HttpError(409, 'Ya enviaste un comprobante: el estudio lo está revisando', 'PROOF_PENDING')
    await mkdir(proofsDir, { recursive: true })
    await writeFile(join(proofsDir, name), file, { flag: 'wx' })
    const row = await t.one(
      `insert into payments (client_id, package_id, kind, amount_cents, currency, method, reference, status, received_on,
                             applied_cents, proof_path, proof_mime, created_by)
       values ($1,$2,'payment',$3,$4,'sinpe',$5,'to_verify',$6,$3,$7,$8,$9) returning id`,
      [client.id, id, full.balanceCents, full.currency, b.reference ?? '', todayCR(), name, type.mime, req.user.id])
    await audit(t, req.user.id, 'payment.proof', 'payment', row.id, { packageId: id })
    return row.id
  })
  res.status(201).json({ paymentId, status: 'to_verify' })
}))

// ─── Administración: comprobante y enlace de pago ──────
export const adminOrders = Router()
adminOrders.use(requireAuth, requireRole('admin'))

// El archivo solo sale por esta ruta, con sesión de administración.
adminOrders.get('/payments/:id/proof', h(async (req, res) => {
  const { id } = parse(z.object({ id: uuid }), req.params)
  const y = await db.one('select proof_path, proof_mime from payments where id = $1', [id])
  // basename() impide que una ruta manipulada salga de la carpeta de comprobantes.
  const path = y?.proofPath ? join(proofsDir, basename(y.proofPath)) : null
  if (!path || !existsSync(path)) throw new HttpError(404, 'Este pago no tiene comprobante', 'NOT_FOUND')
  await audit(db, req.user.id, 'payment.proof_view', 'payment', id)
  res.setHeader('Content-Type', y.proofMime || 'application/octet-stream')
  res.setHeader('Cache-Control', 'private, no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Content-Disposition', 'inline; filename="comprobante"')
  createReadStream(path).pipe(res)
}))

adminOrders.put('/packages/:id/payment-link', h(async (req, res) => {
  const { id } = parse(z.object({ id: uuid }), req.params)
  const b = parse(z.object({
    paymentLink: z.union([z.literal(''), z.string().trim().url('Enlace inválido').max(500).refine((u) => u.startsWith('https://'), 'El enlace debe empezar con https://')]),
  }), req.body)
  const n = await db.run('update client_packages set payment_link = $2, updated_at = now() where id = $1', [id, b.paymentLink])
  if (!n) throw new HttpError(404, 'Paquete no encontrado', 'NOT_FOUND')
  await audit(db, req.user.id, 'package.payment_link', 'package', id, { set: !!b.paymentLink })
  res.json({ paymentLink: b.paymentLink })
}))
