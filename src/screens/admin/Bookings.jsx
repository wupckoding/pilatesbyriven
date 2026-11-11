import React, { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { CircleCheck, MessageCircle } from 'lucide-react'
import { api } from '../../lib/api'
import { MODALITY, dayLabel, fmtTime, waLink } from '../../lib/format'
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, IconButton, Occupancy, PageHeader, Segmented, SkeletonList } from '../../ui'
import { useToast } from '../../ui/Toast'
import SessionSheet, { useRefreshAgenda } from './SessionSheet'

const VIEWS = {
  pending: { label: 'Por confirmar', empty: 'No hay reservas por confirmar.', hint: 'Solicitudes hechas desde la app que esperan tu confirmación.' },
  waitlist: { label: 'Lista de espera', empty: 'Nadie está esperando un cupo.', hint: 'Cuando se libere un lugar, decide a quién ofrecérselo.' },
  attendance: { label: 'Asistencia', empty: 'La asistencia está al día.', hint: 'Clases de los últimos 14 días sin asistencia registrada.' },
}

function Row({ booking, view, onOpen }) {
  const toast = useToast()
  const refresh = useRefreshAgenda()
  const update = useMutation({
    mutationFn: (patch) => api.patch(`/admin/bookings/${booking.id}`, patch),
    onSuccess: refresh,
    onError: toast.error,
  })
  const full = booking.taken >= booking.capacity
  return (
    <Card className="flex flex-wrap items-center gap-x-4 gap-y-3 p-4">
      <Avatar name={booking.fullName} />
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <p className="truncate text-[15px] font-semibold text-ink">{booking.fullName}</p>
        <p className="mt-0.5 truncate text-[13px] text-ink-2">
          {dayLabel(booking.localDate)} · {fmtTime(booking.localTime)} · {booking.sessionName}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge tone="clay">{MODALITY[booking.modality]}</Badge>
          <Occupancy taken={booking.taken} capacity={booking.capacity} />
        </div>
      </button>
      <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
        {booking.whatsapp && <IconButton icon={MessageCircle} label={`WhatsApp de ${booking.fullName}`} href={waLink(booking.whatsapp)} className="bg-sage-soft !text-sage" />}
        {view === 'pending' && (
          <>
            <Button size="sm" variant="ghost" disabled={update.isPending} onClick={() => update.mutate({ status: 'cancelled' })}>Rechazar</Button>
            <Button size="sm" loading={update.isPending} onClick={() => update.mutate({ status: 'confirmed' })}>Confirmar</Button>
          </>
        )}
        {view === 'waitlist' && (
          <Button size="sm" disabled={full} loading={update.isPending} onClick={() => update.mutate({ status: 'confirmed' })} title={full ? 'La clase sigue llena' : undefined}>
            {full ? 'Sin cupo' : 'Dar el cupo'}
          </Button>
        )}
        {view === 'attendance' && (
          <>
            <Button size="sm" variant="secondary" disabled={update.isPending} onClick={() => update.mutate({ attendance: 'absent' })}>Ausente</Button>
            <Button size="sm" loading={update.isPending} onClick={() => update.mutate({ attendance: 'attended' })}>Asistió</Button>
          </>
        )}
      </div>
    </Card>
  )
}

export default function Bookings() {
  const [params, setParams] = useSearchParams()
  const view = VIEWS[params.get('vista')] ? params.get('vista') : 'pending'
  const [openSession, setOpenSession] = useState(null)
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin-bookings', view],
    queryFn: () => api.get('/admin/bookings', { view }),
  })

  return (
    <div className="space-y-7">
      <PageHeader eyebrow="Reservas" title="Pendientes por resolver" subtitle={VIEWS[view].hint} />
      <Segmented
        label="Tipo de pendiente"
        value={view}
        onChange={(next) => setParams({ vista: next }, { replace: true })}
        options={Object.entries(VIEWS).map(([value, v]) => ({ value, label: v.label }))}
      />
      {isLoading && <SkeletonList />}
      {isError && <ErrorState error={error} onRetry={refetch} />}
      {data && data.bookings.length === 0 && <EmptyState icon={CircleCheck} title="Todo al día" text={VIEWS[view].empty} />}
      <div className="space-y-3">
        {data?.bookings.map((b) => <Row key={b.id} booking={b} view={view} onOpen={() => setOpenSession(b.sessionId)} />)}
      </div>
      <SessionSheet sessionId={openSession} onClose={() => setOpenSession(null)} />
    </div>
  )
}
