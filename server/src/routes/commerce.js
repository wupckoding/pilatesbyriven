import { Router } from 'express'
import { z } from 'zod'
import { db, tx } from '../db.js'
import { h, parse, HttpError } from '../lib/http.js'
import { audit } from '../lib/audit.js'
import { addDays, todayCR, formatStudentNumber } from '../lib/time.js'
import { requireAuth, requireRole } from '../auth.js'
import { getSettings } from '../services/settings.js'
import { activate, getPackage, listPackages, settlePackage } from '../services/packages.js'
import { createBookingIn } from '../services/bookings.js'

// Paquetes, pagos, gastos, ahorro y Caja: solo administración.
const router = Router()
router.use(requireAuth, requireRole('admin'))

const uuid = z.string().uuid('Identificador inválido')
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida')
const currency = z.enum(['USD', 'CRC'], { errorMap: () => ({ message: 'Moneda inválida' }) })
const cents = z.number({ invalid_type_error: 'Monto inválido' }).int('Monto inválido').min(1, 'El monto debe ser mayor que cero').max(2_000_000_000, 'Monto demasiado grande')
const METHODS = ['sinpe', 'card', 'cash', 'transfer', 'other']
const KINDS = ['trial', 'single', 'package']

const withCode = (row) => row && { ...row, studentCode: formatStudentNumber(row.studentNumber) }
const monthRange = (today = todayCR()) => {
  const from = `${today.slice(0, 7)}-01`
  const next = new Date(`${from}T12:00:00Z`)
  next.setUTCMonth(next.getUTCMonth() + 1)
  return { from, to: addDays(next.toISOString().slice(0, 10), -1) }
}
const range = (query) => {
  const q = parse(z.object({ from: ymd.optional(), to: ymd.optional() }).passthrough(), query)
  const month = monthRange()
  const from = q.from || month.from
  const to = q.to || (q.from ? q.from : month.to)
  if (to < from) throw new HttpError(400, 'Rango de fechas inválido', 'VALIDATION')
  return { from, to }
}

// ─── CATÁLOGO ──────────────────────────────────────────
const productBody = {
  name: z.string({ required_error: 'Escribe un nombre' }).trim().min(2, 'Escribe un nombre').max(80),
  kind: z.enum(KINDS, { errorMap: () => ({ message: 'Tipo inválido' }) }),
  sessionsCount: z.number().int().min(1, 'Mínimo 1 clase').max(100),
  priceCents: z.number({ invalid_type_error: 'Precio inválido' }).int().min(0, 'Precio inválido').max(2_000_000_000),
  currency,
  validityDays: z.number().int().min(1, 'Mínimo 1 día').max(730),
  isActive: z.boolean().optional(),
}

router.get('/products', h(async (_req, res) => {
  res.json({ products: await db.query('select * from products order by is_active desc, sort_order, created_at') })
}))

router.post('/products', h(async (req, res) => {
  const b = parse(z.object(productBody), req.body)
  const product = await db.one(
    `insert into products (name, kind, sessions_count, price_cents, currency, validity_days, is_active, sort_order)
     values ($1,$2,$3,$4,$5,$6,$7, (select coalesce(max(sort_order),0)+1 from products)) returning *`,
    [b.name, b.kind, b.sessionsCount, b.priceCents, b.currency, b.validityDays, b.isActive ?? true])
  await audit(db, req.user.id, 'product.create', 'product', product.id, b)
  res.status(201).json({ product })
}))

// Cambiar el catálogo solo afecta ventas futuras: cada compra guardó su precio y vigencia.
router.patch('/products/:id', h(async (req, res) => {
  const { id } = parse(z.object({ id: uuid }), req.params)
  const b = parse(z.object(productBody).partial(), req.body)
  const current = await db.one('select * from products where id = $1', [id])
  if (!current) throw new HttpError(404, 'Producto no encontrado', 'NOT_FOUND')
  const product = await db.one(
    `update products set name=$2, kind=$3, sessions_count=$4, price_cents=$5, currency=$6, validity_days=$7, is_active=$8, updated_at=now()
      where id=$1 returning *`,
    [id, b.name ?? current.name, b.kind ?? current.kind, b.sessionsCount ?? current.sessionsCount, b.priceCents ?? current.priceCents,
      b.currency ?? current.currency, b.validityDays ?? current.validityDays, b.isActive ?? current.isActive])
  await audit(db, req.user.id, 'product.update', 'product', id, { from: current, changes: b })
  res.json({ product })
}))

