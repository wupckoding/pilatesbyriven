import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, CalendarCheck, ChevronRight, ClipboardCheck, Hourglass, PhoneCall, Sparkles } from 'lucide-react'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { MODALITY, capitalize, firstName, fmtDate, fmtTime, greeting } from '../../lib/format'
import { Badge, Button, Card, EmptyState, ErrorState, Occupancy, SectionTitle, Skeleton, SkeletonList, Stat, cx } from '../../ui'
import SessionSheet from './SessionSheet'

function TodayCard({ session, onOpen }) {
  const past = new Date(session.startsAt).getTime() + session.durationMin * 60000 < Date.now()
  const missing = past ? session.roster.filter((r) => r.status === 'confirmed' && !r.attendance).length : 0
  return (
    <Card as="button" type="button" interactive onClick={onOpen} className={cx('flex w-full items-center gap-4 p-4 text-left sm:p-5', past && missing === 0 && 'opacity-70')}>
      <div className="w-[76px] shrink-0 border-r border-line pr-4 text-center">
        <p className="display tnum text-[26px] text-ink">{fmtTime(session.localTime).split(' ')[0]}</p>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">{fmtTime(session.localTime).split(' ').slice(1).join(' ')}</p>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-[15px] font-semibold text-ink">{session.name}</p>
          <Badge tone="clay">{MODALITY[session.modality]}</Badge>
          {missing > 0 && <Badge tone="honey">Asistencia por tomar</Badge>}
        </div>
        <p className="mt-1 truncate text-sm text-ink-2">
          {session.roster.length ? session.roster.map((r) => firstName(r.fullName)).join(' · ') : 'Sin reservas'}
        </p>
        <div className="mt-2"><Occupancy taken={session.taken} capacity={session.capacity} /></div>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-ink-3" aria-hidden="true" />
    </Card>
  )
}

