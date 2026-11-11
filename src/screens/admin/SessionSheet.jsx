import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Ban, MessageCircle, Plus, RotateCcw, Search, UserPlus } from 'lucide-react'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { ATTENDANCE, BOOKING_STATUS, INTAKE, KIND, MODALITY, dayLabel, fmtTime, waLink } from '../../lib/format'
import { Avatar, Badge, Button, EmptyState, ErrorState, Field, IconButton, Input, Occupancy, SkeletonList, cx } from '../../ui'
import Sheet from '../../ui/Sheet'
import { useToast } from '../../ui/Toast'

const ATTENDANCE_OPTIONS = [
  ['attended', 'Asistió'],
  ['absent', 'Ausente'],
  ['cancelled_notice', 'Avisó'],
  ['cancelled_late', 'Canceló tarde'],
  ['made_up', 'Repuso'],
]

/** Invalida todo lo que depende de cupos y asistencia. */
export const useRefreshAgenda = () => {
  const qc = useQueryClient()
  return () => Promise.all(['dashboard', 'agenda', 'session', 'admin-bookings', 'clients', 'client'].map((key) => qc.invalidateQueries({ queryKey: [key] })))
}

function AddClient({ sessionId, full, onDone }) {
  const toast = useToast()
  const refresh = useRefreshAgenda()
  const [search, setSearch] = useState('')
  const term = search.trim()
  const results = useQuery({
    queryKey: ['clients', { search: term, limit: 8 }],
    queryFn: () => api.get('/admin/clients', { search: term, limit: 8 }),
    enabled: term.length >= 2,
  })
  const add = useMutation({
    mutationFn: (clientId) => api.post('/admin/bookings', { sessionId, clientId, joinWaitlist: full }),
    onSuccess: async ({ booking }) => {
      await refresh()
      toast.success(booking.status === 'waitlisted' ? 'Agregada a la lista de espera' : 'Reserva confirmada')
      onDone()
    },
    onError: toast.error,
  })

  return (
    <div className="rounded-3xl border border-line bg-surface p-4">
      <Field label={full ? 'Agregar a lista de espera' : 'Agregar clienta'}>
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden="true" />
          <Input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nombre, WhatsApp o ID" className="pl-11" />
        </div>
      </Field>
      {term.length >= 2 && (
        <ul className="mt-2 divide-y divide-line">
          {results.isLoading && <li className="py-3 text-sm text-ink-3">Buscando…</li>}
          {results.data?.clients.length === 0 && <li className="py-3 text-sm text-ink-3">Sin resultados. Crea la ficha desde Clientas.</li>}
          {results.data?.clients.map((c) => (
            <li key={c.id} className="flex items-center gap-3 py-2.5">
              <Avatar name={c.fullName} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{c.fullName}</p>
                <p className="tnum text-xs text-ink-3">{c.studentCode}</p>
              </div>
              <Button size="sm" variant="secondary" icon={Plus} loading={add.isPending && add.variables === c.id} disabled={add.isPending} onClick={() => add.mutate(c.id)}>
                Agregar
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function BookingRow({ booking, started, isAdmin }) {
  const toast = useToast()
  const refresh = useRefreshAgenda()
  const update = useMutation({
    mutationFn: (patch) => api.patch(`/admin/bookings/${booking.id}`, patch),
    onSuccess: refresh,
    onError: toast.error,
  })
  const status = BOOKING_STATUS[booking.status]
  const attendance = booking.attendance && ATTENDANCE[booking.attendance]
  const live = booking.status === 'pending' || booking.status === 'confirmed'
  const intakeFlag = booking.intakeStatus !== 'completed' ? INTAKE[booking.intakeStatus] : null

  return (
    <li className={cx('py-4', booking.status === 'cancelled' && 'opacity-60')}>
      <div className="flex items-center gap-3">
        <Avatar name={booking.fullName} />
        <div className="min-w-0 flex-1">
          {isAdmin
            ? <Link to={`/clientas/${booking.clientId}`} className="block truncate text-[15px] font-semibold text-ink hover:text-clay-deep">{booking.fullName}</Link>
            : <p className="truncate text-[15px] font-semibold text-ink">{booking.fullName}</p>}
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge tone={attendance ? attendance.tone : status.tone}>{attendance ? attendance.label : status.label}</Badge>
            {intakeFlag && <Badge tone={intakeFlag.tone}>{intakeFlag.label}</Badge>}
          </div>
        </div>
        {isAdmin && booking.whatsapp && (
          <IconButton icon={MessageCircle} label={`WhatsApp de ${booking.fullName}`} href={waLink(booking.whatsapp)} className="bg-sage-soft !text-sage" />
        )}
      </div>

      {/* Acciones según el estado */}
      <div className="mt-3 flex flex-wrap gap-1.5 pl-[52px]">
        {isAdmin && booking.status === 'pending' && (
          <Button size="sm" loading={update.isPending} onClick={() => update.mutate({ status: 'confirmed' })}>Confirmar</Button>
        )}
        {isAdmin && booking.status === 'waitlisted' && (
          <Button size="sm" loading={update.isPending} onClick={() => update.mutate({ status: 'confirmed' })}>Dar el cupo</Button>
        )}
        {isAdmin && booking.status === 'cancelled' && (
          <Button size="sm" variant="secondary" icon={RotateCcw} loading={update.isPending} onClick={() => update.mutate({ status: 'confirmed' })}>Restaurar</Button>
        )}
        {live && started && ATTENDANCE_OPTIONS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            disabled={update.isPending}
            aria-pressed={booking.attendance === value}
            onClick={() => update.mutate({ attendance: booking.attendance === value ? null : value })}
            className={cx(
              'h-9 rounded-full border px-3.5 text-[13px] font-semibold transition-colors disabled:opacity-50',
              booking.attendance === value ? 'border-ink bg-ink text-surface' : 'border-line bg-surface text-ink-2 hover:border-clay',
            )}
          >
            {label}
          </button>
        ))}
        {isAdmin && (booking.status === 'waitlisted' || (live && !started)) && (
          <Button size="sm" variant="ghost" disabled={update.isPending} onClick={() => update.mutate({ status: 'cancelled' })}>
            {booking.status === 'waitlisted' ? 'Quitar de la lista' : 'Cancelar reserva'}
          </Button>
        )}
      </div>
    </li>
  )
}

/** Lista del grupo: reservas, lista de espera y asistencia de una clase. */
export default function SessionSheet({ sessionId, onClose }) {
  const { isAdmin } = useAuth()
  const toast = useToast()
  const refresh = useRefreshAgenda()
  const [adding, setAdding] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [reason, setReason] = useState('')

  const query = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => api.get(`/admin/sessions/${sessionId}`),
    enabled: !!sessionId,
  })
  const setStatus = useMutation({
    mutationFn: (patch) => api.patch(`/admin/sessions/${sessionId}`, patch),
    onSuccess: async (_data, patch) => {
      await refresh()
      setCancelling(false)
      setReason('')
      toast.success(patch.status === 'cancelled' ? 'Clase cancelada' : 'Clase reactivada')
    },
    onError: toast.error,
  })

  const close = () => { setAdding(false); setCancelling(false); setReason(''); onClose() }
  const session = query.data?.session
  const bookings = query.data?.bookings || []
  const started = session ? new Date(session.startsAt) <= new Date() : false
  const cancelled = session?.status === 'cancelled'
  const full = session ? session.taken >= session.capacity : false
  const roster = bookings.filter((b) => b.status !== 'waitlisted')
  const waitlist = bookings.filter((b) => b.status === 'waitlisted')

  return (
    <Sheet
      open={!!sessionId}
      onClose={close}
      size="lg"
      title={session ? session.name : 'Clase'}
      subtitle={session && `${dayLabel(session.localDate)} · ${fmtTime(session.localTime)} · ${session.durationMin} min`}
    >
      {query.isLoading && <SkeletonList count={3} className="h-16" />}
      {query.isError && <ErrorState error={query.error} onRetry={query.refetch} />}
      {session && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="clay">{MODALITY[session.modality]}</Badge>
            <Badge>{KIND[session.kind]}</Badge>
            {session.instructorName && <Badge>{session.instructorName}</Badge>}
            {cancelled && <Badge tone="terracotta">Cancelada</Badge>}
            {session.blocked && <Badge tone="honey">Fecha bloqueada</Badge>}
            <span className="ml-auto"><Occupancy taken={session.taken} capacity={session.capacity} /></span>
          </div>

          {cancelled && session.cancelReason && (
            <p className="rounded-2xl bg-terracotta-soft px-4 py-3 text-sm text-terracotta">Motivo: {session.cancelReason}</p>
          )}

          {roster.length === 0 && waitlist.length === 0
            ? <EmptyState icon={UserPlus} title="Sin reservas todavía" text="Agrega una clienta o espera a que reserven desde la app." />
            : <ul className="divide-y divide-line">{roster.map((b) => <BookingRow key={b.id} booking={b} started={started} isAdmin={isAdmin} />)}</ul>}

          {waitlist.length > 0 && (
            <div>
              <p className="eyebrow mb-1">Lista de espera · {waitlist.length}</p>
              <ul className="divide-y divide-line">{waitlist.map((b) => <BookingRow key={b.id} booking={b} started={started} isAdmin={isAdmin} />)}</ul>
            </div>
          )}

          {isAdmin && !cancelled && (
            adding
              ? <AddClient sessionId={sessionId} full={full} onDone={() => setAdding(false)} />
              : <Button variant="secondary" icon={UserPlus} block onClick={() => setAdding(true)}>{full ? 'Agregar a lista de espera' : 'Agregar clienta'}</Button>
          )}

          {isAdmin && !started && (
            <div className="border-t border-line pt-4">
              {cancelled ? (
                <Button variant="secondary" icon={RotateCcw} loading={setStatus.isPending} onClick={() => setStatus.mutate({ status: 'scheduled' })}>Reactivar clase</Button>
              ) : cancelling ? (
                <div className="space-y-3">
                  <Field label="Motivo de la cancelación" hint="Las reservas se conservan para que decidas reposición o devolución." optional>
                    <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Feriado, mantenimiento…" />
                  </Field>
                  <div className="flex gap-2">
                    <Button variant="danger" loading={setStatus.isPending} onClick={() => setStatus.mutate({ status: 'cancelled', cancelReason: reason })}>Cancelar la clase</Button>
                    <Button variant="ghost" onClick={() => setCancelling(false)}>Volver</Button>
                  </div>
                </div>
              ) : (
                <Button variant="ghost" icon={Ban} className="!text-terracotta" onClick={() => setCancelling(true)}>Cancelar esta clase</Button>
              )}
            </div>
          )}
        </div>
      )}
    </Sheet>
  )
}