// ─── PAQUETES ──────────────────────────────────────────
router.get('/packages', h(async (req, res) => {
  const q = parse(z.object({
    view: z.enum(['due', 'active', 'expiring', 'expired', 'cancelled', 'all']).optional(),
    clientId: uuid.optional(),
  }), req.query)
  const { renewalNoticeDays } = await getSettings()
  const params = []
  const conds = []
  if (q.clientId) { params.push(q.clientId); conds.push(`p.client_id = $${params.length + 1}`) }
  const view = q.view || 'all'
  if (view === 'due') conds.push(`p.status <> 'cancelled' and p.price_cents > coalesce(pay.paid, 0)`)
  if (view === 'active') conds.push(`p.status = 'active' and p.expires_on >= $1::date`)
  if (view === 'expiring') {
    params.push(renewalNoticeDays)
    conds.push(`p.status = 'active' and p.kind = 'package' and p.expires_on >= $1::date and p.expires_on <= $1::date + $${params.length + 1}::int`)
  }
  if (view === 'expired') conds.push(`p.status = 'active' and p.expires_on < $1::date`)
  if (view === 'cancelled') conds.push(`p.status = 'cancelled'`)
  const where = conds.length ? `where ${conds.join(' and ')}` : ''
  const packages = await listPackages(db, where, params, 'order by p.expires_on desc, p.created_at desc limit 300')
  res.json({ packages: packages.map(withCode), renewalNoticeDays })
}))

router.get('/packages/:id', h(async (req, res) => {
  const { id } = parse(z.object({ id: uuid }), req.params)
  const pkg = await getPackage(db, id)
  if (!pkg) throw new HttpError(404, 'Paquete no encontrado', 'NOT_FOUND')
  const bookings = await db.query(
    `select b.id, b.status, b.attendance, s.id as session_id, s.local_date, s.local_time, s.name, s.modality, s.status as session_status
       from bookings b join class_sessions s on s.id = b.session_id
      where b.package_id = $1 and b.status <> 'rescheduled' order by s.starts_at`, [id])
  const payments = await db.query(
    `select y.id, y.kind, y.amount_cents, y.currency, y.method, y.reference, y.status, y.received_on, y.note, y.reject_reason,
            y.fx_rate, y.applied_cents, y.created_at, (y.proof_path is not null) as has_proof, u.full_name as verified_by_name
       from payments y left join users u on u.id = y.verified_by
      where y.package_id = $1 order by y.created_at`, [id])
  const order = await db.one('select reference, payment_link, created_by_client from client_packages where id = $1', [id])
  res.json({ package: { ...withCode(pkg), ...order }, bookings, payments })
}))

// Próximas clases de un grupo para proponer las fechas de un paquete.
router.get('/groups/:id/upcoming', h(async (req, res) => {
  const { id } = parse(z.object({ id: uuid }), req.params)
  const q = parse(z.object({ from: ymd.optional(), to: ymd.optional() }), req.query)
  const from = q.from || todayCR()
  const sessions = await db.query(
    `select s.id, s.local_date, s.local_time, s.name, s.capacity, s.status,
            (select count(*)::int from bookings b where b.session_id = s.id and b.status in ('pending','confirmed')) as taken
       from class_sessions s
      where s.group_id = $1 and s.local_date >= $2 and ($3::date is null or s.local_date <= $3) and s.status = 'scheduled'
      order by s.starts_at limit 12`, [id, from, q.to || null])
  res.json({ sessions })
}))

/**
 * Venta o renovación. Crea el paquete "por cobrar" y retiene las clases elegidas (cupo validado aquí mismo).
 * Si alguna fecha está llena, no se crea nada y se indica cuál.
 */
