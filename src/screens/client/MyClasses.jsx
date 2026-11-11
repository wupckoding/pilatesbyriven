import React, { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { CalendarHeart, History } from 'lucide-react'
import { api } from '../../lib/api'
import { ATTENDANCE, MODALITY, capitalize, fmtDate, fmtTime } from '../../lib/format'
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, Segmented, SkeletonList } from '../../ui'
import Sheet from '../../ui/Sheet'
import { useToast } from '../../ui/Toast'
import { BookingCard, DateBlock, MyPackageCard, STATUS_HELP, useMyBookings, useMyPackages, useRefreshMine } from './shared'

function PastRow({ booking }) {
  const state = booking.attendance
    ? ATTENDANCE[booking.attendance]
    : booking.sessionStatus === 'cancelled' ? { label: 'Cancelada por el estudio', tone: 'terracotta' }
      : booking.status === 'cancelled' ? { label: 'Cancelada', tone: 'neutral' }
        : { label: 'Realizada', tone: 'neutral' }
  return (
    <div className="flex items-center gap-4 px-4 py-3.5">
      <DateBlock ymd={booking.localDate} />
      <div className="min-w-0 flex-1 border-l border-line pl-4">
        <p className="truncate text-sm font-semibold text-ink">{fmtTime(booking.localTime)} · {MODALITY[booking.modality]}</p>
        <p className="text-[13px] text-ink-3">{capitalize(fmtDate(booking.localDate, { weekday: 'long' }))}</p>
      </div>
      <Badge tone={state.tone}>{state.label}</Badge>
    </div>
  )
}

export default function MyClasses() {
  const toast = useToast()
  const refresh = useRefreshMine()
  const [tab, setTab] = useState('upcoming')
  const [cancelling, setCancelling] = useState(null)
  const { data, isLoading, isError, error, refetch } = useMyBookings()
  const packages = useMyPackages()

  const cancel = useMutation({
    mutationFn: (id) => api.post(`/bookings/${id}/cancel`),
    onSuccess: async ({ late }) => {
      await refresh()
      setCancelling(null)
      toast.success(late ? 'Reserva cancelada (cancelación tardía)' : 'Reserva cancelada')
    },
    onError: (err) => { toast.error(err); setCancelling(null); refresh() },
  })

  const hoursLeft = cancelling ? (new Date(cancelling.startsAt) - Date.now()) / 36e5 : 0
  const isLate = cancelling && cancelling.status === 'confirmed' && hoursLeft < (data?.cancelWindowHours ?? 0)

  return (
    <div className="mx-auto max-w-2xl space-y-6 lg:mx-0 lg:max-w-none">
      <PageHeader eyebrow="Mis clases" title="Tu agenda" />
      {packages.data?.packages.length > 0 && (
        <div className="grid gap-3 lg:grid-cols-2">
          {packages.data.packages.slice(0, 2).map((p) => <MyPackageCard key={p.id} pkg={p} />)}
        </div>
      )}
      <Segmented
        label="Clases"
        value={tab}
        onChange={setTab}
        options={[{ value: 'upcoming', label: 'Próximas', count: data?.upcoming.length }, { value: 'past', label: 'Historial' }]}
      />

      {isLoading && <SkeletonList />}
      {isError && <ErrorState error={error} onRetry={refetch} />}

      {data && tab === 'upcoming' && (
        data.upcoming.length === 0
          ? <EmptyState icon={CalendarHeart} title="No tienes clases agendadas" text="Reserva tu próxima clase en un par de toques." action={<Button to="/reservar">Ver horarios</Button>} />
          : (
            <div className="grid gap-x-4 gap-y-3 lg:grid-cols-2">
              {data.upcoming.map((b) => (
                <div key={b.id}>
                  <BookingCard
                    booking={b}
                    action={<Button size="sm" variant="ghost" onClick={() => setCancelling(b)}>{b.status === 'waitlisted' ? 'Salir' : 'Cancelar'}</Button>}
                  />
                  <p className="mt-1.5 px-2 text-[13px] text-ink-3">{STATUS_HELP[b.status]}</p>
                </div>
              ))}
            </div>
          )
      )}

      {data && tab === 'past' && (
        data.past.length === 0
          ? <EmptyState icon={History} title="Aún no hay historial" text="Aquí verás tus clases anteriores y tu asistencia." />
          : <Card className="max-w-3xl divide-y divide-line overflow-hidden">{data.past.map((b) => <PastRow key={b.id} booking={b} />)}</Card>
      )}

      <Sheet
        open={!!cancelling}
        onClose={() => !cancel.isPending && setCancelling(null)}
        size="sm"
        title={cancelling?.status === 'waitlisted' ? 'Salir de la lista de espera' : 'Cancelar reserva'}
        footer={cancelling && (
          <>
            <Button variant="ghost" disabled={cancel.isPending} onClick={() => setCancelling(null)}>Conservar</Button>
            <Button variant="danger" loading={cancel.isPending} onClick={() => cancel.mutate(cancelling.id)}>
              {cancelling.status === 'waitlisted' ? 'Salir de la lista' : 'Sí, cancelar'}
            </Button>
          </>
        )}
      >
        {cancelling && (
          <div className="space-y-4">
            <p className="text-[15px] text-ink">
              {capitalize(fmtDate(cancelling.localDate))} · {fmtTime(cancelling.localTime)} · {MODALITY[cancelling.modality]}
            </p>
            {isLate ? (
              <p className="rounded-2xl bg-honey-soft px-4 py-3 text-sm font-medium leading-relaxed text-honey" role="alert">
                Faltan menos de {data.cancelWindowHours} horas para la clase. Quedará registrada como cancelación tardía
                y puede contar como clase tomada según las reglas de tu paquete.
              </p>
            ) : (
              <p className="text-sm leading-relaxed text-ink-2">
                {cancelling.status === 'waitlisted'
                  ? 'Dejarás de esperar un cupo en este horario.'
                  : 'Tu lugar quedará libre para otra persona.'}
              </p>
            )}
          </div>
        )}
      </Sheet>
    </div>
  )
}
