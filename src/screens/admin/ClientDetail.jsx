import React, { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, CalendarX2, Mail, MessageCircle, PackagePlus, Pencil, Phone } from 'lucide-react'
import { Credits, PackageRow, PackageSheet, PaymentSheet, SellPackageSheet } from './commerce'
import { api } from '../../lib/api'
import { ATTENDANCE, BOOKING_STATUS, CLIENT_STATUS, INTAKE, MODALITY, PACKAGE_STATUS, SOURCE, capitalize, fmtDate, fmtMoney, fmtPhone, fmtTime, todayCR, waLink } from '../../lib/format'
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, SectionTitle, Skeleton } from '../../ui'
import ClientForm from './ClientForm'
import SessionSheet from './SessionSheet'
import IntakeAdmin from './IntakeAdmin'

function BookingLine({ booking, onOpen }) {
  const state = booking.attendance ? ATTENDANCE[booking.attendance] : booking.sessionStatus === 'cancelled'
    ? { label: 'Clase cancelada', tone: 'terracotta' }
    : BOOKING_STATUS[booking.status]
  return (
    <button type="button" onClick={onOpen} className="flex w-full items-center gap-4 px-5 py-3.5 text-left transition-colors hover:bg-clay-soft/30">
      <div className="w-12 shrink-0 text-center">
        <p className="display tnum text-2xl leading-none text-ink">{Number(booking.localDate.slice(8))}</p>
        <p className="mt-0.5 text-[10px] font-bold uppercase tracking-label text-ink-3">{fmtDate(booking.localDate, { month: 'short' }).replace('.', '')}</p>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">{booking.name}</p>
        <p className="text-[13px] text-ink-3">{capitalize(fmtDate(booking.localDate, { weekday: 'long' }))} · {fmtTime(booking.localTime)} · {MODALITY[booking.modality]}</p>
      </div>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <Badge tone={state.tone}>{state.label}</Badge>
        {!booking.packageId && booking.status !== 'cancelled' && booking.status !== 'waitlisted' && <Badge tone="honey">Sin paquete</Badge>}
      </span>
    </button>
  )
}

const Row = ({ label, children }) => (
  <div className="flex items-start justify-between gap-4 px-5 py-3">
    <dt className="shrink-0 text-[13px] text-ink-3">{label}</dt>
    <dd className="min-w-0 text-right text-sm font-medium text-ink">{children || <span className="font-normal text-ink-3">—</span>}</dd>
  </div>
)