router.post('/packages', h(async (req, res) => {
  const b = parse(z.object({
    clientId: uuid,
    productId: uuid,
    startsOn: ymd,
    expiresOn: ymd.optional(),
    priceCents: productBody.priceCents.optional(),
    groupId: uuid.nullable().optional(),
    sessionIds: z.array(uuid).max(60).optional(),
    holdUntil: ymd.nullable().optional(),
  }), req.body)

  const result = await tx(async (t) => {
    const product = await t.one('select * from products where id = $1', [b.productId])
    if (!product) throw new HttpError(404, 'Producto no encontrado', 'NOT_FOUND')
    const client = await t.one('select id from clients where id = $1 and archived_at is null', [b.clientId])
    if (!client) throw new HttpError(404, 'Clienta no encontrada', 'NOT_FOUND')

    const expiresOn = b.expiresOn || addDays(b.startsOn, product.validityDays - 1)
    if (expiresOn < b.startsOn) throw new HttpError(400, 'El vencimiento no puede ser anterior al inicio', 'VALIDATION', { field: 'expiresOn' })
    const sessionIds = [...new Set(b.sessionIds || [])]
    if (sessionIds.length > product.sessionsCount) {
      throw new HttpError(400, `Este producto incluye ${product.sessionsCount} ${product.sessionsCount === 1 ? 'clase' : 'clases'}`, 'VALIDATION', { field: 'sessionIds' })
    }
    const price = b.priceCents ?? product.priceCents
    const { holdDays } = await getSettings(t)
    const holdUntil = b.holdUntil === undefined ? addDays(todayCR(), holdDays) : b.holdUntil

    const pkg = await t.one(
      `insert into client_packages (client_id, product_id, name, kind, price_cents, currency, sessions_total,
                                    starts_on, expires_on, status, hold_until, group_id, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending_payment',$10,$11,$12) returning id`,
      [b.clientId, product.id, product.name, product.kind, price, product.currency, product.sessionsCount,
        b.startsOn, expiresOn, holdUntil, b.groupId ?? null, req.user.id])

    if (sessionIds.length) {
      const sessions = await t.query(
        'select id, local_date from class_sessions where id = any($1) order by starts_at', [sessionIds])
      if (sessions.length !== sessionIds.length) throw new HttpError(404, 'Alguna clase ya no existe', 'NOT_FOUND')
      for (const s of sessions) {
        if (s.localDate < b.startsOn || s.localDate > expiresOn) {
          throw new HttpError(409, `La clase del ${s.localDate} queda fuera de la vigencia del paquete`, 'OUT_OF_RANGE', { localDate: s.localDate })
        }
        const { booking, created } = await createBookingIn(t, {
          sessionId: s.id, clientId: b.clientId, actor: req.user, byStaff: true, packageId: pkg.id, status: 'pending',
        })
        // Si ya tenía reserva en esa clase, pasa a estar cubierta por este paquete.
        if (!created && booking.packageId !== pkg.id) {
          await t.run('update bookings set package_id = $2, updated_at = now() where id = $1', [booking.id, pkg.id])
        }
      }
    }
    if (b.groupId) await t.run('update clients set home_group_id = $2, updated_at = now() where id = $1', [b.clientId, b.groupId])
    // Un producto gratuito queda activo de inmediato.
    if (price === 0) await settlePackage(t, pkg.id, req.user)
    await audit(t, req.user.id, 'package.create', 'package', pkg.id, { ...b, price, expiresOn })
    return getPackage(t, pkg.id)
  })
  res.status(201).json({ package: withCode(result) })
}))

