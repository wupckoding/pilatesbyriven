import { tx } from '../db.js'
import { HttpError } from '../lib/http.js'
import { audit } from '../lib/audit.js'
import { claimPackageCredit } from './packages.js'

const LIVE = `('pending','confirmed','waitlisted')`
const HOLDING = `('pending','confirmed')`

const lockSession = async (t, sessionId) => {
  // FOR UPDATE serializa todas las operaciones de cupo de una misma sesión:
  // dos solicitudes simultáneas por el último lugar se atienden una tras otra.
  const session = await t.one('select * from class_sessions where id = $1 for update', [sessionId])
  if (!session) throw new HttpError(404, 'Clase no encontrada', 'NOT_FOUND')
  return session
}

const countTaken = async (t, sessionId) =>
  (await t.one(`select count(*)::int as n from bookings where session_id = $1 and status in ${HOLDING}`, [sessionId])).n

const isBlocked = async (t, session) =>
  !!(await t.one(
    `select 1 as x from schedule_blocks k
      where $1::date between k.starts_on and k.ends_on
        and (k.start_time is null or $2::time >= k.start_time)
        and (k.end_time is null or $2::time < k.end_time) limit 1`,
    [session.localDate, session.localTime],
  ))

/**
 * Crea una reserva validando el cupo dentro de la transacción.
 * - Repetir la misma solicitud (doble toque, reintento) devuelve la reserva existente.
 * - Si no hay lugar: 409 SESSION_FULL, o entra a lista de espera si joinWaitlist.
 */
export function createBooking(options) {
  return tx((t) => createBookingIn(t, options))
}

/**
 * Igual que createBooking pero dentro de una transacción ya abierta.
 * packageId: undefined = usar automáticamente un paquete vigente con crédito; null = sin paquete; id = ese paquete.
 * status: fuerza el estado inicial (la renovación retiene el cupo como 'pending' hasta el pago).
 */
export async function createBookingIn(t, { sessionId, clientId, actor, byStaff = false, joinWaitlist = false, packageId, status: forcedStatus }) {
  {
    const session = await lockSession(t, sessionId)
    if (session.status !== 'scheduled') throw new HttpError(409, 'Esta clase fue cancelada', 'SESSION_CANCELLED')

    if (!byStaff) {
      if (new Date(session.startsAt) <= new Date()) throw new HttpError(409, 'Esta clase ya comenzó', 'SESSION_PAST')
      if (!session.openBooking) throw new HttpError(403, 'Este horario se reserva con el estudio', 'NOT_OPEN')
      if (await isBlocked(t, session)) throw new HttpError(409, 'El estudio no atiende en este horario', 'SESSION_BLOCKED')
    }

    const client = await t.one('select id, archived_at from clients where id = $1', [clientId])
    if (!client || client.archivedAt) throw new HttpError(404, 'Clienta no encontrada', 'NOT_FOUND')

    const existing = await t.one(
      `select * from bookings where session_id = $1 and client_id = $2 and status in ${LIVE}`, [sessionId, clientId])
    if (existing) return { booking: existing, created: false }

    const taken = await countTaken(t, sessionId)
    let status
    if (taken < session.capacity) status = forcedStatus || (byStaff ? 'confirmed' : 'pending')
    else if (joinWaitlist) status = 'waitlisted'
    else throw new HttpError(409, 'Este horario está lleno', 'SESSION_FULL', { canWaitlist: true, localDate: session.localDate })

    // La lista de espera no consume crédito: se asigna al dar el cupo.
    let coveredBy = null
    if (status !== 'waitlisted' && packageId !== null) {
      const pkg = await claimPackageCredit(t, { clientId, localDate: session.localDate, packageId: packageId || null })
      coveredBy = pkg?.id || null
    }

    const booking = await t.one(
      `insert into bookings (session_id, client_id, status, package_id, created_by) values ($1,$2,$3,$4,$5) returning *`,
      [sessionId, clientId, status, coveredBy, actor.id],
    )
    await audit(t, actor.id, 'booking.create', 'booking', booking.id, { sessionId, clientId, status, packageId: coveredBy })
    return { booking, created: true }
  }
}

