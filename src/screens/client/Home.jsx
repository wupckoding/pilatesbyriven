import React from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CalendarPlus, MapPin, MessageCircle } from 'lucide-react'
import { useAuth } from '../../lib/auth'
import { BOOKING_STATUS, MODALITY, capitalize, dayLabel, firstName, fmtTime, greeting, waLink } from '../../lib/format'
import { Badge, Button, Card, ErrorState, SectionTitle, Skeleton } from '../../ui'
import { BookingCard, MyPackageCard, STATUS_HELP, useMyBookings, useMyPackages } from './shared'

const STUDIO_WHATSAPP = '+50685438378'

export default function ClientHome() {
  const { user, client } = useAuth()
  const { data, isLoading, isError, error, refetch } = useMyBookings()
  const packages = useMyPackages()
  // El paquete vigente (o por pagar) que vence primero.
  const currentPackage = (packages.data?.packages || []).filter((p) => p.status !== 'expired').sort((a, b) => a.expiresOn.localeCompare(b.expiresOn))[0]
  const next = data?.upcoming[0]
  const rest = data?.upcoming.slice(1, 4) || []

  return (
    <div className="mx-auto max-w-2xl space-y-8 lg:mx-0 lg:grid lg:max-w-none lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-x-10 lg:gap-y-8 lg:space-y-0">
      <header className="lg:col-span-2">
        <p className="eyebrow tnum mb-2">{client?.studentCode}</p>
        <h1 className="display text-[38px] text-ink sm:text-[46px]">
          {greeting()}, <em className="text-clay-deep">{firstName(user.fullName)}</em>
        </h1>
      </header>

      {isLoading && <Skeleton className="h-56 lg:row-span-2 lg:h-[400px]" />}
      {isError && <div className="lg:row-span-2"><ErrorState error={error} onRetry={refetch} /></div>}

      {data && (
        <section className="grain overflow-hidden rounded-4xl bg-espresso p-6 text-white shadow-lift sm:p-8 lg:row-span-2 lg:flex lg:min-h-[400px] lg:flex-col lg:justify-end lg:self-start lg:p-12">
          {next ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-label text-white/60">Tu próxima clase</p>
                <Badge tone="dark">{BOOKING_STATUS[next.status].label}</Badge>
              </div>
              <p className="display mt-4 text-[44px] sm:text-[52px]">{capitalize(dayLabel(next.localDate))}</p>
              <p className="display mt-1 text-[28px] text-clay">{fmtTime(next.localTime)}</p>
              <p className="mt-4 text-[15px] text-white/75">
                {MODALITY[next.modality]} · {next.durationMin} min{next.instructorName ? ` · con ${next.instructorName}` : ''}
              </p>
              <p className="mt-1 text-sm text-white/55">{STATUS_HELP[next.status]}</p>
              <div className="mt-6 flex flex-wrap gap-2">
                <Button to="/clases" variant="secondary" className="!border-transparent">Ver mis clases</Button>
                <Button to="/reservar" variant="ghost" className="!text-white hover:!bg-white/10" icon={CalendarPlus}>Reservar otra</Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-label text-white/60">Tu práctica</p>
              <p className="display mt-4 text-[40px] sm:text-[48px]">Reserva tu<br /><em className="text-clay">próxima clase</em></p>
              <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-white/70">
                Elige el día y el horario que mejor te quede. Grupos pequeños y atención personalizada.
              </p>
              <Button to="/reservar" variant="secondary" size="lg" icon={CalendarPlus} className="mt-6 self-start !border-transparent">Ver horarios</Button>
            </>
          )}
        </section>
      )}

      {rest.length > 0 && (
        <section>
          <SectionTitle action={<Link to="/clases" className="inline-flex items-center gap-1 text-[13px] font-semibold text-clay-deep hover:underline">Ver todas <ArrowRight className="h-3.5 w-3.5" /></Link>}>
            También tienes
          </SectionTitle>
          <div className="space-y-3">{rest.map((b) => <BookingCard key={b.id} booking={b} />)}</div>
        </section>
      )}

      {currentPackage && (
        <section>
          <SectionTitle>Tu paquete</SectionTitle>
          <MyPackageCard pkg={currentPackage} />
        </section>
      )}

      <section>
        <SectionTitle>El estudio</SectionTitle>
        <Card className="divide-y divide-line">
          <div className="flex items-center gap-4 px-5 py-4">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-clay-soft text-clay-deep"><MapPin className="h-[18px] w-[18px]" aria-hidden="true" /></span>
            <div>
              <p className="text-sm font-semibold text-ink">Escazú, Costa Rica</p>
              <p className="text-[13px] text-ink-3">Atención por cita previa</p>
            </div>
          </div>
          <a href={waLink(STUDIO_WHATSAPP, 'Hola, tengo una consulta sobre mis clases.')} target="_blank" rel="noreferrer" className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-clay-soft/30">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sage-soft text-sage"><MessageCircle className="h-[18px] w-[18px]" aria-hidden="true" /></span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-ink">Escribir por WhatsApp</p>
              <p className="text-[13px] text-ink-3">Dudas, cambios o reposiciones</p>
            </div>
            <ArrowRight className="h-4 w-4 text-ink-3" aria-hidden="true" />
          </a>
        </Card>
      </section>
    </div>
  )
}