router.patch('/packages/:id', h(async (req, res) => {
  const { id } = parse(z.object({ id: uuid }), req.params)
  const b = parse(z.object({
    action: z.enum(['extend_hold', 'release_hold', 'cancel', 'extend_validity', 'activate_exception']),
    holdUntil: ymd.optional(),
    expiresOn: ymd.optional(),
    reason: z.string().trim().max(300).optional(),
  }), req.body)

  const result = await tx(async (t) => {
    const locked = await t.one('select * from client_packages where id = $1 for update', [id])
    if (!locked) throw new HttpError(404, 'Paquete no encontrado', 'NOT_FOUND')
    const needsReason = () => { if (!b.reason) throw new HttpError(400, 'Indica el motivo', 'VALIDATION', { field: 'reason' }) }
    // Suelta las clases retenidas o futuras; lo ya ocurrido se conserva.
    const freeBookings = (statuses) => t.run(
      `update bookings b set status = 'cancelled', cancelled_at = now(), updated_at = now(), reason = $3
         from class_sessions s
        where s.id = b.session_id and b.package_id = $1 and b.status = any($2) and b.attendance is null and s.starts_at > now()`,
      [id, statuses, b.reason || 'Cupo liberado'])

    if (b.action === 'extend_hold') {
      if (locked.status !== 'pending_payment') throw new HttpError(409, 'Este paquete ya no está por cobrar', 'INVALID_STATE')
      if (!b.holdUntil || b.holdUntil < todayCR()) throw new HttpError(400, 'Elige una fecha futura', 'VALIDATION', { field: 'holdUntil' })
      await t.run('update client_packages set hold_until = $2, updated_at = now() where id = $1', [id, b.holdUntil])
    } else if (b.action === 'release_hold') {
      if (locked.status !== 'pending_payment') throw new HttpError(409, 'Este paquete ya no está por cobrar', 'INVALID_STATE')
      await freeBookings(['pending'])
      await t.run('update client_packages set hold_until = null, updated_at = now() where id = $1', [id])
    } else if (b.action === 'cancel') {
      if (locked.status === 'cancelled') return getPackage(t, id)
      needsReason()
      await freeBookings(['pending', 'confirmed'])
      await t.run(`update client_packages set status = 'cancelled', cancel_reason = $2, hold_until = null, updated_at = now() where id = $1`, [id, b.reason])
    } else if (b.action === 'extend_validity') {
      needsReason()
      if (!b.expiresOn || b.expiresOn < locked.startsOn) throw new HttpError(400, 'Fecha de vencimiento inválida', 'VALIDATION', { field: 'expiresOn' })
      await t.run('update client_packages set expires_on = $2, extension_reason = $3, updated_at = now() where id = $1', [id, b.expiresOn, b.reason])
    } else if (b.action === 'activate_exception') {
      if (locked.status !== 'pending_payment') throw new HttpError(409, 'Este paquete ya no está por cobrar', 'INVALID_STATE')
      needsReason()
      await activate(t, await getPackage(t, id), req.user, b.reason)
    }
    await audit(t, req.user.id, `package.${b.action}`, 'package', id, { ...b, action: undefined })
    return getPackage(t, id)
  })
  res.json({ package: withCode(result) })
}))

// ─── PAGOS ─────────────────────────────────────────────
const PAYMENT_SELECT = `
  select y.id, y.client_id, y.package_id, y.kind, y.related_payment_id, y.amount_cents, y.currency, y.method, y.reference,
         y.status, y.received_on, y.verified_at, y.note, y.reject_reason, y.fx_rate, y.applied_cents, y.created_at,
         (y.proof_path is not null) as has_proof,
         c.full_name, c.student_number, c.whatsapp,
         p.name as package_name, p.currency as package_currency, p.starts_on as package_starts_on, g.name as group_name,
         v.full_name as verified_by_name,
         coalesce((select sum(r.amount_cents) from payments r where r.related_payment_id = y.id and r.kind = 'refund' and r.status = 'verified'), 0)::int as refunded_cents
    from payments y
    join clients c on c.id = y.client_id
    left join client_packages p on p.id = y.package_id
    left join class_groups g on g.id = p.group_id
    left join users v on v.id = y.verified_by`

const paymentFilters = (query) => {
  const q = parse(z.object({
    from: ymd.optional(), to: ymd.optional(),
    status: z.enum(['pending', 'to_verify', 'verified', 'rejected', 'all']).optional(),
    method: z.enum([...METHODS, 'all']).optional(),
    clientId: uuid.optional(), groupId: uuid.optional(),
    search: z.string().trim().max(80).optional(),
  }), query)
  const params = []
  const conds = []
  const add = (sql, value) => { params.push(value); conds.push(sql.replace('?', `$${params.length}`)) }
  // "Por verificar" se muestra completo aunque no se indique período.
  if (q.from) add('y.received_on >= ?', q.from)
  if (q.to) add('y.received_on <= ?', q.to)
  if (q.status && q.status !== 'all') add('y.status = ?', q.status)
  if (q.method && q.method !== 'all') add('y.method = ?', q.method)
  if (q.clientId) add('y.client_id = ?', q.clientId)
  if (q.groupId) add('p.group_id = ?', q.groupId)
  if (q.search) {
    params.push(`%${q.search.replace(/[%_\\]/g, '\\$&')}%`)
    conds.push(`(c.full_name ilike $${params.length} or y.reference ilike $${params.length})`)
  }
  return { where: conds.length ? `where ${conds.join(' and ')}` : '', params }
}