export default function AdminHome() {
  const { user, isAdmin } = useAuth()
  const [openSession, setOpenSession] = useState(null)
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get('/admin/dashboard'),
    refetchInterval: 60_000,
  })

  const sessions = data?.todaySessions || []
  const takenToday = sessions.reduce((sum, s) => sum + s.taken, 0)
  const capacityToday = sessions.reduce((sum, s) => sum + s.capacity, 0)
  const next = sessions.find((s) => new Date(s.startsAt) > new Date())
  const counts = data?.counts

  return (
    <div className="space-y-9">
      <header>
        <p className="eyebrow mb-2">{data ? capitalize(fmtDate(data.today)) : ' '}</p>
        <h1 className="display text-[36px] text-ink sm:text-[46px]">
          {greeting()}, <em className="text-clay-deep">{firstName(user.fullName) || 'Riven'}</em>
        </h1>
      </header>

      {isError && <ErrorState error={error} onRetry={refetch} />}

      {/* Resumen del día */}
      {isLoading ? <Skeleton className="h-44" /> : data && (
        <section className="grain overflow-hidden rounded-4xl bg-espresso p-6 text-white shadow-lift sm:p-8">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-label text-white/60">Hoy en el estudio</p>
              <p className="display mt-3 text-[44px] sm:text-[56px]">
                {sessions.length === 0 ? 'Día libre' : `${sessions.length} ${sessions.length === 1 ? 'clase' : 'clases'}`}
              </p>
              <p className="mt-2 text-[15px] text-white/70">
                {sessions.length === 0
                  ? 'No hay clases programadas para hoy.'
                  : next
                    ? `Próxima clase a las ${fmtTime(next.localTime)}`
                    : 'Ya terminaron las clases de hoy.'}
              </p>
            </div>
            {sessions.length > 0 && (
              <div className="flex gap-8">
                <div>
                  <p className="display tnum text-[40px] leading-none">{takenToday}<span className="text-white/40"> / {capacityToday}</span></p>
                  <p className="mt-2 text-[11px] font-semibold uppercase tracking-label text-white/60">Cupos ocupados</p>
                </div>
                <div>
                  <p className="display tnum text-[40px] leading-none">{Math.max(0, capacityToday - takenToday)}</p>
                  <p className="mt-2 text-[11px] font-semibold uppercase tracking-label text-white/60">Libres</p>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Pendientes: cada indicador abre el detalle que compone el total */}
      {isAdmin && counts && (
        <section>
          <SectionTitle>Pendientes</SectionTitle>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Por confirmar" value={counts.pendingBookings} hint="Reservas nuevas" to="/reservas?vista=pending" icon={CalendarCheck} tone={counts.pendingBookings ? 'alert' : 'default'} />
            <Stat label="Lista de espera" value={counts.waitlisted} hint="Esperan un cupo" to="/reservas?vista=waitlist" icon={Hourglass} />
            <Stat label="Asistencia" value={counts.attendancePending} hint="Por tomar" to="/reservas?vista=attendance" icon={ClipboardCheck} tone={counts.attendancePending ? 'alert' : 'default'} />
            <Stat label="Seguimientos" value={counts.followupsDue} hint="Para hoy o vencidos" to="/clientas?seguimiento=1" icon={PhoneCall} />
          </div>
        </section>
      )}

      <div className="grid gap-9 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <section>
          <SectionTitle action={<Link to="/agenda" className="inline-flex items-center gap-1 text-[13px] font-semibold text-clay-deep hover:underline">Ver agenda <ArrowRight className="h-3.5 w-3.5" /></Link>}>
            Clases de hoy
          </SectionTitle>
          {isLoading && <SkeletonList count={2} />}
          {data && sessions.length === 0 && (
            <EmptyState icon={Sparkles} title="Sin clases hoy" text="Revisa la agenda de la semana o crea una clase suelta." action={<Button to="/agenda" variant="secondary">Abrir agenda</Button>} />
          )}
          <div className="space-y-3">
            {sessions.map((s) => <TodayCard key={s.id} session={s} onOpen={() => setOpenSession(s.id)} />)}
          </div>
        </section>

        <div className="space-y-9">
          {data && (
            <section>
              <SectionTitle>Esta semana</SectionTitle>
              <Card className="p-5">
                <div className="flex items-end justify-between">
                  <div>
                    <p className="display tnum text-[40px] text-ink">{data.week.free}</p>
                    <p className="text-[13px] text-ink-3">cupos libres de {data.week.capacity}</p>
                  </div>
                  <p className="tnum text-sm font-semibold text-ink-2">{data.week.sessions} clases</p>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-sunken" role="img" aria-label={`${data.week.taken} de ${data.week.capacity} cupos ocupados`}>
                  <div className="h-full rounded-full bg-clay transition-all" style={{ width: `${data.week.capacity ? Math.round((data.week.taken / data.week.capacity) * 100) : 0}%` }} />
                </div>
                <p className="tnum mt-2 text-[13px] text-ink-3">{data.week.taken} ocupados</p>
              </Card>
            </section>
          )}

          {isAdmin && counts && (
            <section>
              <SectionTitle action={<Link to="/clientas" className="inline-flex items-center gap-1 text-[13px] font-semibold text-clay-deep hover:underline">Ver todas <ArrowRight className="h-3.5 w-3.5" /></Link>}>
                Alumnas
              </SectionTitle>
              <Card className="divide-y divide-line">
                {[
                  ['Registradas', counts.clientsTotal],
                  ['Con al menos una clase', counts.clientsAttended],
                  ['Activas', counts.clientsActive],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between px-5 py-3.5">
                    <p className="text-sm text-ink-2">{label}</p>
                    <p className="display tnum text-2xl text-ink">{value}</p>
                  </div>
                ))}
              </Card>
            </section>
          )}
        </div>
      </div>

      <SessionSheet sessionId={openSession} onClose={() => setOpenSession(null)} />
    </div>
  )
}
