import { Router } from 'express'
import { z } from 'zod'
import { db, tx } from '../db.js'
import { h, parse, HttpError } from '../lib/http.js'
import { normalizeWhatsapp } from '../lib/phone.js'
import { audit } from '../lib/audit.js'
import { addDays, todayCR, weekStart, formatStudentNumber } from '../lib/time.js'
import { requireAuth, requireRole } from '../auth.js'
import { SESSION_SELECT, generateSessions } from '../services/sessions.js'
import { createBooking, rescheduleBooking, staffUpdateBooking } from '../services/bookings.js'
import { getSettings, saveSettings } from '../services/settings.js'
import { listPackages } from '../services/packages.js'
import { cajaSummary, monthRange } from './commerce.js'

const router = Router()
router.use(requireAuth)

const staff = requireRole('admin', 'instructor')
const admin = requireRole('admin')

const uuid = z.string().uuid('Identificador inválido')
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida')
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora inválida')
const MODALITIES = ['reformer', 'cadillac', 'mat']
const KINDS = ['group', 'duo', 'private', 'trial']
const STATUSES = ['interested', 'trial_scheduled', 'active', 'paused', 'inactive']
const SOURCES = ['instagram', 'whatsapp', 'referral', 'form', 'app', 'other']

const withCode = (c) => c && { ...c, studentCode: formatStudentNumber(c.studentNumber) }
// Una instructora solo ve sus propias clases.
const instructorFilter = (req, params) => {
  if (req.user.role !== 'instructor') return ''
  params.push(req.user.id)
  return ` and s.instructor_id = $${params.length}`
}

// ─── INICIO ────────────────────────────────────────────
router.get('/dashboard', staff, h(async (req, res) => {
  const today = todayCR()
  const monday = weekStart(today)
  const sunday = addDays(monday, 6)

  const params = [today, today]
  const todaySessions = await db.query(
    `${SESSION_SELECT} where s.local_date between $1 and $2 and s.status = 'scheduled'${instructorFilter(req, params)}
      order by s.starts_at`, params)
  const roster = todaySessions.length ? await db.query(
    `select b.id, b.session_id, b.status, b.attendance, c.id as client_id, c.full_name, c.intake_status
       from bookings b join clients c on c.id = b.client_id
      where b.session_id = any($1) and b.status in ('pending','confirmed')
      order by c.full_name`, [todaySessions.map((s) => s.id)]) : []
  for (const s of todaySessions) s.roster = roster.filter((r) => r.sessionId === s.id)

  const weekParams = [monday, sunday]
  const week = await db.one(
    `select count(*)::int as sessions, coalesce(sum(x.capacity),0)::int as capacity, coalesce(sum(x.taken),0)::int as taken
       from (${SESSION_SELECT} where s.local_date between $1 and $2 and s.status = 'scheduled'${instructorFilter(req, weekParams)}) x`,
    weekParams)

  const body = { today, weekFrom: monday, weekTo: sunday, todaySessions, week: { ...week, free: Math.max(0, week.capacity - week.taken) } }

  if (req.user.role === 'admin') {
    const settings = await getSettings()
    body.counts = await db.one(
      `select
         (select count(*)::int from bookings b join class_sessions s on s.id = b.session_id
           where b.status = 'pending' and s.starts_at > now() and not exists (select 1 from client_packages h where h.id = b.package_id and h.status = 'pending_payment')) as pending_bookings,
         (select count(*)::int from bookings b join class_sessions s on s.id = b.session_id
           where b.status = 'waitlisted' and s.starts_at > now()) as waitlisted,
         (select count(*)::int from bookings b join class_sessions s on s.id = b.session_id
           where b.status = 'confirmed' and b.attendance is null
             and s.starts_at < now() and s.local_date >= $1::date - 14) as attendance_pending,
         (select count(*)::int from clients where archived_at is null) as clients_total,
         (select count(distinct b.client_id)::int from bookings b where b.attendance = 'attended') as clients_attended,
         (select count(*)::int from clients where archived_at is null and status = 'active') as clients_active,
         (select count(*)::int from clients where archived_at is null and next_followup_on <= $1::date) as followups_due,
         (select count(*)::int from payments where kind = 'payment' and status = 'to_verify') as payments_to_verify,
         (select count(*)::int from client_packages where status = 'pending_payment' and hold_until < $1::date) as holds_expired,
         (select count(*)::int from client_packages
           where status = 'active' and kind = 'package' and expires_on >= $1::date and expires_on <= $1::date + $2::int) as renewals_due`,
      [today, settings.renewalNoticeDays])

    // Resumen mensual: cobros por fecha de recepción, paquetes por mes de servicio.
    const month = monthRange(today)
    const caja = await cajaSummary(db, month)
    const paid = await db.one(
      `select count(*)::int as n from client_packages
        where kind = 'package' and status = 'active' and starts_on between $1 and $2`, [month.from, month.to])
    body.month = {
      ...month,
      packagesPaid: paid.n,
      packagesGoal: settings.monthlyPackagesGoal,
      totals: caja.totals,
      savings: caja.savings,
      receivablesCount: caja.receivables.length,
    }
  }
  res.json(body)
}))

