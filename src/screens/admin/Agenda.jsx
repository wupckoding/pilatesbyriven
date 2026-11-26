import React, { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CalendarOff, ChevronLeft, ChevronRight, Pencil, Plus, Repeat } from 'lucide-react'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { MODALITY, WEEKDAYS, addDays, capitalize, fmtDate, fmtTime, todayCR, weekStart } from '../../lib/format'
import { Badge, Button, Card, EmptyState, ErrorState, IconButton, Occupancy, PageHeader, Segmented, SkeletonList, cx } from '../../ui'
import SessionSheet from './SessionSheet'
import ClassForm from './ClassForm'

function SessionChip({ session, onOpen }) {
  const cancelled = session.status === 'cancelled'
  const full = session.taken >= session.capacity
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cx(
        'w-full rounded-2xl border bg-surface p-3 text-left transition-all duration-150 hover:-translate-y-px hover:border-clay hover:shadow-card',
        cancelled ? 'border-dashed border-line opacity-60' : full ? 'border-clay/60' : 'border-line',
      )}
    >
      <p className="truncate text-[10px] font-bold uppercase tracking-label text-clay-deep">{MODALITY[session.modality]}</p>
      <p className="tnum mt-0.5 whitespace-nowrap text-sm font-bold text-ink">{fmtTime(session.localTime)}</p>
      <p className={cx('mt-0.5 truncate text-[13px] text-ink-2', cancelled && 'line-through')} title={session.name}>{session.name}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {cancelled ? <Badge tone="terracotta">Cancelada</Badge> : <Occupancy taken={session.taken} capacity={session.capacity} />}
        {session.waitlisted > 0 && <Badge tone="clay">+{session.waitlisted} en espera</Badge>}
        {session.blocked && !cancelled && <Badge tone="honey">Bloqueada</Badge>}
      </div>
    </button>
  )
}

