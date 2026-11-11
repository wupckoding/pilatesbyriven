import React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { BOOKING_STATUS, MODALITY, fmtDate, fmtMoney, fmtTime } from '../../lib/format'
import { Badge, Card } from '../../ui'

export const useMyBookings = () => useQuery({ queryKey: ['my-bookings'], queryFn: () => api.get('/bookings') })

export const useRefreshMine = () => {
  const qc = useQueryClient()
  return () => Promise.all(['my-bookings', 'sessions', 'my-packages'].map((key) => qc.invalidateQueries({ queryKey: [key] })))
}

/** Qué significa cada estado para la clienta, en una línea. */
export const STATUS_HELP = {
  pending: 'El estudio confirmará tu lugar pronto.',
  confirmed: 'Tu lugar está confirmado.',
  waitlisted: 'Te avisaremos si se libera un cupo.',
}

export function DateBlock({ ymd, dark = false }) {
  return (
    <div className={`w-14 shrink-0 text-center ${dark ? 'text-white' : 'text-ink'}`}>
      <p className={`text-[10px] font-bold uppercase tracking-label ${dark ? 'text-white/60' : 'text-ink-3'}`}>{fmtDate(ymd, { weekday: 'short' }).replace('.', '')}</p>
      <p className="display tnum text-[32px] leading-none">{Number(ymd.slice(8))}</p>
      <p className={`mt-0.5 text-[10px] font-bold uppercase tracking-label ${dark ? 'text-white/60' : 'text-ink-3'}`}>{fmtDate(ymd, { month: 'short' }).replace('.', '')}</p>
    </div>
  )
}

export function BookingCard({ booking, action }) {
  const state = booking.sessionStatus === 'cancelled'
    ? { label: 'Clase cancelada por el estudio', tone: 'terracotta' }
    : BOOKING_STATUS[booking.status]
  return (
    <Card className="flex items-center gap-4 p-4">
      <DateBlock ymd={booking.localDate} />
      <div className="min-w-0 flex-1 border-l border-line pl-4">
        <p className="tnum truncate text-[15px] font-semibold text-ink">{fmtTime(booking.localTime)}</p>
        <p className="mt-0.5 truncate text-[13px] text-ink-3">
          {MODALITY[booking.modality]} · {booking.durationMin} min
          {booking.instructorName ? ` · ${booking.instructorName}` : ''}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge tone={state.tone}>{state.label}</Badge>
        </div>
      </div>
      {action}
    </Card>
  )
}

export const useMyPackages = () => useQuery({ queryKey: ['my-packages'], queryFn: () => api.get('/packages') })

const PAY_STATE = (pkg) => {
  if (pkg.balanceCents === 0) return { label: 'Pago confirmado', tone: 'sage' }
  if (pkg.toVerifyCents >= pkg.balanceCents) return { label: 'Pago por verificar', tone: 'honey' }
  return { label: `Pago pendiente · ${fmtMoney(pkg.balanceCents, pkg.currency)}`, tone: 'honey' }
}

/** Saldo y vencimiento del paquete, tal como lo ve la clienta. */
export function MyPackageCard({ pkg }) {
  const pay = PAY_STATE(pkg)
  const expired = pkg.status === 'expired'
  const bars = Array.from({ length: Math.min(pkg.sessionsTotal, 12) }, (_, i) => (i < pkg.used ? 'used' : i < pkg.used + pkg.reserved ? 'reserved' : 'free'))
  return (
    <Card className={`p-5 ${expired ? 'opacity-70' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[15px] font-semibold text-ink">{pkg.name}</p>
          <p className="tnum text-[13px] text-ink-3">{expired ? 'Venció' : 'Vence'} el {fmtDate(pkg.expiresOn, { day: 'numeric', month: 'long' })}</p>
        </div>
        <Badge tone={expired ? 'neutral' : pay.tone}>{expired ? 'Vencido' : pay.label}</Badge>
      </div>
      <p className="display tnum mt-4 text-[40px] text-ink">{pkg.available}<span className="text-xl text-ink-3"> de {pkg.sessionsTotal} {pkg.sessionsTotal === 1 ? 'clase' : 'clases'} por reservar</span></p>
      <div className="mt-3 flex gap-1" role="img" aria-label={`${pkg.used} tomadas, ${pkg.reserved} reservadas, ${pkg.available} disponibles`}>
        {bars.map((state, i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${state === 'used' ? 'bg-ink/25' : state === 'reserved' ? 'bg-clay' : 'bg-sage'}`} />)}
      </div>
      <p className="tnum mt-2 text-[13px] text-ink-3">{pkg.used} {pkg.used === 1 ? 'tomada' : 'tomadas'} · {pkg.reserved} {pkg.reserved === 1 ? 'reservada' : 'reservadas'}</p>
    </Card>
  )
}