// ─── AGENDA ────────────────────────────────────────────
router.get('/agenda', staff, h(async (req, res) => {
  const q = parse(z.object({ from: ymd, to: ymd }), req.query)
  if (q.to < q.from || q.to > addDays(q.from, 92)) throw new HttpError(400, 'Rango de fechas inválido', 'VALIDATION')
  const params = [q.from, q.to]
  const sessions = await db.query(
    `${SESSION_SELECT} where s.local_date between $1 and $2${instructorFilter(req, params)} order by s.starts_at`, params)
  const blocks = await db.query(
    'select * from schedule_blocks where starts_on <= $2 and ends_on >= $1 order by starts_on', [q.from, q.to])
  res.json({ from: q.from, to: q.to, sessions, blocks })
}))

router.get('/sessions/:id', staff, h(async (req, res) => {
  const { id } = parse(z.object({ id: uuid }), req.params)
  const params = [id]
  const session = (await db.query(`${SESSION_SELECT} where s.id = $1${instructorFilter(req, params)}`, params))[0]
  if (!session) throw new HttpError(404, 'Clase no encontrada', 'NOT_FOUND')
  // La instructora ve nombre y estado de admisión; el contacto queda para administración.
  const contact = req.user.role === 'admin' ? ', c.whatsapp' : ''
  const bookings = await db.query(
    `select b.id, b.status, b.attendance, b.created_at, b.offered_at, b.package_id, (kp.status = 'pending_payment') as held_for_payment,
            c.id as client_id, c.full_name, c.student_number, c.intake_status${contact}
       from bookings b join clients c on c.id = b.client_id left join client_packages kp on kp.id = b.package_id
      where b.session_id = $1 and b.status <> 'rescheduled'
      order by case b.status when 'confirmed' then 0 when 'pending' then 1 when 'waitlisted' then 2 else 3 end, b.created_at`,
    [id])
  res.json({ session, bookings: bookings.map(withCode) })
}))

const sessionFields = {
  name: z.string().trim().min(1, 'Escribe un nombre').max(80),
  modality: z.enum(MODALITIES, { errorMap: () => ({ message: 'Modalidad inválida' }) }),
  kind: z.enum(KINDS, { errorMap: () => ({ message: 'Tipo de clase inválido' }) }),
  durationMin: z.number({ invalid_type_error: 'Duración inválida' }).int().min(15, 'Mínimo 15 minutos').max(240, 'Máximo 240 minutos'),
  capacity: z.number({ invalid_type_error: 'Capacidad inválida' }).int().min(1, 'Mínimo 1 cupo').max(50, 'Máximo 50 cupos'),
  instructorId: uuid.nullable(),
  openBooking: z.boolean(),
}

// Aviso de choque: misma instructora con otra clase que se solapa.
const findConflicts = (q, { instructorId, localDate, localTime, durationMin, excludeId = null }) =>
  !instructorId ? [] : q.query(
    `select id, name, local_date, local_time from class_sessions
      where instructor_id = $1 and local_date = $2 and status = 'scheduled' and ($5::uuid is null or id <> $5)
        and local_time < ($3::time + make_interval(mins => $4))
        and (local_time + make_interval(mins => duration_min)) > $3::time`,
    [instructorId, localDate, localTime, durationMin, excludeId])