router.get('/payments', h(async (req, res) => {
  const { where, params } = paymentFilters(req.query)
  const payments = await db.query(`${PAYMENT_SELECT} ${where} order by y.received_on desc nulls first, y.created_at desc limit 500`, params)
  res.json({ payments: payments.map(withCode) })
}))

/** Importe aplicado al saldo del paquete, en la moneda del paquete. */
const appliedAmount = ({ amountCents, currency: cur, fxRate }, pkg) => {
  if (!pkg || pkg.currency === cur) return amountCents
  if (!fxRate) throw new HttpError(400, 'Indica el tipo de cambio: el pago está en otra moneda que el paquete', 'VALIDATION', { field: 'fxRate' })
  return Math.round(pkg.currency === 'USD' ? amountCents / fxRate : amountCents * fxRate)
}

router.post('/payments', h(async (req, res) => {
  const b = parse(z.object({
    clientId: uuid,
    packageId: uuid.nullable().optional(),
    amountCents: cents,
    currency,
    method: z.enum(METHODS, { errorMap: () => ({ message: 'Medio de pago inválido' }) }),
    reference: z.string().trim().max(120).optional(),
    receivedOn: ymd,
    verified: z.boolean(),
    fxRate: z.number().positive('Tipo de cambio inválido').max(100000).nullable().optional(),
    note: z.string().trim().max(500).optional(),
    idempotencyKey: z.string().min(8).max(100),
  }), req.body)
  if (b.receivedOn > todayCR()) throw new HttpError(400, 'La fecha de recepción no puede ser futura', 'VALIDATION', { field: 'receivedOn' })

  const result = await tx(async (t) => {
    // Doble toque o reintento: devuelve el pago ya registrado.
    const repeated = await t.one('select id from payments where idempotency_key = $1', [b.idempotencyKey])
    if (repeated) return { id: repeated.id, created: false }

    let pkg = null
    if (b.packageId) {
      pkg = await t.one('select id, client_id, currency, status from client_packages where id = $1 for update', [b.packageId])
      if (!pkg || pkg.clientId !== b.clientId) throw new HttpError(404, 'Paquete no encontrado para esta clienta', 'NOT_FOUND')
      if (pkg.status === 'cancelled') throw new HttpError(409, 'Este paquete está cancelado', 'INVALID_STATE')
    } else if (!(await t.one('select 1 as x from clients where id = $1', [b.clientId]))) {
      throw new HttpError(404, 'Clienta no encontrada', 'NOT_FOUND')
    }
    const applied = appliedAmount(b, pkg)
    const row = await t.one(
      `insert into payments (client_id, package_id, kind, amount_cents, currency, method, reference, status, received_on,
                             verified_by, verified_at, note, fx_rate, applied_cents, idempotency_key, created_by)
       values ($1,$2,'payment',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       on conflict (idempotency_key) do nothing returning id`,
      [b.clientId, b.packageId ?? null, b.amountCents, b.currency, b.method, b.reference ?? '', b.verified ? 'verified' : 'to_verify',
        b.receivedOn, b.verified ? req.user.id : null, b.verified ? new Date() : null, b.note ?? '',
        pkg && pkg.currency !== b.currency ? b.fxRate : null, applied, b.idempotencyKey, req.user.id])
    if (!row) return { id: (await t.one('select id from payments where idempotency_key = $1', [b.idempotencyKey])).id, created: false }
    await audit(t, req.user.id, 'payment.create', 'payment', row.id, { ...b, idempotencyKey: undefined })
    if (b.verified && pkg) await settlePackage(t, pkg.id, req.user)
    return { id: row.id, created: true }
  })
  const payment = (await db.query(`${PAYMENT_SELECT} where y.id = $1`, [result.id]))[0]
  res.status(result.created ? 201 : 200).json({ payment: withCode(payment), package: payment.packageId ? withCode(await getPackage(db, payment.packageId)) : null })
}))

