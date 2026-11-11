import React, { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { CalendarOff, Check } from 'lucide-react'
import { api } from '../../lib/api'
import { BOOKING_STATUS, KIND, MODALITY, addDays, capitalize, dayLabel, fmtDate, fmtTime, todayCR } from '../../lib/format'
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, SkeletonList, cx } from '../../ui'
import Sheet from '../../ui/Sheet'
import { useToast } from '../../ui/Toast'
import { STATUS_HELP, useRefreshMine } from './shared'

const DAYS_AHEAD = 21

function SessionRow({ session, onPick }) {
  const mine = session.myBooking
  const full = session.spotsLeft === 0
  return (
    <Card className="flex items-center gap-4 p-4 sm:p-5">
      <div className="w-[78px] shrink-0 border-r border-line pr-4 text-center">
        <p className="display tnum text-[26px] text-ink">{fmtTime(session.localTime).split(' ')[0]}</p>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">{fmtTime(session.localTime).split(' ').slice(1).join(' ')}</p>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold text-ink">{MODALITY[session.modality]}</p>
        <p className="mt-0.5 truncate text-[13px] text-ink-3">
          {KIND[session.kind]} · {session.durationMin} min{session.instructorName ? ` · ${session.instructorName}` : ''}
        </p>
        <p className={cx('mt-1.5 text-[13px] font-semibold', full ? 'text-ink-3' : session.spotsLeft === 1 ? 'text-terracotta' : 'text-sage')}>
          {full ? 'Sin cupos' : session.spotsLeft === 1 ? 'Queda 1 lugar' : `${session.spotsLeft} lugares disponibles`}
        </p>
      </div>
      {mine
        ? <Badge tone={BOOKING_STATUS[mine.status].tone}><Check className="h-3 w-3" aria-hidden="true" />{BOOKING_STATUS[mine.status].label}</Badge>
        : <Button size="sm" variant={full ? 'secondary' : 'primary'} onClick={onPick}>{full ? 'Lista de espera' : 'Reservar'}</Button>}
    </Card>
  )
}