router.post('/sessions', admin, h(async (req, res) => {
  const body = parse(z.object({
    ...sessionFields,
    instructorId: sessionFields.instructorId.optional(),
    openBooking: sessionFields.openBooking.optional(),
    localDate: ymd, localTime: hhmm,
  }), req.body)
  const session = await db.one(
    `insert into class_sessions (local_date, local_time, starts_at, name, modality, kind, duration_min, capacity,
                                 instructor_id, open_booking, is_override)
     values ($1, $2, ($1::date + $2::time) at time zone 'America/Costa_Rica', $3,$4,$5,$6,$7,$8,$9, true) returning *`,
    [body.localDate, body.localTime, body.name, body.modality, body.kind, body.durationMin, body.capacity,
      body.instructorId ?? null, body.openBooking ?? true])
  await audit(db, req.user.id, 'session.create', 'session', session.id, body)
  res.status(201).json({ session, conflicts: await findConflicts(db, { ...session, excludeId: session.id }) })
}))

router.patch('/sessions/:id', admin, h(async (req, res) => {
  const { id } = parse(z.object({ id: uuid }), req.params)
  const body = parse(z.object({
    localDate: ymd.optional(), localTime: hhmm.optional(),
    capacity: sessionFields.capacity.optional(),
    instructorId: sessionFields.instructorId.optional(),
    status: z.enum(['scheduled', 'cancelled']).optional(),
    cancelReason: z.string().trim().max(300).optional(),
  }), req.body)

  const session = await tx(async (t) => {
    const current = await t.one('select * from class_sessions where id = $1 for update', [id])
    if (!current) throw new HttpError(404, 'Clase no encontrada', 'NOT_FOUND')
    if (body.capacity !== undefined) {
      const { n } = await t.one(
        `select count(*)::int as n from bookings where session_id = $1 and status in ('pending','confirmed')`, [id])
      if (body.capacity < n) throw new HttpError(409, `Ya hay ${n} reservas: la capacidad no puede ser menor`, 'CAPACITY_BELOW_BOOKED')
    }
    const next = {
      localDate: body.localDate ?? current.localDate,
      localTime: body.localTime ?? current.localTime,
      capacity: body.capacity ?? current.capacity,
      instructorId: body.instructorId !== undefined ? body.instructorId : current.instructorId,
      status: body.status ?? current.status,
      cancelReason: body.status === 'cancelled' ? (body.cancelReason ?? '') : (body.status === 'scheduled' ? '' : current.cancelReason),
    }
    const updated = await t.one(
      `update class_sessions set local_date = $2, local_time = $3,
              starts_at = ($2::date + $3::time) at time zone 'America/Costa_Rica',
              capacity = $4, instructor_id = $5, status = $6, cancel_reason = $7, is_override = true, updated_at = now()
        where id = $1 returning *`,
      [id, next.localDate, next.localTime, next.capacity, next.instructorId, next.status, next.cancelReason])
    await audit(t, req.user.id, 'session.update', 'session', id, { from: current, changes: body })
    return updated
  })
  res.json({ session, conflicts: await findConflicts(db, { ...session, excludeId: id }) })
}))

// ─── GRUPOS RECURRENTES ────────────────────────────────
router.get('/groups', admin, h(async (_req, res) => {
  const groups = await db.query(
    `select g.*, u.full_name as instructor_name,
            (select count(*)::int from clients c where c.home_group_id = g.id and c.archived_at is null) as members
       from class_groups g left join users u on u.id = g.instructor_id
      order by g.is_active desc, (g.weekday + 6) % 7, g.start_time`)
  res.json({ groups })
}))

router.post('/groups', admin, h(async (req, res) => {
  const body = parse(z.object({
    ...sessionFields,
    instructorId: sessionFields.instructorId.optional(),
    openBooking: sessionFields.openBooking.optional(),
    weekday: z.number().int().min(0).max(6),
    startTime: hhmm,
    startsOn: ymd.optional(),
  }), req.body)
  const group = await tx(async (t) => {
    const created = await t.one(
      `insert into class_groups (name, modality, kind, weekday, start_time, duration_min, capacity, instructor_id, open_booking, starts_on)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`,
      [body.name, body.modality, body.kind, body.weekday, body.startTime, body.durationMin, body.capacity,
        body.instructorId ?? null, body.openBooking ?? true, body.startsOn ?? todayCR()])
    await generateSessions(t)
    await audit(t, req.user.id, 'group.create', 'group', created.id, body)
    return created
  })
  res.status(201).json({ group })
}))

