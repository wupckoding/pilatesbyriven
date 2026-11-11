import React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { BOOKING_STATUS, MODALITY, fmtDate, fmtTime } from '../../lib/format'
import { Badge, Card } from '../../ui'

export const useMyBookings = () => useQuery({ queryKey: ['my-bookings'], queryFn: () => api.get('/bookings') })

export const useRefreshMine = () => {
  const qc = useQueryClient()
  return () => Promise.all(['my-bookings', 'sessions'].map((key) => qc.invalidateQueries({ queryKey: [key] })))
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