router.post('/payments/:id/verify', h(async (req, res) => {
  const { id } = parse(z.object({ id: uuid }), req.params)
  await tx(async (t) => {
    const y = await t.one('select * from payments where id = $1 for update', [id])
    if (!y) throw new HttpError(404, 'Pago no encontrado', 'NOT_FOUND')
    if (y.status === 'verified') return // verificar dos veces no cambia nada
    if (y.status === 'rejected') throw new HttpError(409, 'Este pago fue rechazado', 'INVALID_STATE')
    await t.run(`update payments set status = 'verified', verified_by = $2, verified_at = now(), updated_at = now() where id = $1`, [id, req.user.id])
    await audit(t, req.user.id, 'payment.verify', 'payment', id)
    if (y.packageId) await settlePackage(t, y.packageId, req.user)
  })
  const payment = (await db.query(`${PAYMENT_SELECT} where y.id = $1`, [id]))[0]
  res.json({ payment: withCode(payment) })
}))

router.post('/payments/:id/reject', h(async (req, res) => {
  const { id } = parse(z.object({ id: uuid }), req.params)
  const b = parse(z.object({ reason: z.string({ required_error: 'Indica el motivo' }).trim().min(2, 'Indica el motivo').max(300) }), req.body)
  await tx(async (t) => {
    const y = await t.one('select * from payments where id = $1 for update', [id])
    if (!y) throw new HttpError(404, 'Pago no encontrado', 'NOT_FOUND')
    if (y.status === 'verified') throw new HttpError(409, 'Un pago verificado se corrige con un reembolso', 'INVALID_STATE')
    await t.run(`update payments set status = 'rejected', reject_reason = $2, updated_at = now() where id = $1`, [id, b.reason])
    await audit(t, req.user.id, 'payment.reject', 'payment', id, b)
  })
  res.json({ ok: true })
}))

// Reembolso: un registro nuevo ligado al pago original. El historial queda y los totales se corrigen.
router.post('/payments/:id/refund', h(async (req, res) => {
  const { id } = parse(z.object({ id: uuid }), req.params)
  const b = parse(z.object({
    amountCents: cents,
    refundedOn: ymd,
    reason: z.string({ required_error: 'Indica el motivo' }).trim().min(2, 'Indica el motivo').max(300),
    idempotencyKey: z.string().min(8).max(100),
  }), req.body)
  const refundId = await tx(async (t) => {
    const repeated = await t.one('select id from payments where idempotency_key = $1', [b.idempotencyKey])
    if (repeated) return repeated.id
    const y = await t.one('select * from payments where id = $1 for update', [id])
    if (!y || y.kind !== 'payment') throw new HttpError(404, 'Pago no encontrado', 'NOT_FOUND')
    if (y.status !== 'verified') throw new HttpError(409, 'Solo se reembolsa un pago verificado', 'INVALID_STATE')
    const { done } = await t.one(
      `select coalesce(sum(amount_cents),0)::int as done from payments where related_payment_id = $1 and kind = 'refund' and status = 'verified'`, [id])
    if (b.amountCents > y.amountCents - done) {
      throw new HttpError(409, 'El reembolso supera lo que queda de este pago', 'REFUND_TOO_LARGE', { field: 'amountCents' })
    }
    const applied = Math.round(y.appliedCents * (b.amountCents / y.amountCents))
    const row = await t.one(
      `insert into payments (client_id, package_id, kind, related_payment_id, amount_cents, currency, method, status, received_on,
                             verified_by, verified_at, note, fx_rate, applied_cents, idempotency_key, created_by)
       values ($1,$2,'refund',$3,$4,$5,$6,'verified',$7,$8,now(),$9,$10,$11,$12,$8) returning id`,
      [y.clientId, y.packageId, id, b.amountCents, y.currency, y.method, b.refundedOn, req.user.id, b.reason, y.fxRate, applied, b.idempotencyKey])
    await audit(t, req.user.id, 'payment.refund', 'payment', row.id, { ...b, idempotencyKey: undefined, original: id })
    return row.id
  })
  const payment = (await db.query(`${PAYMENT_SELECT} where y.id = $1`, [refundId]))[0]
  res.status(201).json({ payment: withCode(payment) })
}))