// Cambia la serie desde una fecha: lo ya ocurrido y los cambios puntuales se conservan.
router.patch('/groups/:id', admin, h(async (req, res) => {
  const { id } = parse(z.object({ id: uuid }), req.params)
  const body = parse(z.object({
    name: sessionFields.name.optional(),
    modality: sessionFields.modality.optional(),
    startTime: hhmm.optional(),
    durationMin: sessionFields.durationMin.optional(),
    capacity: sessionFields.capacity.optional(),
    instructorId: sessionFields.instructorId.optional(),
    openBooking: z.boolean().optional(),
    isActive: z.boolean().optional(),
    effectiveFrom: ymd.optional(),
  }), req.body)
  const today = todayCR()
  const from = body.effectiveFrom && body.effectiveFrom > today ? body.effectiveFrom : today

  const group = await tx(async (t) => {
    const current = await t.one('select * from class_groups where id = $1 for update', [id])
    if (!current) throw new HttpError(404, 'Grupo no encontrado', 'NOT_FOUND')
    const next = {
      name: body.name ?? current.name,
      modality: body.modality ?? current.modality,
      startTime: body.startTime ?? current.startTime,
      durationMin: body.durationMin ?? current.durationMin,
      capacity: body.capacity ?? current.capacity,
      instructorId: body.instructorId !== undefined ? body.instructorId : current.instructorId,
      openBooking: body.openBooking ?? current.openBooking,
      isActive: body.isActive ?? current.isActive,
    }
    if (next.capacity < current.capacity) {
      const over = await t.one(
        `select s.local_date, count(*)::int as n from class_sessions s join bookings b on b.session_id = s.id
          where s.group_id = $1 and s.local_date >= $2 and s.status = 'scheduled' and not s.is_override
            and b.status in ('pending','confirmed')
          group by s.id having count(*) > $3 order by s.local_date limit 1`, [id, from, next.capacity])
      if (over) throw new HttpError(409, `El ${over.localDate} ya tiene ${over.n} reservas: resuélvelo antes de reducir la capacidad`, 'CAPACITY_BELOW_BOOKED')
    }
    const updated = await t.one(
      `update class_groups set name=$2, modality=$3, start_time=$4, duration_min=$5, capacity=$6,
              instructor_id=$7, open_booking=$8, is_active=$9, updated_at=now() where id=$1 returning *`,
      [id, next.name, next.modality, next.startTime, next.durationMin, next.capacity, next.instructorId, next.openBooking, next.isActive])
    await t.run(
      `update class_sessions set name=$3, modality=$4, local_time=$5,
              starts_at = (local_date + $5::time) at time zone 'America/Costa_Rica',
              duration_min=$6, capacity=$7, instructor_id=$8, open_booking=$9, updated_at=now()
        where group_id=$1 and local_date >= $2 and status='scheduled' and not is_override and starts_at > now()`,
      [id, from, next.name, next.modality, next.startTime, next.durationMin, next.capacity, next.instructorId, next.openBooking])
    if (!next.isActive) {
      // Al desactivar, se quitan las sesiones futuras que nadie reservó; las demás quedan para resolver a mano.
      await t.run(
        `delete from class_sessions s where s.group_id=$1 and s.local_date >= $2 and s.starts_at > now()
            and not exists (select 1 from bookings b where b.session_id = s.id)`, [id, from])
    } else {
      await generateSessions(t)
    }
    await audit(t, req.user.id, 'group.update', 'group', id, { from, changes: body })
    return updated
  })
  res.json({ group })
}))

// ─── RESERVAS (personal) ───────────────────────────────
router.post('/bookings', admin, h(async (req, res) => {
  const body = parse(z.object({ sessionId: uuid, clientId: uuid, joinWaitlist: z.boolean().optional() }), req.body)
  const { booking, created } = await createBooking({
    sessionId: body.sessionId, clientId: body.clientId, actor: req.user, byStaff: true, joinWaitlist: !!body.joinWaitlist,
  })
  res.status(created ? 201 : 200).json({ booking })
}))