/**
 * Mueve una reserva a otra clase: libera el cupo anterior, toma el nuevo y conserva el mismo crédito.
 * La reserva original queda como 'rescheduled' y la nueva guarda el vínculo y el motivo.
 */
export function rescheduleBooking({ bookingId, targetSessionId, actor, reason = '' }) {
  return tx(async (t) => {
    const original = await t.one('select * from bookings where id = $1', [bookingId])
    if (!original) throw new HttpError(404, 'Reserva no encontrada', 'NOT_FOUND')
    if (original.sessionId === targetSessionId) throw new HttpError(400, 'Elige una clase distinta', 'VALIDATION')
    // Bloqueo de ambas sesiones en orden fijo para que dos cambios cruzados no se bloqueen entre sí.
    for (const id of [original.sessionId, targetSessionId].sort()) await lockSession(t, id)
    const booking = await t.one('select * from bookings where id = $1 for update', [bookingId])
    if (!['pending', 'confirmed'].includes(booking.status) || booking.attendance) {
      throw new HttpError(409, 'Solo se puede mover una reserva vigente y sin asistencia', 'INVALID_STATE')
    }
    const target = await t.one('select * from class_sessions where id = $1', [targetSessionId])
    if (target.status !== 'scheduled') throw new HttpError(409, 'La clase de destino está cancelada', 'SESSION_CANCELLED')
    const dup = await t.one(
      `select 1 as x from bookings where session_id = $1 and client_id = $2 and status in ${LIVE}`, [targetSessionId, booking.clientId])
    if (dup) throw new HttpError(409, 'La clienta ya tiene una reserva en esa clase', 'DUPLICATE')
    if ((await countTaken(t, targetSessionId)) >= target.capacity) {
      throw new HttpError(409, 'La clase de destino está llena', 'SESSION_FULL')
    }
    if (booking.packageId) {
      const pkg = await t.one('select expires_on from client_packages where id = $1 for update', [booking.packageId])
      if (target.localDate > pkg.expiresOn) {
        throw new HttpError(409, 'La nueva fecha queda fuera de la vigencia del paquete. Extiende la vigencia primero', 'PACKAGE_EXPIRED')
      }
    }
    await t.run(
      `update bookings set status = 'rescheduled', reason = $2, updated_at = now() where id = $1`, [bookingId, reason])
    const moved = await t.one(
      `insert into bookings (session_id, client_id, status, package_id, rescheduled_from_id, reason, created_by)
       values ($1,$2,$3,$4,$5,$6,$7) returning *`,
      [targetSessionId, booking.clientId, booking.status, booking.packageId, bookingId, reason, actor.id])
    await audit(t, actor.id, 'booking.reschedule', 'booking', moved.id, { from: booking.sessionId, to: targetSessionId, reason })
    return moved
  })
}

/** Cancelación hecha por la clienta. Dentro de la ventana de aviso queda como cancelación tardía. */
export function cancelOwnBooking({ bookingId, clientId, actor, cancelWindowHours }) {
  return tx(async (t) => {
    const booking = await t.one('select * from bookings where id = $1 for update', [bookingId])
    if (!booking || booking.clientId !== clientId) throw new HttpError(404, 'Reserva no encontrada', 'NOT_FOUND')
    if (booking.status === 'cancelled') return { booking, late: booking.attendance === 'cancelled_late' }
    if (!['pending', 'confirmed', 'waitlisted'].includes(booking.status)) {
      throw new HttpError(409, 'Esta reserva ya no se puede cancelar', 'NOT_CANCELLABLE')
    }
    const session = await t.one('select starts_at from class_sessions where id = $1', [booking.sessionId])
    const hoursLeft = (new Date(session.startsAt) - Date.now()) / 36e5
    if (hoursLeft <= 0) throw new HttpError(409, 'La clase ya comenzó', 'SESSION_PAST')

    const wasHolding = booking.status !== 'waitlisted'
    // Solo una reserva ya confirmada puede ser tardía: una solicitud sin confirmar no penaliza.
    const late = booking.status === 'confirmed' && hoursLeft < cancelWindowHours
    const attendance = wasHolding ? (late ? 'cancelled_late' : 'cancelled_notice') : null
    const updated = await t.one(
      `update bookings set status = 'cancelled', attendance = $2, cancelled_at = now(), updated_at = now()
        where id = $1 returning *`, [bookingId, attendance])
    await audit(t, actor.id, 'booking.cancel', 'booking', bookingId, { by: 'client', late })
    return { booking: updated, late }
  })
}