export default function ClientDetail() {
  const { id } = useParams()
  const [editing, setEditing] = useState(false)
  const [openSession, setOpenSession] = useState(null)
  const [openPackage, setOpenPackage] = useState(null)
  const [selling, setSelling] = useState(false)
  const [paying, setPaying] = useState(false)
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['client', id],
    queryFn: () => api.get(`/admin/clients/${id}`),
  })

  const back = (
    <Link to="/clientas" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-2 hover:text-ink">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Clientas
    </Link>
  )
  if (isLoading) return <div className="space-y-6">{back}<Skeleton className="h-40" /><Skeleton className="h-64" /></div>
  if (isError) return <div className="space-y-6">{back}<ErrorState error={error} onRetry={refetch} /></div>

  const { client, upcoming, history, stats, packages } = data
  const current = packages.filter((p) => p.status === 'active' || p.status === 'pending_payment')
  const previous = packages.filter((p) => !current.includes(p))
  const status = CLIENT_STATUS[client.status]
  const intake = INTAKE[client.intakeStatus]

  return (
    <div className="space-y-8">
      {back}

      <header className="flex flex-wrap items-center gap-5">
        <Avatar name={client.fullName} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="eyebrow tnum mb-1">{client.studentCode}</p>
          <h1 className="display text-[34px] text-ink sm:text-[40px]">{client.fullName}</h1>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge tone={status.tone}>{status.label}</Badge>
            <Badge tone={intake.tone}>{intake.label}</Badge>
            {client.groupName && <Badge>{client.groupName}</Badge>}
            {client.hasAccount && <Badge>Con cuenta en la app</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button icon={PackagePlus} onClick={() => setSelling(true)}>{current.length ? 'Renovar' : 'Vender paquete'}</Button>
          {client.whatsapp && <Button variant="whatsapp" icon={MessageCircle} href={waLink(client.whatsapp)}>WhatsApp</Button>}
          <Button variant="secondary" icon={Pencil} onClick={() => setEditing(true)}>Editar</Button>
        </div>
      </header>

      <div className="grid grid-cols-3 gap-3">
        {[['Asistió', stats.attended], ['Ausencias', stats.absent], ['Canceló', stats.cancelled]].map(([label, value]) => (
          <Card key={label} className="p-4 text-center sm:p-5">
            <p className="display tnum text-[34px] text-ink">{value}</p>
            <p className="eyebrow mt-1">{label}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-8">
          <section>
            <SectionTitle action={<button type="button" className="text-[13px] font-semibold text-clay-deep hover:underline" onClick={() => setPaying(true)}>Registrar pago suelto</button>}>
              Paquetes
            </SectionTitle>
            {packages.length === 0
              ? <EmptyState icon={PackagePlus} title="Sin paquetes" text="Vende una clase de prueba, una clase suelta o el paquete mensual." action={<Button variant="secondary" onClick={() => setSelling(true)}>Vender paquete</Button>} />
              : (
                <div className="space-y-3">
                  {current.map((p) => (
                    <Card key={p.id} as="button" type="button" interactive onClick={() => setOpenPackage(p.id)} className="block w-full p-5 text-left">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-[15px] font-semibold text-ink">{p.name}</p>
                          <p className="tnum text-[13px] text-ink-3">Vence el {fmtDate(p.expiresOn, { day: 'numeric', month: 'long' })}{p.groupName ? ` · ${p.groupName}` : ''}</p>
                        </div>
                        <div className="flex gap-1.5">
                          {p.balanceCents > 0 && <Badge tone="honey">Saldo {fmtMoney(p.balanceCents, p.currency)}</Badge>}
                          <Badge tone={PACKAGE_STATUS[p.status].tone}>{PACKAGE_STATUS[p.status].label}</Badge>
                        </div>
                      </div>
                      <div className="mt-4"><Credits pkg={p} /></div>
                    </Card>
                  ))}
                  {previous.length > 0 && (
                    <Card className="divide-y divide-line overflow-hidden">
                      {previous.map((p) => <PackageRow key={p.id} pkg={p} showClient={false} onOpen={() => setOpenPackage(p.id)} />)}
                    </Card>
                  )}
                </div>
              )}
          </section>
          <section>
            <SectionTitle>Próximas clases</SectionTitle>
            {upcoming.length === 0
              ? <EmptyState icon={CalendarX2} title="Sin clases agendadas" text="Abre una clase en la agenda y agrégala desde ahí." action={<Button to="/agenda" variant="secondary">Ir a la agenda</Button>} />
              : <Card className="divide-y divide-line overflow-hidden">{upcoming.map((b) => <BookingLine key={b.id} booking={b} onOpen={() => setOpenSession(b.sessionId)} />)}</Card>}
          </section>
          <section>
            <SectionTitle>Historial</SectionTitle>
            {history.length === 0
              ? <p className="rounded-3xl border border-dashed border-line px-5 py-6 text-center text-sm text-ink-3">Todavía no tiene clases anteriores.</p>
              : <Card className="divide-y divide-line overflow-hidden">{history.map((b) => <BookingLine key={b.id} booking={b} onOpen={() => setOpenSession(b.sessionId)} />)}</Card>}
          </section>
        </div>

        <div className="space-y-8">
          <section>
            <SectionTitle>Admisión</SectionTitle>
            <IntakeAdmin client={client} />
          </section>
          <section>
            <SectionTitle>Contacto</SectionTitle>
            <Card as="dl" className="divide-y divide-line">
              <Row label="WhatsApp">
                {client.whatsapp && <a href={waLink(client.whatsapp)} target="_blank" rel="noreferrer" className="tnum inline-flex items-center gap-1.5 text-clay-deep hover:underline"><Phone className="h-3.5 w-3.5" />{fmtPhone(client.whatsapp)}</a>}
              </Row>
              <Row label="Correo">
                {client.email && <a href={`mailto:${client.email}`} className="inline-flex items-center gap-1.5 break-all text-clay-deep hover:underline"><Mail className="h-3.5 w-3.5 shrink-0" />{client.email}</a>}
              </Row>
              <Row label="Emergencia">{[client.emergencyName, client.emergencyPhone].filter(Boolean).join(' · ')}</Row>
            </Card>
          </section>
          <section>
            <SectionTitle>Ficha</SectionTitle>
            <Card as="dl" className="divide-y divide-line">
              <Row label="Origen">{SOURCE[client.source]}</Row>
              <Row label="Alta">{fmtDate(todayCR(new Date(client.createdAt)), { day: 'numeric', month: 'long', year: 'numeric' })}</Row>
              <Row label="Modalidad preferida">{MODALITY[client.preferredModality]}</Row>
              <Row label="Días preferidos">{client.preferredDays}</Row>
              <Row label="Próximo seguimiento">{client.nextFollowupOn && capitalize(fmtDate(client.nextFollowupOn))}</Row>
            </Card>
          </section>
          <section>
            <SectionTitle>Notas operativas</SectionTitle>
            <Card className="p-5">
              {client.internalNotes
                ? <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-2">{client.internalNotes}</p>
                : <p className="text-sm text-ink-3">Sin notas. Solo las ve el personal autorizado.</p>}
            </Card>
          </section>
        </div>
      </div>

      {editing && <ClientForm client={client} onClose={() => setEditing(false)} />}
      <SessionSheet sessionId={openSession} onClose={() => setOpenSession(null)} />
      <PackageSheet packageId={openPackage} onClose={() => setOpenPackage(null)} />
      {selling && <SellPackageSheet client={client} onClose={() => setSelling(false)} onCreated={(pkg) => setOpenPackage(pkg.id)} />}
      {paying && <PaymentSheet clientId={client.id} clientName={client.fullName} onClose={() => setPaying(false)} />}
    </div>
  )
}