// Reprogramar: libera el cupo anterior, toma el nuevo y conserva el crédito.
router.post('/bookings/:id/reschedule', admin, h(async (req, res) => {
  const { id } = parse(z.object({ id: uuid }), req.params)
  const body = parse(z.object({ sessionId: uuid, reason: z.string().trim().max(300).optional() }), req.body)
  const booking = await rescheduleBooking({ bookingId: id, targetSessionId: body.sessionId, actor: req.user, reason: body.reason || '' })
  res.status(201).json({ booking })
}))

// Listas detrás de los indicadores de Inicio: por confirmar, en espera y asistencia por tomar.
router.get('/bookings', admin, h(async (req, res) => {
  const { view } = parse(z.object({ view: z.enum(['pending', 'waitlist', 'attendance']) }), req.query)
  const where = {
    pending: `b.status = 'pending' and s.starts_at > now() and not exists (select 1 from client_packages h where h.id = b.package_id and h.status = 'pending_payment')`,
    waitlist: `b.status = 'waitlisted' and s.starts_at > now()`,
    attendance: `b.status = 'confirmed' and b.attendance is null and s.starts_at < now() and s.local_date >= $1::date - 14`,
  }[view]
  const bookings = await db.query(
    `select b.id, b.status, b.attendance, b.created_at,
            c.id as client_id, c.full_name, c.student_number, c.whatsapp,
            s.id as session_id, s.name as session_name, s.local_date, s.local_time, s.modality, s.capacity,
            (select count(*)::int from bookings x where x.session_id = s.id and x.status in ('pending','confirmed')) as taken
       from bookings b
       join clients c on c.id = b.client_id
       join class_sessions s on s.id = b.session_id
      where ${where} and ($1::date is not null)
      order by s.starts_at, b.created_at limit 200`, [todayCR()])
  res.json({ bookings: bookings.map(withCode) })
}))

router.patch('/bookings/:id', staff, h(async (req, res) => {
  const { id } = parse(z.object({ id: uuid }), req.params)
  const body = parse(z.object({
    status: z.enum(['confirmed', 'cancelled', 'waitlisted']).optional(),
    attendance: z.enum(['attended', 'absent', 'cancelled_notice', 'cancelled_late', 'made_up']).nullable().optional(),
    reason: z.string().trim().max(300).optional(),
  }).refine((b) => b.status !== undefined || b.attendance !== undefined, { message: 'Nada que actualizar' }), req.body)
  res.json({ booking: await staffUpdateBooking({ bookingId: id, actor: req.user, ...body }) })
}))

// ─── CLIENTAS ──────────────────────────────────────────
router.get('/clients', admin, h(async (req, res) => {
  const q = parse(z.object({
    search: z.string().trim().max(80).optional(),
    status: z.enum([...STATUSES, 'all']).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
    followup: z.enum(['1']).optional(),
  }), req.query)
  const params = []
  const conds = ['c.archived_at is null']
  if (q.followup) { params.push(todayCR()); conds.push(`c.next_followup_on <= $${params.length}::date`) }
  if (q.status && q.status !== 'all') { params.push(q.status); conds.push(`c.status = $${params.length}`) }
  if (q.search) {
    const digits = q.search.replace(/\D/g, '')
    params.push(`%${q.search.replace(/[%_\\]/g, '\\$&')}%`)
    const like = `$${params.length}`
    const parts = [`c.full_name ilike ${like}`, `c.email::text ilike ${like}`]
    if (digits.length >= 3) { params.push(`%${digits}%`); parts.push(`c.whatsapp like $${params.length}`) }
    if (digits && digits.length <= 6) { params.push(Number(digits)); parts.push(`c.student_number = $${params.length}`) }
    conds.push(`(${parts.join(' or ')})`)
  }
  params.push(q.limit ?? 100)
  const clients = await db.query(
    `select c.id, c.student_number, c.full_name, c.whatsapp, c.email, c.status, c.source, c.intake_status,
            c.next_followup_on, c.created_at, g.name as group_name,
            (select min(s.starts_at) from bookings b join class_sessions s on s.id = b.session_id
              where b.client_id = c.id and b.status in ('pending','confirmed') and s.starts_at > now()) as next_class_at
       from clients c left join class_groups g on g.id = c.home_group_id
      where ${conds.join(' and ')}
      order by lower(c.full_name) limit $${params.length}`, params)
  res.json({ clients: clients.map(withCode) })
}))

