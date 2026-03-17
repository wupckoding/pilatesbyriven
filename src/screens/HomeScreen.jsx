import React, { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { FiArrowRight, FiCalendar, FiClock, FiChevronRight, FiSettings, FiStar, FiTrendingUp, FiHeart } from 'react-icons/fi'
import { bookings, schedule, statusConfig } from '../utils/data'

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: (index) => ({
    opacity: 1,
    y: 0,
    transition: { delay: index * 0.06, duration: 0.45, ease: [0.25, 0.1, 0.25, 1] },
  }),
}

const classTypeLabels = {
  'semi-grupal': 'Semi-grupal',
  'duo': 'Dúo',
  'privada': 'Privada',
  'mat': 'MAT',
}

export default function HomeScreen({ user, onNavigate }) {
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Buenos días' : hour < 18 ? 'Buenas tardes' : 'Buenas noches'
  const dayName = new Date().toLocaleDateString('es-CR', { weekday: 'long' })
  const firstName = user?.name?.split(' ')[0] || ''
  const isAdmin = user?.role === 'admin' || user?.email === 'admin@pilatesbyriven.com'

  const [upcomingBookings, setUpcomingBookings] = useState([])
  const [totalClasses, setTotalClasses] = useState(0)
  const [hasUsedTrial, setHasUsedTrial] = useState(false)
  const [availableSlots, setAvailableSlots] = useState([])
  const [adminStats, setAdminStats] = useState(null)
  const [lastThirtyCount, setLastThirtyCount] = useState(0)

  useEffect(() => {
    if (!user?.id) return

    const nextDates = schedule.getNextDates(10)
    Promise.all([
      bookings.getUpcoming(),
      bookings.hasUsedTrial(),
      bookings.getByUser(),
      Promise.all(nextDates.map((dateItem) => schedule.getAvailable(dateItem.date))),
      isAdmin ? bookings.getStats() : Promise.resolve(null),
    ]).then(([upcoming, trial, allBookings, slotsByDate, stats]) => {
      setUpcomingBookings(upcoming.slice(0, 3))
      setHasUsedTrial(trial)
      setTotalClasses(allBookings.filter((item) => item.status !== 'cancelled').length)
      setAdminStats(stats)

      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      setLastThirtyCount(
        allBookings.filter((item) => {
          if (item.status === 'cancelled') return false
          const d = new Date(`${item.date}T00:00:00`)
          return d >= thirtyDaysAgo
        }).length,
      )

      const flattened = nextDates.flatMap((dateItem, index) => {
        return (slotsByDate[index] || [])
          .filter((slot) => slot.spots > 0)
          .map((slot) => ({
            ...slot,
            date: dateItem.date,
            label: dateItem.label,
            fullLabel: dateItem.fullLabel,
            isToday: dateItem.isToday,
          }))
      })
      setAvailableSlots(flattened.slice(0, 4))
    })
  }, [isAdmin, user])

  const nextBooking = upcomingBookings[0] || null
  const quote = isAdmin
    ? 'Administra horarios, precios y capacidad desde tu panel.'
    : (hasUsedTrial ? 'Tu próxima mejora empieza con consistencia.' : 'Después de 10 sesiones sientes la diferencia.')

  const metrics = useMemo(() => {
    if (!isAdmin || !adminStats) return []
    return [
      { label: 'Pendientes', value: adminStats.pending, color: '#C19C80' },
      { label: 'Horarios', value: adminStats.totalSchedules, color: '#8FA685' },
      { label: 'Clientes', value: adminStats.totalUsers, color: '#C4838E' },
    ]
  }, [adminStats, isAdmin])

  const consistencyLabel = lastThirtyCount >= 8
    ? 'Ritmo excelente'
    : lastThirtyCount >= 4
      ? 'Buen avance'
      : 'Comenzando fuerte'

  return (
    <div className="screen-scroll">
      <div className="px-6 pt-5 pb-8">
        <motion.div custom={0} variants={fadeUp} initial="hidden" animate="show" className="flex items-center justify-between mb-2">
          <div>
            <p className="text-[12px] font-medium capitalize" style={{ color: '#C4AFA2' }}>
              {greeting}, {dayName}
            </p>
            <h1 className="font-display text-[26px] font-bold text-charcoal tracking-tight mt-0.5">
              {isAdmin ? `Admin, ${firstName || 'Riven'}` : (firstName ? `Hola, ${firstName}` : 'Bienvenida')} ✨
            </h1>
          </div>
          <button
            onClick={() => onNavigate(isAdmin ? 'admin' : 'profile')}
            className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-elevated"
            style={{ background: 'linear-gradient(135deg, #C19C80 0%, #A67D64 100%)' }}
          >
            <span className="text-white font-display font-bold text-lg">{firstName?.[0]?.toUpperCase() || 'R'}</span>
          </button>
        </motion.div>

        <motion.div custom={0.3} variants={fadeUp} initial="hidden" animate="show" className="mb-6">
          <p className="text-[11px] italic leading-relaxed" style={{ color: '#C4AFA2' }}>{quote}</p>
        </motion.div>

        {isAdmin ? (
          <motion.div custom={0.6} variants={fadeUp} initial="hidden" animate="show" className="rounded-[28px] p-5 mb-6" style={{ background: 'linear-gradient(135deg, #1A1A1A 0%, #2D2521 100%)' }}>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/50 mb-2">Panel admin</p>
                <h2 className="font-display text-[30px] leading-none text-white">Tu estudio bajo control</h2>
                <p className="text-[12px] mt-2 text-white/55">Gestiona horarios por fecha, lotación y precio desde una sola vista.</p>
              </div>
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(193,156,128,0.18)' }}>
                <FiSettings size={18} className="text-white" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-4">
              {metrics.map((metric) => (
                <div key={metric.label} className="rounded-2xl py-3 text-center" style={{ background: 'rgba(255,255,255,0.06)' }}>
                  <p className="font-display text-[22px] font-bold" style={{ color: metric.color }}>{metric.value}</p>
                  <p className="text-[9px] font-semibold uppercase tracking-wider text-white/45 mt-1">{metric.label}</p>
                </div>
              ))}
            </div>

            <button onClick={() => onNavigate('admin')} className="w-full py-3.5 rounded-2xl text-[13px] font-semibold flex items-center justify-center gap-2 text-charcoal tap" style={{ background: '#F4EEE9' }}>
              Abrir panel de admin <FiArrowRight size={14} />
            </button>
          </motion.div>
        ) : (
          <motion.div custom={0.6} variants={fadeUp} initial="hidden" animate="show" className="rounded-[28px] p-5 mb-6" style={{ background: 'linear-gradient(135deg, #1A1A1A 0%, #2D2521 100%)' }}>
            <div className="inline-flex px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.14em] mb-4" style={{ background: 'rgba(193,156,128,0.15)', color: '#E7CCB7' }}>
              {hasUsedTrial ? 'Siguiente paso' : 'Primera clase $15'}
            </div>
            <h2 className="font-display text-[20px] text-white mb-2">
              {hasUsedTrial ? 'Reserva tu próxima sesión' : 'Tu experiencia de Pilates comienza hoy'}
            </h2>
            <p className="text-[12px] text-white/55 mb-5">
              {hasUsedTrial ? 'Elige uno de los horarios activos y mantén el ritmo.' : 'Clase de prueba semi-grupal configurada desde el panel del estudio.'}
            </p>
            <button onClick={() => onNavigate('book')} className="px-5 py-3 rounded-2xl text-[13px] font-semibold bg-white text-charcoal flex items-center gap-2 tap">
              Reservar ahora <FiArrowRight size={14} />
            </button>
          </motion.div>
        )}

        {nextBooking && (
          <motion.div custom={0.9} variants={fadeUp} initial="hidden" animate="show" className="rounded-3xl p-4 mb-6 bg-white" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="section-label mb-2">Próxima reserva</p>
                <p className="font-semibold text-[15px] text-charcoal">{classTypeLabels[nextBooking.classType] || nextBooking.classType}</p>
                <p className="text-[11px] mt-1" style={{ color: '#C4AFA2' }}>
                  {new Date(nextBooking.date + 'T12:00:00').toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long' })} · {schedule.formatTimeLabel(nextBooking.time)}
                </p>
              </div>
              <span className="text-[10px] font-semibold px-3 py-1.5 rounded-full" style={{ color: statusConfig[nextBooking.status]?.color, background: statusConfig[nextBooking.status]?.bg }}>
                {statusConfig[nextBooking.status]?.label}
              </span>
            </div>
          </motion.div>
        )}

        {!isAdmin && upcomingBookings.length > 1 && (
          <motion.div custom={1.05} variants={fadeUp} initial="hidden" animate="show" className="rounded-3xl p-4 mb-6 bg-white" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <p className="section-label mb-2">Tus proximas clases</p>
            <div className="space-y-2">
              {upcomingBookings.slice(0, 3).map((item) => (
                <div key={item.id} className="rounded-2xl p-3" style={{ background: 'rgba(0,0,0,0.02)' }}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-[12px] text-charcoal">{classTypeLabels[item.classType] || item.classType}</p>
                    <span className="text-[10px] font-semibold" style={{ color: '#C19C80' }}>{schedule.formatTimeLabel(item.time)}</span>
                  </div>
                  <p className="text-[10px] mt-1" style={{ color: '#C4AFA2' }}>
                    {new Date(item.date + 'T12:00:00').toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'short' })}
                  </p>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        <motion.div custom={1.2} variants={fadeUp} initial="hidden" animate="show" className="mb-4 flex items-center justify-between">
          <p className="section-label mb-0">Espacios disponibles</p>
          <button onClick={() => onNavigate(isAdmin ? 'admin' : 'book')} className="text-[11px] font-semibold flex items-center gap-1" style={{ color: '#C19C80' }}>
            Ver todos <FiChevronRight size={12} />
          </button>
        </motion.div>

        <motion.div custom={1.4} variants={fadeUp} initial="hidden" animate="show" className="grid grid-cols-2 gap-3 mb-6">
          {availableSlots.length === 0 ? (
            <div className="col-span-2 rounded-3xl p-5 bg-white text-center" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <p className="font-semibold text-charcoal mb-1">Sin horarios cargados</p>
              <p className="text-[11px]" style={{ color: '#C4AFA2' }}>
                {isAdmin ? 'Crea el primero desde la pestaña Admin.' : 'El estudio publicará nuevos horarios pronto.'}
              </p>
            </div>
          ) : availableSlots.map((slot) => (
            <button key={`${slot.date}_${slot.time}_${slot.id}`} onClick={() => onNavigate(isAdmin ? 'admin' : 'book')} className="text-left rounded-3xl p-4 bg-white tap" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <div className="flex items-center gap-2 mb-2">
                <FiCalendar size={12} style={{ color: '#C19C80' }} />
                <span className="text-[12px] font-semibold text-charcoal">{slot.isToday ? 'Hoy' : slot.label}</span>
              </div>
              <div className="flex items-center gap-2 mb-2">
                <FiClock size={12} style={{ color: '#C4AFA2' }} />
                <span className="text-[11px]" style={{ color: '#666' }}>{schedule.formatTimeLabel(slot.time)}</span>
              </div>
              <p className="text-[12px] font-semibold text-charcoal mb-1">{classTypeLabels[slot.classType] || slot.classType}</p>
              <div className="flex items-center justify-between text-[11px] mt-2">
                <span style={{ color: '#8FA685' }}>{slot.spots} cupos</span>
                <span style={{ color: '#C19C80' }}>${slot.price}</span>
              </div>
            </button>
          ))}
        </motion.div>

        <motion.div custom={1.8} variants={fadeUp} initial="hidden" animate="show" className="rounded-3xl p-5 bg-white" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <p className="section-label">Tu resumen</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl p-4" style={{ background: 'rgba(193,156,128,0.08)' }}>
              <p className="text-[10px] uppercase font-bold tracking-[0.12em]" style={{ color: '#C19C80' }}>Clases</p>
              <p className="font-display text-[28px] text-charcoal mt-1">{totalClasses}</p>
            </div>
            <div className="rounded-2xl p-4" style={{ background: 'rgba(143,166,133,0.08)' }}>
              <p className="text-[10px] uppercase font-bold tracking-[0.12em]" style={{ color: '#8FA685' }}>Estado</p>
              <p className="font-semibold text-[14px] text-charcoal mt-2">{hasUsedTrial ? 'Activa' : 'Prueba disponible'}</p>
            </div>
          </div>
          {!isAdmin && (
            <button onClick={() => onNavigate('book')} className="mt-4 w-full py-3 rounded-2xl text-[13px] font-semibold flex items-center justify-center gap-2 tap" style={{ background: 'rgba(193,156,128,0.12)', color: '#8B6B53' }}>
              Ver horarios activos <FiArrowRight size={13} />
            </button>
          )}
        </motion.div>

        {!isAdmin && (
          <motion.div custom={2.1} variants={fadeUp} initial="hidden" animate="show" className="grid grid-cols-2 gap-3 mt-4">
            <div className="rounded-3xl p-4 bg-white" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <div className="flex items-center gap-2 mb-2">
                <FiTrendingUp size={14} style={{ color: '#8FA685' }} />
                <p className="text-[10px] uppercase font-bold tracking-[0.12em]" style={{ color: '#8FA685' }}>Constancia</p>
              </div>
              <p className="font-display text-[24px] text-charcoal">{lastThirtyCount}</p>
              <p className="text-[11px] mt-1" style={{ color: '#C4AFA2' }}>{consistencyLabel}</p>
            </div>

            <div className="rounded-3xl p-4 bg-white" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <div className="flex items-center gap-2 mb-2">
                <FiStar size={14} style={{ color: '#C19C80' }} />
                <p className="text-[10px] uppercase font-bold tracking-[0.12em]" style={{ color: '#C19C80' }}>Objetivo</p>
              </div>
              <p className="font-display text-[24px] text-charcoal">{Math.max(0, 8 - lastThirtyCount)}</p>
              <p className="text-[11px] mt-1" style={{ color: '#C4AFA2' }}>Clases para meta mensual de 8</p>
            </div>

            <div className="col-span-2 rounded-3xl p-4" style={{ background: 'linear-gradient(135deg, rgba(193,156,128,0.12) 0%, rgba(143,166,133,0.12) 100%)' }}>
              <div className="flex items-start gap-2">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.5)' }}>
                  <FiHeart size={14} style={{ color: '#8B6B53' }} />
                </div>
                <div>
                  <p className="font-semibold text-[13px] text-charcoal">Sugerencia del estudio</p>
                  <p className="text-[11px] mt-1" style={{ color: '#6E625A' }}>
                    Alterna sesiones de semi-grupal con una privada cada 2 semanas para acelerar tecnica y movilidad.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}
