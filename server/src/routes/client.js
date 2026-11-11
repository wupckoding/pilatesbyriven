import { Router } from 'express'
import { z } from 'zod'
import { db } from '../db.js'
import { h, parse, HttpError } from '../lib/http.js'
import { addDays, todayCR } from '../lib/time.js'
import { requireAuth } from '../auth.js'
import { SESSION_SELECT } from '../services/sessions.js'
import { createBooking, cancelOwnBooking } from '../services/bookings.js'
import { getSettings } from '../services/settings.js'

// Rutas de la clienta autenticada: solo ve y modifica sus propios datos.
const router = Router()
router.use(requireAuth)

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida')

const ownClient = async (req) => {
  const client = await db.one('select id from clients where user_id = $1 and archived_at is null', [req.user.id])
  if (!client) throw new HttpError(403, 'Tu cuenta no tiene una ficha de clienta', 'NO_CLIENT')
  return client
}

// Horarios disponibles: solo conteos de cupo, nunca nombres de otras clientas.
router.get('/sessions', h(async (req, res) => {
  const today = todayCR()
  const q = parse(z.object({ from: ymd.optional(), to: ymd.optional() }), req.query)
  const from = q.from && q.from > today ? q.from : today
  const to = q.to && q.to <= addDays(today, 60) ? q.to : addDays(from, 13)
  const client = await ownClient(req)

  const rows = await db.query(
    `${SESSION_SELECT}
      where s.local_date between $1 and $2 and s.status = 'scheduled' and s.open_booking and s.starts_at > now()
      order by s.starts_at`, [from, to])
  const mine = await db.query(
    `select b.id, b.session_id, b.status from bookings b
       join class_sessions s on s.id = b.session_id
      where b.client_id = $1 and b.status in ('pending','confirmed','waitlisted') and s.local_date between $2 and $3`,
    [client.id, from, to])
  const mineBySession = new Map(mine.map((b) => [b.sessionId, b]))

  res.json({
    from, to,
    sessions: rows.filter((s) => !s.blocked).map((s) => ({
      id: s.id, localDate: s.localDate, localTime: s.localTime, startsAt: s.startsAt, name: s.name,
      modality: s.modality, kind: s.kind, durationMin: s.durationMin, capacity: s.capacity,
      spotsLeft: Math.max(0, s.capacity - s.taken),
      instructorName: s.instructorName,
      myBooking: mineBySession.get(s.id) || null,
    })),
  })
}))

router.get('/bookings', h(async (req, res) => {
  const client = await ownClient(req)
  const rows = await db.query(
    `select b.id, b.status, b.attendance, b.created_at, b.cancelled_at,
            s.id as session_id, s.local_date, s.local_time, s.starts_at, s.name, s.modality, s.kind,
            s.duration_min, s.status as session_status, s.cancel_reason, u.full_name as instructor_name
       from bookings b
       join class_sessions s on s.id = b.session_id
       left join users u on u.id = s.instructor_id
      where b.client_id = $1
      order by s.starts_at desc limit 200`, [client.id])
  const now = Date.now()
  const isLive = (b) => ['pending', 'confirmed', 'waitlisted'].includes(b.status) && b.sessionStatus === 'scheduled'
  const upcoming = rows.filter((b) => new Date(b.startsAt) > now && isLive(b)).reverse()
  const past = rows.filter((b) => !upcoming.includes(b))
  const { cancelWindowHours } = await getSettings()
  res.json({ upcoming, past, cancelWindowHours })
}))

router.post('/bookings', h(async (req, res) => {
  const body = parse(z.object({
    sessionId: z.string().uuid('Clase inválida'),
    joinWaitlist: z.boolean().optional(),
  }), req.body)
  const client = await ownClient(req)
  const { booking, created } = await createBooking({
    sessionId: body.sessionId, clientId: client.id, actor: req.user, joinWaitlist: !!body.joinWaitlist,
  })
  res.status(created ? 201 : 200).json({ booking })
}))

router.post('/bookings/:id/cancel', h(async (req, res) => {
  const { id } = parse(z.object({ id: z.string().uuid('Reserva inválida') }), req.params)
  const client = await ownClient(req)
  const { cancelWindowHours } = await getSettings()
  res.json(await cancelOwnBooking({ bookingId: id, clientId: client.id, actor: req.user, cancelWindowHours }))
}))

export default router