const clientFields = {
  fullName: z.string({ required_error: 'Escribe el nombre' }).trim().min(2, 'Escribe el nombre completo').max(120),
  whatsapp: z.string().trim().max(40).nullable().optional(),
  email: z.union([z.literal(''), z.string().trim().toLowerCase().email('Correo inválido')]).nullable().optional(),
  birthDate: ymd.nullable().optional(),
  status: z.enum(STATUSES).optional(),
  source: z.enum(SOURCES).optional(),
  preferredModality: z.enum(MODALITIES).nullable().optional(),
  preferredDays: z.string().trim().max(200).optional(),
  internalNotes: z.string().trim().max(4000).optional(),
  emergencyName: z.string().trim().max(120).optional(),
  emergencyPhone: z.string().trim().max(40).optional(),
  nextFollowupOn: ymd.nullable().optional(),
  homeGroupId: uuid.nullable().optional(),
}

const cleanWhatsapp = (raw) => {
  if (raw === undefined) return undefined
  if (raw === null || raw === '') return null
  const value = normalizeWhatsapp(raw)
  if (!value) throw new HttpError(400, 'Revisa el número de WhatsApp (incluye código de país si no es de Costa Rica)', 'VALIDATION', { field: 'whatsapp' })
  return value
}

const findDuplicates = (q, { whatsapp, email, excludeId = null }) =>
  (!whatsapp && !email) ? [] : q.query(
    `select id, student_number, full_name, whatsapp, email, status from clients
      where archived_at is null and ($3::uuid is null or id <> $3)
        and (($1::text is not null and whatsapp = $1) or ($2::text is not null and email = $2::citext))`,
    [whatsapp || null, email || null, excludeId])

router.post('/clients', admin, h(async (req, res) => {
  const body = parse(z.object({ ...clientFields, confirmDuplicate: z.boolean().optional() }), req.body)
  const whatsapp = cleanWhatsapp(body.whatsapp) ?? null
  const email = body.email || null
  if (!body.confirmDuplicate) {
    const duplicates = await findDuplicates(db, { whatsapp, email })
    if (duplicates.length) {
      throw new HttpError(409, 'Ya existe una ficha con este WhatsApp o correo', 'POSSIBLE_DUPLICATE', { duplicates: duplicates.map(withCode) })
    }
  }
  const client = await db.one(
    `insert into clients (full_name, whatsapp, email, birth_date, status, source, preferred_modality, preferred_days,
                          internal_notes, emergency_name, emergency_phone, next_followup_on, home_group_id)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning *`,
    [body.fullName, whatsapp, email, body.birthDate ?? null, body.status ?? 'interested', body.source ?? 'other',
      body.preferredModality ?? null, body.preferredDays ?? '', body.internalNotes ?? '', body.emergencyName ?? '',
      body.emergencyPhone ?? '', body.nextFollowupOn ?? null, body.homeGroupId ?? null])
  await audit(db, req.user.id, 'client.create', 'client', client.id)
  res.status(201).json({ client: withCode(client) })
}))