// ─── GASTOS Y TRANSFERENCIAS AL FONDO ──────────────────
const ledger = (table, dateCol, label) => {
  const body = z.object({
    date: ymd,
    amountCents: cents,
    currency,
    category: table === 'expenses' ? z.string({ required_error: 'Elige una categoría' }).trim().min(2, 'Elige una categoría').max(60) : z.undefined().optional(),
    note: z.string().trim().max(300).optional(),
  })
  router.get(`/${label}`, h(async (req, res) => {
    const { from, to } = range(req.query)
    const rows = await db.query(
      `select x.*, x.${dateCol} as date, u.full_name as created_by_name from ${table} x left join users u on u.id = x.created_by
        where x.${dateCol} between $1 and $2 order by x.${dateCol} desc, x.created_at desc`, [from, to])
    res.json({ from, to, items: rows })
  }))
  router.post(`/${label}`, h(async (req, res) => {
    const b = parse(body, req.body)
    if (b.date > todayCR()) throw new HttpError(400, 'La fecha no puede ser futura', 'VALIDATION', { field: 'date' })
    const row = table === 'expenses'
      ? await db.one(`insert into expenses (spent_on, category, amount_cents, currency, note, created_by) values ($1,$2,$3,$4,$5,$6) returning *, spent_on as date`,
        [b.date, b.category, b.amountCents, b.currency, b.note ?? '', req.user.id])
      : await db.one(`insert into savings_transfers (transferred_on, amount_cents, currency, note, created_by) values ($1,$2,$3,$4,$5) returning *, transferred_on as date`,
        [b.date, b.amountCents, b.currency, b.note ?? '', req.user.id])
    await audit(db, req.user.id, `${label}.create`, label, row.id, b)
    res.status(201).json({ item: row })
  }))
  router.delete(`/${label}/:id`, h(async (req, res) => {
    const { id } = parse(z.object({ id: uuid }), req.params)
    const row = await db.one(`delete from ${table} where id = $1 returning *`, [id])
    if (!row) throw new HttpError(404, 'Registro no encontrado', 'NOT_FOUND')
    // El registro borrado queda completo en la auditoría.
    await audit(db, req.user.id, `${label}.delete`, label, id, row)
    res.json({ ok: true })
  }))
}
ledger('expenses', 'spent_on', 'expenses')
ledger('savings_transfers', 'transferred_on', 'transfers')

// ─── CAJA ──────────────────────────────────────────────
const byCurrency = (rows, key = 'total') => {
  const out = { USD: 0, CRC: 0 }
  for (const r of rows) out[r.currency] = r[key]
  return out
}

export async function cajaSummary(q, { from, to }) {
  const sum = (sql, params = [from, to]) => q.query(sql, params)
  const [collected, refunds, expenses, transfers, savedAllTime, toVerify, settings] = await Promise.all([
    sum(`select currency, sum(amount_cents)::int as total, count(*)::int as n from payments
          where kind = 'payment' and status = 'verified' and received_on between $1 and $2 group by currency`),
    sum(`select currency, sum(amount_cents)::int as total from payments
          where kind = 'refund' and status = 'verified' and received_on between $1 and $2 group by currency`),
    sum(`select currency, sum(amount_cents)::int as total from expenses where spent_on between $1 and $2 group by currency`),
    sum(`select currency, sum(amount_cents)::int as total from savings_transfers where transferred_on between $1 and $2 group by currency`),
    sum(`select currency, sum(amount_cents)::int as total from savings_transfers group by currency`, []),
    sum(`select currency, sum(amount_cents)::int as total, count(*)::int as n from payments
          where kind = 'payment' and status = 'to_verify' group by currency`, []),
    getSettings(q),
  ])
  const receivables = (await listPackages(q,
    `where p.status in ('pending_payment','active') and p.price_cents > coalesce(pay.paid, 0)`, [], 'order by p.hold_until nulls last, p.created_at'))
  const c = byCurrency(collected)
  const r = byCurrency(refunds)
  const e = byCurrency(expenses)
  const t = byCurrency(transfers)
  const saved = byCurrency(savedAllTime)
  const totals = {}
  for (const cur of ['USD', 'CRC']) {
    totals[cur] = {
      collected: c[cur], refunds: r[cur], expenses: e[cur],
      // Disponible del período = cobros − reembolsos − gastos. Las transferencias al fondo no son gastos.
      available: c[cur] - r[cur] - e[cur],
      transferred: t[cur], savedAllTime: saved[cur],
      receivable: receivables.filter((p) => p.currency === cur).reduce((acc, p) => acc + p.balanceCents, 0),
      toVerify: toVerify.find((x) => x.currency === cur)?.total || 0,
    }
  }
  return {
    from, to, totals,
    paymentsCount: collected.reduce((acc, x) => acc + x.n, 0),
    toVerifyCount: toVerify.reduce((acc, x) => acc + x.n, 0),
    receivables: receivables.map(withCode),
    // Las metas de ahorro están en dólares.
    savings: {
      period: t.USD,
      goalMonth: settings.savingsGoalMonthCents,
      gapMonth: Math.max(0, settings.savingsGoalMonthCents - t.USD),
      total: saved.USD,
      goalTotal: settings.savingsGoalTotalCents,
      gapTotal: Math.max(0, settings.savingsGoalTotalCents - saved.USD),
    },
  }
}