function WeekView({ onOpen }) {
  const today = todayCR()
  const [from, setFrom] = useState(() => weekStart(today))
  const to = addDays(from, 6)
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['agenda', from, to],
    queryFn: () => api.get('/admin/agenda', { from, to }),
    placeholderData: (prev) => prev,
  })
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(from, i)), [from])
  const byDay = useMemo(() => {
    const map = Object.fromEntries(days.map((d) => [d, []]))
    for (const s of data?.sessions || []) map[s.localDate]?.push(s)
    return map
  }, [data, days])
  const summary = useMemo(() => {
    const active = (data?.sessions || []).filter((s) => s.status === 'scheduled')
    return {
      sessions: active.length,
      capacity: active.reduce((sum, s) => sum + s.capacity, 0),
      taken: active.reduce((sum, s) => sum + s.taken, 0),
    }
  }, [data])
  const sameMonth = from.slice(0, 7) === to.slice(0, 7)
  const range = `${fmtDate(from, sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'short' })} – ${fmtDate(to, { day: 'numeric', month: 'long' })}`

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-full border border-line bg-surface">
          <IconButton icon={ChevronLeft} label="Semana anterior" onClick={() => setFrom(addDays(from, -7))} />
          <IconButton icon={ChevronRight} label="Semana siguiente" onClick={() => setFrom(addDays(from, 7))} />
        </div>
        <p className="display text-2xl text-ink">{capitalize(range)}</p>
        {from !== weekStart(today) && <Button size="sm" variant="secondary" onClick={() => setFrom(weekStart(today))}>Hoy</Button>}
        {data && (
          <p className="tnum ml-auto hidden text-sm text-ink-2 sm:block">
            <strong className="font-semibold text-ink">{summary.sessions}</strong> clases ·{' '}
            <strong className="font-semibold text-ink">{summary.taken}</strong> de {summary.capacity} cupos ocupados ·{' '}
            <strong className="font-semibold text-sage">{summary.capacity - summary.taken} libres</strong>
          </p>
        )}
      </div>

      {isError && <ErrorState error={error} onRetry={refetch} />}
      {isLoading && <SkeletonList count={4} className="h-20" />}

      {data && (
        <div className="grid gap-4 lg:grid-cols-7 lg:gap-2.5">
          {days.map((day) => {
            const list = byDay[day]
            const isToday = day === today
            const isPast = day < today
            return (
              <section
                key={day}
                className={cx(
                  'min-w-0 lg:min-h-[460px] lg:rounded-3xl lg:border lg:p-2.5',
                  isToday ? 'lg:border-clay/50 lg:bg-clay-soft/60' : 'lg:border-line/70 lg:bg-surface/50',
                  isPast && 'lg:opacity-70',
                  list.length === 0 && 'hidden lg:block',
                )}
              >
                <header className="mb-2 flex items-baseline gap-2 lg:mb-3 lg:flex-col lg:items-center lg:gap-0 lg:border-b lg:border-line/70 lg:pb-2.5 lg:text-center">
                  <p className={cx('text-[11px] font-bold uppercase tracking-label', isToday ? 'text-clay-deep' : 'text-ink-3')}>
                    {fmtDate(day, { weekday: 'short' }).replace('.', '')}
                  </p>
                  <p className={cx('display tnum text-2xl', isToday ? 'text-clay-deep' : 'text-ink')}>{Number(day.slice(8))}</p>
                  {isToday && <span className="text-[11px] font-semibold text-clay-deep lg:hidden">· Hoy</span>}
                </header>
                <div className="space-y-2">
                  {list.map((s) => <SessionChip key={s.id} session={s} onOpen={() => onOpen(s.id)} />)}
                  {list.length === 0 && <p className="hidden py-8 text-center text-xs text-ink-3 lg:block">Sin clases</p>}
                </div>
              </section>
            )
          })}
          {data.sessions.length === 0 && (
            <div className="lg:hidden">
              <EmptyState icon={CalendarOff} title="Semana sin clases" text="Crea un grupo recurrente o una clase suelta." />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function GroupsView({ onEdit }) {
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['groups'], queryFn: () => api.get('/admin/groups') })
  if (isLoading) return <SkeletonList count={4} className="h-20" />
  if (isError) return <ErrorState error={error} onRetry={refetch} />
  if (!data.groups.length) return <EmptyState icon={Repeat} title="Aún no hay grupos" text="Un grupo se repite cada semana y genera sus clases con fecha concreta." />
  const totalCapacity = data.groups.filter((g) => g.isActive).reduce((sum, g) => sum + g.capacity, 0)
  return (
    <div>
      <p className="mb-4 text-sm text-ink-2">
        <strong className="tnum font-semibold text-ink">{data.groups.filter((g) => g.isActive).length}</strong> grupos activos ·{' '}
        <strong className="tnum font-semibold text-ink">{totalCapacity}</strong> cupos semanales
      </p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {data.groups.map((g) => (
          <Card key={g.id} className={cx('flex items-center gap-4 p-4', !g.isActive && 'opacity-60')}>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold text-ink">{g.name}</p>
              <p className="mt-0.5 text-[13px] text-ink-2">{WEEKDAYS[g.weekday]} · {fmtTime(g.startTime)} · {g.durationMin} min</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge tone="clay">{MODALITY[g.modality]}</Badge>
                <Badge>{g.capacity} cupos</Badge>
                {!g.openBooking && <Badge>Solo administración</Badge>}
                {!g.isActive && <Badge tone="terracotta">Inactivo</Badge>}
              </div>
            </div>
            <IconButton icon={Pencil} label={`Editar ${g.name}`} onClick={() => onEdit(g)} />
          </Card>
        ))}
      </div>
    </div>
  )
}

export default function Agenda() {
  const { isAdmin } = useAuth()
  const [view, setView] = useState('week')
  const [openSession, setOpenSession] = useState(null)
  const [form, setForm] = useState(null) // { mode: 'group' | 'session', group? }

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Agenda"
        title="Clases y cupos"
        actions={isAdmin && (
          <>
            <Button variant="secondary" icon={Plus} onClick={() => setForm({ mode: 'session' })}>Clase suelta</Button>
            <Button icon={Repeat} onClick={() => setForm({ mode: 'group' })}>Nuevo grupo</Button>
          </>
        )}
      />
      {isAdmin && (
        <Segmented label="Vista" value={view} onChange={setView} options={[{ value: 'week', label: 'Semana' }, { value: 'groups', label: 'Grupos' }]} />
      )}
      {view === 'week' ? <WeekView onOpen={setOpenSession} /> : <GroupsView onEdit={(group) => setForm({ mode: 'group', group })} />}

      <SessionSheet sessionId={openSession} onClose={() => setOpenSession(null)} />
      {form && <ClassForm key={form.group?.id || form.mode} mode={form.mode} group={form.group} onClose={() => setForm(null)} />}
    </div>
  )
}