router.get('/clients/:id', admin, h(async (req, res) => {
  const { id } = parse(z.object({ id: uuid }), req.params)
  const client = await db.one(
    `select c.*, g.name as group_name, (c.user_id is not null) as has_account
       from clients c left join class_groups g on g.id = c.home_group_id where c.id = $1`, [id])
  if (!client) throw new HttpError(404, 'Clienta no encontrada', 'NOT_FOUND')
  const bookings = await db.query(
    `select b.id, b.status, b.attendance, b.created_at, b.package_id,
            s.id as session_id, s.local_date, s.local_time, s.starts_at, s.name, s.modality, s.status as session_status
       from bookings b join class_sessions s on s.id = b.session_id
      where b.client_id = $1 and b.status <> 'rescheduled' order by s.starts_at desc limit 100`, [id])
  const now = Date.now()
  const live = (b) => ['pending', 'confirmed', 'waitlisted'].includes(b.status) && b.sessionStatus === 'scheduled'
  const upcoming = bookings.filter((b) => new Date(b.startsAt) > now && live(b)).reverse()
  const stats = await db.one(
    `select count(*) filter (where attendance = 'attended')::int as attended,
            count(*) filter (where attendance = 'absent')::int as absent,
            count(*) filter (where attendance in ('cancelled_notice','cancelled_late'))::int as cancelled
       from bookings where client_id = $1`, [id])
  const packages = await listPackages(db, 'where p.client_id = $2', [id], 'order by p.starts_on desc, p.created_at desc')
  const payments = await db.query(
    `select y.id, y.kind, y.amount_cents, y.currency, y.method, y.reference, y.status, y.received_on, y.package_id, y.note
       from payments y where y.client_id = $1 order by y.created_at desc limit 50`, [id])
  res.json({ client: withCode(client), upcoming, history: bookings.filter((b) => !upcoming.includes(b)), stats, packages, payments })
}))

router.patch('/clients/:id', admin, h(async (req, res) => {
  const { id } = parse(z.object({ id: uuid }), req.params)
  const body = parse(z.object({ ...clientFields, fullName: clientFields.fullName.optional() }), req.body)
  const current = await db.one('select * from clients where id = $1 and archived_at is null', [id])
  if (!current) throw new HttpError(404, 'Clienta no encontrada', 'NOT_FOUND')
  const whatsapp = cleanWhatsapp(body.whatsapp)
  const pick = (key, value) => (value !== undefined ? value : current[key])
  const client = await db.one(
    `update clients set full_name=$2, whatsapp=$3, email=$4, birth_date=$5, status=$6, source=$7, preferred_modality=$8,
            preferred_days=$9, internal_notes=$10, emergency_name=$11, emergency_phone=$12, next_followup_on=$13,
            home_group_id=$14, updated_at=now()
      where id=$1 returning *`,
    [id, pick('fullName', body.fullName), pick('whatsapp', whatsapp),
      body.email !== undefined ? (body.email || null) : current.email,
      pick('birthDate', body.birthDate), pick('status', body.status), pick('source', body.source),
      pick('preferredModality', body.preferredModality), pick('preferredDays', body.preferredDays),
      pick('internalNotes', body.internalNotes), pick('emergencyName', body.emergencyName),
      pick('emergencyPhone', body.emergencyPhone), pick('nextFollowupOn', body.nextFollowupOn),
      pick('homeGroupId', body.homeGroupId)])
  await audit(db, req.user.id, 'client.update', 'client', id, { fields: Object.keys(body) })
  res.json({ client: withCode(client) })
}))

// ─── PERSONAL Y AJUSTES ────────────────────────────────
router.get('/staff', admin, h(async (_req, res) => {
  res.json({ staff: await db.query(
    `select id, full_name, email, role from users where role in ('admin','instructor') and is_active order by full_name`) })
}))

router.get('/settings', admin, h(async (_req, res) => res.json({ settings: await getSettings() })))

router.put('/settings', admin, h(async (req, res) => {
  const body = parse(z.object({
    cancelWindowHours: z.number().int().min(0, 'Mínimo 0 horas').max(72, 'Máximo 72 horas').optional(),
    renewalNoticeDays: z.number().int().min(0).max(30).optional(),
    holdDays: z.number().int().min(0, 'Mínimo 0 días').max(60, 'Máximo 60 días').optional(),
    absentConsumesCredit: z.boolean().optional(),
    lateCancelConsumesCredit: z.boolean().optional(),
    monthlyPackagesGoal: z.number().int().min(0).max(1000).optional(),
    savingsGoalMonthCents: z.number().int().min(0).optional(),
    savingsGoalTotalCents: z.number().int().min(0).optional(),
    studioWhatsapp: z.string().trim().max(20).optional(),
  }), req.body)
  const settings = await saveSettings(db, body)
  await audit(db, req.user.id, 'settings.update', 'settings', null, body)
  res.json({ settings })
}))

export default router
