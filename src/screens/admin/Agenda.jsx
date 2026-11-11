import React, { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarOff, ChevronLeft, ChevronRight, Pencil, Plus, Repeat } from 'lucide-react'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { KIND, MODALITY, WEEKDAYS, addDays, capitalize, fmtDate, fmtTime, todayCR, weekStart } from '../../lib/format'
import { Badge, Button, Card, EmptyState, ErrorState, Field, IconButton, Input, Occupancy, PageHeader, Segmented, Select, SkeletonList, cx } from '../../ui'
import Sheet from '../../ui/Sheet'
import { useToast } from '../../ui/Toast'
import SessionSheet from './SessionSheet'

const BLANK = { name: '', modality: 'reformer', kind: 'group', weekday: 2, startTime: '18:00', localDate: '', localTime: '18:00', durationMin: 60, capacity: 3, instructorId: '', openBooking: true, isActive: true }

/** Formulario único para grupo recurrente (nuevo o edición) y clase suelta. */
function ClassForm({ mode, group, onClose }) {
  const toast = useToast()
  const qc = useQueryClient()
  const editing = mode === 'group' && !!group
  const [form, setForm] = useState(() => (editing ? { ...BLANK, ...group, instructorId: group.instructorId || '' } : { ...BLANK, localDate: todayCR() }))
  const [error, setError] = useState(null)
  const staff = useQuery({ queryKey: ['staff'], queryFn: () => api.get('/admin/staff') })

  const set = (key, cast = (v) => v) => (e) => {
    setForm((f) => ({ ...f, [key]: cast(e.target.type === 'checkbox' ? e.target.checked : e.target.value) }))
    setError(null)
  }
  const fieldError = (name) => (error?.data?.field === name ? error.message : undefined)

  const save = useMutation({
    mutationFn: () => {
      const base = {
        name: form.name.trim(), modality: form.modality, durationMin: Number(form.durationMin), capacity: Number(form.capacity),
        instructorId: form.instructorId || null, openBooking: form.openBooking,
      }
      if (mode === 'session') return api.post('/admin/sessions', { ...base, kind: form.kind, localDate: form.localDate, localTime: form.localTime })
      if (editing) return api.patch(`/admin/groups/${group.id}`, { ...base, startTime: form.startTime, isActive: form.isActive })
      return api.post('/admin/groups', { ...base, kind: form.kind, weekday: Number(form.weekday), startTime: form.startTime })
    },
    onSuccess: async (data) => {
      await Promise.all(['agenda', 'groups', 'dashboard'].map((key) => qc.invalidateQueries({ queryKey: [key] })))
      toast.success(mode === 'session' ? 'Clase creada' : editing ? 'Grupo actualizado' : 'Grupo creado con sus próximas clases')
      if (data.conflicts?.length) toast.error('Ojo: la instructora ya tiene otra clase a esa hora')
      onClose()
    },
    onError: setError,
  })

  const title = mode === 'session' ? 'Clase suelta' : editing ? 'Editar grupo' : 'Nuevo grupo'
  const subtitle = mode === 'session'
    ? 'Una clase con fecha única: prueba, privada o reposición.'
    : editing ? 'Los cambios aplican a las clases futuras. Lo ya ocurrido y los cambios puntuales se conservan.' : 'Se repite cada semana y genera sus clases automáticamente.'

  return (
    <Sheet
      open
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>{editing ? 'Guardar cambios' : 'Crear'}</Button>
        </>
      )}
    >
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate() }}>
        <Field label="Nombre" error={fieldError('name')}>
          <Input value={form.name} onChange={set('name')} placeholder={mode === 'session' ? 'Clase de prueba · Valeria' : 'Martes 6:00 p. m.'} maxLength={80} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Modalidad">
            <Select value={form.modality} onChange={set('modality')}>
              {Object.entries(MODALITY).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
          </Field>
          <Field label="Tipo">
            <Select value={form.kind} onChange={set('kind')} disabled={editing}>
              {Object.entries(KIND).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {mode === 'session' ? (
            <Field label="Fecha" error={fieldError('localDate')}>
              <Input type="date" value={form.localDate} min={todayCR()} onChange={set('localDate')} />
            </Field>
          ) : (
            <Field label="Día" hint={editing ? 'Para cambiar de día, crea un grupo nuevo.' : undefined}>
              <Select value={form.weekday} onChange={set('weekday')} disabled={editing}>
                {[1, 2, 3, 4, 5, 6, 0].map((d) => <option key={d} value={d}>{WEEKDAYS[d]}</option>)}
              </Select>
            </Field>
          )}
          <Field label="Hora" error={fieldError(mode === 'session' ? 'localTime' : 'startTime')}>
            <Input type="time" value={mode === 'session' ? form.localTime : form.startTime} onChange={set(mode === 'session' ? 'localTime' : 'startTime')} step={300} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Duración (min)" error={fieldError('durationMin')}>
            <Input type="number" inputMode="numeric" min={15} max={240} step={5} value={form.durationMin} onChange={set('durationMin')} />
          </Field>
          <Field label="Capacidad" error={fieldError('capacity')}>
            <Input type="number" inputMode="numeric" min={1} max={50} value={form.capacity} onChange={set('capacity')} />
          </Field>
        </div>
        <Field label="Instructora" optional>
          <Select value={form.instructorId} onChange={set('instructorId')}>
            <option value="">Sin asignar</option>
            {staff.data?.staff.map((s) => <option key={s.id} value={s.id}>{s.fullName || s.email}</option>)}
          </Select>
        </Field>
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line bg-surface p-4">
          <input type="checkbox" checked={form.openBooking} onChange={set('openBooking')} className="mt-0.5 h-5 w-5 accent-[#8A6548]" />
          <span>
            <span className="block text-sm font-semibold text-ink">Reservable desde la app</span>
            <span className="block text-[13px] text-ink-3">Si lo desactivas, solo administración asigna los cupos.</span>
          </span>
        </label>
        {editing && (
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line bg-surface p-4">
            <input type="checkbox" checked={form.isActive} onChange={set('isActive')} className="mt-0.5 h-5 w-5 accent-[#8A6548]" />
            <span>
              <span className="block text-sm font-semibold text-ink">Grupo activo</span>
              <span className="block text-[13px] text-ink-3">Al desactivarlo se quitan las clases futuras sin reservas; las que tienen reservas quedan para resolver.</span>
            </span>
          </label>
        )}
        {error && !error.data?.field && <p className="rounded-2xl bg-terracotta-soft px-4 py-3 text-sm font-medium text-terracotta" role="alert">{error.message}</p>}
        <button type="submit" hidden />
      </form>
    </Sheet>
  )
}

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