/** Cambios hechos por el personal: confirmar, cancelar, ofrecer cupo o pasar asistencia. */
export function staffUpdateBooking({ bookingId, actor, status, attendance, reason }) {
  return tx(async (t) => {
    const current = await t.one('select * from bookings where id = $1', [bookingId])
    if (!current) throw new HttpError(404, 'Reserva no encontrada', 'NOT_FOUND')
    const session = await lockSession(t, current.sessionId)
    if (actor.role === 'instructor' && session.instructorId !== actor.id) {
      throw new HttpError(403, 'Esta clase no está asignada a ti', 'FORBIDDEN')
    }
    const booking = await t.one('select * from bookings where id = $1 for update', [bookingId])

    let nextStatus = booking.status
    let nextAttendance = booking.attendance
    let nextPackageId = booking.packageId

    if (attendance !== undefined) {
      if (booking.status === 'waitlisted') throw new HttpError(409, 'Está en lista de espera', 'INVALID_STATE')
      nextAttendance = attendance
      if (attendance === 'cancelled_notice' || attendance === 'cancelled_late') nextStatus = 'cancelled'
      else if (attendance !== null) nextStatus = 'confirmed'
    }
    if (status !== undefined) {
      if (actor.role !== 'admin') throw new HttpError(403, 'Solo administración cambia el estado', 'FORBIDDEN')
      nextStatus = status
      if (status === 'confirmed' && attendance === undefined
          && ['cancelled_notice', 'cancelled_late'].includes(nextAttendance)) nextAttendance = null
    }

    // Volver a ocupar un cupo (desde espera o cancelada) exige que haya lugar.
    const holdsNow = ['pending', 'confirmed'].includes(booking.status)
    const willHold = ['pending', 'confirmed'].includes(nextStatus)
    if (willHold && !holdsNow) {
      if (session.status !== 'scheduled') throw new HttpError(409, 'Esta clase fue cancelada', 'SESSION_CANCELLED')
      if ((await countTaken(t, session.id)) >= session.capacity) {
        throw new HttpError(409, 'No hay cupo disponible en esta clase', 'SESSION_FULL')
      }
      const dup = await t.one(
        `select 1 as x from bookings where session_id = $1 and client_id = $2 and status in ${LIVE} and id <> $3`,
        [session.id, booking.clientId, bookingId])
      if (dup) throw new HttpError(409, 'La clienta ya tiene otra reserva en esta clase', 'DUPLICATE')
      // Al volver a ocupar un cupo se toma un crédito vigente (si la reserva ya consumía uno, lo conserva).
      const alreadyCounted = ['cancelled_late', 'absent', 'attended', 'made_up'].includes(booking.attendance)
      if (!(booking.packageId && alreadyCounted)) {
        const pkg = await claimPackageCredit(t, {
          clientId: booking.clientId, localDate: session.localDate, packageId: booking.packageId || null,
        }).catch((err) => { if (err.code === 'NO_CREDIT') return null; throw err })
        nextPackageId = pkg?.id || null
      }
    }

    const updated = await t.one(
      `update bookings set status = $2, attendance = $3, reason = coalesce($4, reason), package_id = $5,
              cancelled_at = case when $2 = 'cancelled' then coalesce(cancelled_at, now()) else null end,
              updated_at = now()
        where id = $1 returning *`,
      [bookingId, nextStatus, nextAttendance, reason ?? null, nextPackageId])
    await audit(t, actor.id, 'booking.update', 'booking', bookingId, {
      from: { status: booking.status, attendance: booking.attendance },
      to: { status: nextStatus, attendance: nextAttendance },
    })
    return updated
  })
}