export default function Book() {
  const toast = useToast()
  const refresh = useRefreshMine()
  const today = todayCR()
  const to = addDays(today, DAYS_AHEAD - 1)
  const [day, setDay] = useState(today)
  const [picked, setPicked] = useState(null)
  const [result, setResult] = useState(null)

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['sessions', today, to],
    queryFn: () => api.get('/sessions', { from: today, to }),
    refetchInterval: 45_000, // los cupos cambian: se refrescan solos
  })

  const days = useMemo(() => Array.from({ length: DAYS_AHEAD }, (_, i) => addDays(today, i)), [today])
  const byDay = useMemo(() => {
    const map = {}
    for (const s of data?.sessions || []) (map[s.localDate] ||= []).push(s)
    return map
  }, [data])
  const list = byDay[day] || []
  const firstWithClasses = days.find((d) => byDay[d]?.length)

  const book = useMutation({
    mutationFn: ({ session, joinWaitlist }) => api.post('/bookings', { sessionId: session.id, joinWaitlist }),
    onSuccess: async ({ booking }, { session }) => {
      await refresh()
      setPicked(null)
      setResult({ booking, session })
    },
    onError: async (err, { session }) => {
      // Alguien tomó el último lugar mientras confirmaba: se ofrece la lista de espera.
      if (err.code === 'SESSION_FULL') {
        await refresh()
        setPicked({ ...session, spotsLeft: 0, lostSpot: true })
      } else {
        toast.error(err)
        setPicked(null)
        refresh()
      }
    },
  })

  const pickedFull = picked?.spotsLeft === 0

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader eyebrow="Reservar" title="Elige tu clase" subtitle="Horarios en hora de Costa Rica." />

      {/* Tira de días */}
      <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pb-1 sm:mx-0 sm:px-0" role="tablist" aria-label="Día">
        {days.map((d) => {
          const active = d === day
          const count = byDay[d]?.length || 0
          return (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={active}
              aria-label={`${capitalize(fmtDate(d))}${count ? `, ${count} clases` : ', sin clases'}`}
              onClick={() => setDay(d)}
              className={cx(
                'flex h-[76px] w-[58px] shrink-0 flex-col items-center justify-center rounded-2xl border transition-all duration-150',
                active ? 'border-ink bg-ink text-surface shadow-card' : 'border-line bg-surface text-ink hover:border-clay',
                !count && !active && 'opacity-45',
              )}
            >
              <span className={cx('text-[10px] font-bold uppercase tracking-label', active ? 'text-white/70' : 'text-ink-3')}>
                {fmtDate(d, { weekday: 'short' }).replace('.', '')}
              </span>
              <span className="display tnum text-2xl leading-tight">{Number(d.slice(8))}</span>
              <span className={cx('mt-0.5 h-1 w-1 rounded-full', count ? (active ? 'bg-clay' : 'bg-clay-deep') : 'bg-transparent')} />
            </button>
          )
        })}
      </div>

      <h2 className="display text-[26px] text-ink">{dayLabel(day)}</h2>

      {isLoading && <SkeletonList count={3} />}
      {isError && <ErrorState error={error} onRetry={refetch} />}
      {data && list.length === 0 && (
        <EmptyState
          icon={CalendarOff}
          title="Sin clases este día"
          text={firstWithClasses ? `La próxima fecha con horarios es ${fmtDate(firstWithClasses)}.` : 'Aún no hay horarios publicados. Escríbenos por WhatsApp.'}
          action={firstWithClasses && <Button variant="secondary" onClick={() => setDay(firstWithClasses)}>Ir a esa fecha</Button>}
        />
      )}
      <div className="space-y-3">
        {list.map((s) => <SessionRow key={s.id} session={s} onPick={() => setPicked(s)} />)}
      </div>

      {/* Confirmación antes de reservar */}
      <Sheet
        open={!!picked}
        onClose={() => !book.isPending && setPicked(null)}
        size="sm"
        title={pickedFull ? 'Lista de espera' : 'Confirma tu reserva'}
        footer={picked && (
          <>
            <Button variant="ghost" disabled={book.isPending} onClick={() => setPicked(null)}>Ahora no</Button>
            <Button loading={book.isPending} onClick={() => book.mutate({ session: picked, joinWaitlist: pickedFull })}>
              {pickedFull ? 'Entrar a la lista' : 'Reservar'}
            </Button>
          </>
        )}
      >
        {picked && (
          <div className="space-y-4">
            {picked.lostSpot && (
              <p className="rounded-2xl bg-honey-soft px-4 py-3 text-sm font-medium text-honey" role="alert">
                Alguien tomó el último lugar hace un momento. Puedes entrar a la lista de espera.
              </p>
            )}
            <Card className="divide-y divide-line">
              {[
                ['Fecha', capitalize(fmtDate(picked.localDate))],
                ['Hora', fmtTime(picked.localTime)],
                ['Clase', `${MODALITY[picked.modality]} · ${KIND[picked.kind]}`],
                ['Duración', `${picked.durationMin} min`],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-4 px-5 py-3">
                  <p className="text-[13px] text-ink-3">{label}</p>
                  <p className="text-sm font-semibold text-ink">{value}</p>
                </div>
              ))}
            </Card>
            <p className="text-sm leading-relaxed text-ink-2">
              {pickedFull
                ? 'Este horario está lleno. Si se libera un cupo, el estudio te contactará para ofrecértelo.'
                : 'Tu solicitud queda pendiente hasta que el estudio la confirme. Verás el estado en Mis clases.'}
            </p>
          </div>
        )}
      </Sheet>

      {/* Resultado claro: pendiente o en espera */}
      <Sheet
        open={!!result}
        onClose={() => setResult(null)}
        size="sm"
        title={result?.booking.status === 'waitlisted' ? 'Estás en la lista' : 'Solicitud enviada'}
        footer={<><Button variant="ghost" onClick={() => setResult(null)}>Seguir reservando</Button><Button to="/clases">Ver mis clases</Button></>}
      >
        {result && (
          <div className="flex flex-col items-center py-4 text-center">
            <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-sage-soft text-sage"><Check className="h-7 w-7" aria-hidden="true" /></span>
            <p className="display mt-5 text-[28px] text-ink">{capitalize(dayLabel(result.session.localDate))} · {fmtTime(result.session.localTime)}</p>
            <div className="mt-3"><Badge tone={BOOKING_STATUS[result.booking.status].tone}>{BOOKING_STATUS[result.booking.status].label}</Badge></div>
            <p className="mt-3 max-w-xs text-sm text-ink-2">{STATUS_HELP[result.booking.status]}</p>
          </div>
        )}
      </Sheet>
    </div>
  )
}