router.get('/caja', h(async (req, res) => res.json(await cajaSummary(db, range(req.query)))))

// ─── EXPORTACIÓN CSV (mismos filtros que la pantalla) ──
const csv = (res, filename, header, rows) => {
  const cell = (v) => {
    const s = v === null || v === undefined ? '' : String(v)
    // Comillas para separadores y protección contra fórmulas al abrir en Excel.
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
    return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
  }
  const body = [header, ...rows].map((r) => r.map(cell).join(';')).join('\r\n')
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.send(`﻿${body}\r\n`)
}
const money = (centsValue) => (centsValue / 100).toFixed(2)
const KIND_LABEL = { payment: 'Cobro', refund: 'Reembolso', adjustment: 'Ajuste', void: 'Anulación' }
const STATUS_LABEL = { pending: 'Pendiente', to_verify: 'Por verificar', verified: 'Verificado', rejected: 'Rechazado' }
const METHOD_LABEL = { sinpe: 'SINPE', card: 'Tarjeta', cash: 'Efectivo', transfer: 'Transferencia', other: 'Otro' }

router.get('/export/payments.csv', h(async (req, res) => {
  const { where, params } = paymentFilters(req.query)
  const rows = await db.query(`${PAYMENT_SELECT} ${where} order by y.received_on, y.created_at`, params)
  csv(res, 'pagos.csv',
    ['Fecha de recepción', 'Tipo', 'Estado', 'ID alumna', 'Clienta', 'Paquete', 'Inicio del ciclo', 'Grupo', 'Medio', 'Referencia',
      'Monto', 'Moneda', 'Tipo de cambio', 'Aplicado al paquete', 'Moneda del paquete', 'Verificado por', 'Nota', 'ID de pago', 'Pago original'],
    rows.map((y) => [y.receivedOn, KIND_LABEL[y.kind], STATUS_LABEL[y.status], formatStudentNumber(y.studentNumber), y.fullName,
      y.packageName, y.packageStartsOn, y.groupName, METHOD_LABEL[y.method], y.reference,
      money(y.kind === 'refund' ? -y.amountCents : y.amountCents), y.currency, y.fxRate, y.packageId ? money(y.kind === 'refund' ? -y.appliedCents : y.appliedCents) : '',
      y.packageCurrency, y.verifiedByName, y.note || y.rejectReason, y.id, y.relatedPaymentId]))
}))

router.get('/export/expenses.csv', h(async (req, res) => {
  const { from, to } = range(req.query)
  const rows = await db.query('select * from expenses where spent_on between $1 and $2 order by spent_on, created_at', [from, to])
  csv(res, 'gastos.csv', ['Fecha', 'Categoría', 'Monto', 'Moneda', 'Nota'],
    rows.map((x) => [x.spentOn, x.category, money(x.amountCents), x.currency, x.note]))
}))

router.get('/export/transfers.csv', h(async (req, res) => {
  const { from, to } = range(req.query)
  const rows = await db.query('select * from savings_transfers where transferred_on between $1 and $2 order by transferred_on, created_at', [from, to])
  csv(res, 'transferencias-lindora.csv', ['Fecha', 'Monto', 'Moneda', 'Nota'],
    rows.map((x) => [x.transferredOn, money(x.amountCents), x.currency, x.note]))
}))

export { monthRange }
export default router
