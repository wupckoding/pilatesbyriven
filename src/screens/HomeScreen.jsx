import React, { useMemo, useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FiArrowRight, FiCalendar, FiClock, FiChevronRight, FiMessageCircle, FiInstagram, FiHeart, FiStar, FiZap, FiSmartphone, FiX, FiShare, FiPlusSquare } from 'react-icons/fi'
import { bookings, schedule, statusConfig } from '../utils/data'
import { config } from '../config'

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: (i) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.07, duration: 0.5, ease: [0.25, 0.1, 0.25, 1] },
  }),
}

const classTypeLabels = { 'semi-grupal': 'Semi-grupal', 'duo': 'Dúo', 'privada': 'Privada', 'mat': 'MAT' }

const motivationalQuotes = [
  '"El movimiento es una medicina." – Joseph Pilates',
  '"Después de 10 sesiones sientes la diferencia."',
  '"Tu cuerpo es tu templo. Cuídalo."',
  '"Cada día es una nueva oportunidad de ser más fuerte."',
  '"La salud es una riqueza real, no piezas de oro."',
]

export default function HomeScreen({ user, onNavigate }) {
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Buenos días' : hour < 18 ? 'Buenas tardes' : 'Buenas noches'
  const firstName = user?.name?.split(' ')[0] || ''

  // Rotating motivational quote
  const [quoteIdx, setQuoteIdx] = useState(0)
  useEffect(() => {
    const i = setInterval(() => setQuoteIdx(p => (p + 1) % motivationalQuotes.length), 6000)
    return () => clearInterval(i)
  }, [])

  // Install app prompt
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone
  const [showInstall, setShowInstall] = useState(() => {
    if (isStandalone) return false
    return !localStorage.getItem('pbr_install_dismissed')
  })
  const [installStep, setInstallStep] = useState(0) // 0=intro, 1=iPhone, 2=Android

  const dismissInstall = () => {
    setShowInstall(false)
    localStorage.setItem('pbr_install_dismissed', '1')
  }

  // Async state
  const [upcomingBookings, setUpcomingBookings] = useState([])
  const [hasUsedTrial, setHasUsedTrial] = useState(false)
  const [totalClasses, setTotalClasses] = useState(0)
  const [availability, setAvailability] = useState({})

  // Fetch data from API
  useEffect(() => {
    if (!user?.id) return
    const dates = schedule.getNextDates(4)
    const startDate = dates[0]?.date
    const endDate = dates[dates.length - 1]?.date

    Promise.all([
      bookings.getUpcoming(),
      bookings.hasUsedTrial(),
      bookings.getByUser(),
      startDate && endDate ? bookings.getAvailability(startDate, endDate) : Promise.resolve({}),
    ]).then(([upcoming, trial, all, avail]) => {
      setUpcomingBookings(upcoming.slice(0, 2))
      setHasUsedTrial(trial)
      setTotalClasses(all.filter(b => b.status !== 'cancelled').length)
      setAvailability(avail)
    })
  }, [user])

  const nextBooking = upcomingBookings[0] || null

  // Next 3 available slots
  const nextSlots = useMemo(() => {
    const dates = schedule.getNextDates(4)
    const slots = []
    for (const d of dates) {
      for (const t of schedule.times) {
        const booked = availability[`${d.date}_${t.id}`] || 0
        const spots = Math.max(0, 3 - booked)
        if (spots > 0 && slots.length < 3) {
          slots.push({ ...d, time: t, spots })
        }
      }
    }
    return slots
  }, [availability])

  // Day of week for greeting
  const dayName = new Date().toLocaleDateString('es-CR', { weekday: 'long' })

  return (
    <div className="screen-scroll">
      <div className="px-6 pt-5 pb-8">

        {/* ── Animated Header ── */}
        <motion.div custom={0} variants={fadeUp} initial="hidden" animate="show"
          className="flex items-center justify-between mb-2">
          <div>
            <p className="text-[12px] font-medium capitalize" style={{ color: '#C4AFA2' }}>
              {greeting}, {dayName}
            </p>
            <h1 className="font-display text-[26px] font-bold text-charcoal tracking-tight mt-0.5">
              {firstName ? `Hola, ${firstName}` : 'Bienvenida'} {'✨'}
            </h1>
          </div>
          <motion.button onClick={() => onNavigate('profile')}
            whileTap={{ scale: 0.92 }}
            className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-elevated"
            style={{ background: 'linear-gradient(135deg, #C19C80 0%, #A67D64 100%)' }}>
            <span className="text-white font-display font-bold text-lg">
              {firstName?.[0]?.toUpperCase() || 'R'}
            </span>
          </motion.button>
        </motion.div>

        {/* ── Motivational Quote Rotator ── */}
        <motion.div custom={0.5} variants={fadeUp} initial="hidden" animate="show" className="mb-6">
          <AnimatePresence mode="wait">
            <motion.p
              key={quoteIdx}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.5 }}
              className="text-[11px] italic leading-relaxed"
              style={{ color: '#C4AFA2' }}
            >
              {motivationalQuotes[quoteIdx]}
            </motion.p>
          </AnimatePresence>
        </motion.div>

        {/* ── Install App Banner ── */}
        <AnimatePresence>
          {showInstall && (
            <motion.div
              initial={{ opacity: 0, height: 0, marginBottom: 0 }}
              animate={{ opacity: 1, height: 'auto', marginBottom: 20 }}
              exit={{ opacity: 0, height: 0, marginBottom: 0 }}
              transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
              className="overflow-hidden"
            >
              <div className="rounded-2xl relative overflow-hidden"
                style={{ background: 'linear-gradient(135deg, #1A1A1A 0%, #2A2A2A 100%)' }}>
                <div className="absolute -top-8 -right-8 w-28 h-28 bg-gold/15 rounded-full blur-3xl" />
                <div className="absolute -bottom-6 -left-6 w-20 h-20 bg-sage/10 rounded-full blur-3xl" />

                <button onClick={dismissInstall}
                  className="absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center z-20"
                  style={{ background: 'rgba(255,255,255,0.1)' }}>
                  <FiX size={13} className="text-white/60" />
                </button>

                <div className="p-5 relative z-10">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: 'linear-gradient(135deg, #C19C80 0%, #A67D64 100%)' }}>
                      <FiSmartphone size={18} className="text-white" />
                    </div>
                    <div>
                      <p className="text-white text-[13px] font-semibold">Instala la App</p>
                      <p className="text-white/40 text-[10px]">Acceso r{'á'}pido desde tu pantalla</p>
                    </div>
                  </div>

                  <AnimatePresence mode="wait">
                    {installStep === 0 ? (
                      <motion.div key="intro"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <p className="text-white/50 text-[11px] leading-relaxed mb-4">
                          Agrega Pilates by Riven a tu pantalla de inicio para abrir la app con un solo toque, como cualquier aplicaci{'ó'}n.
                        </p>
                        <motion.button
                          whileTap={{ scale: 0.95 }}
                          onClick={() => setInstallStep(1)}
                          className="w-full py-2.5 rounded-xl text-[12px] font-semibold flex items-center justify-center gap-2"
                          style={{ background: 'rgba(193,156,128,0.15)', color: '#C19C80' }}>
                          Ver c{'ó'}mo instalar <FiArrowRight size={12} />
                        </motion.button>
                      </motion.div>
                    ) : (
                      <motion.div key="steps"
                        initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>

                        {/* Device selector tabs */}
                        <div className="flex gap-2 mb-4">
                          <button
                            onClick={() => setInstallStep(1)}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-semibold transition-all"
                            style={{
                              background: installStep === 1 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)',
                              color: installStep === 1 ? '#fff' : 'rgba(255,255,255,0.35)',
                              border: installStep === 1 ? '1px solid rgba(255,255,255,0.15)' : '1px solid transparent',
                            }}>
                            <span className="text-[13px]">{'\uD83C\uDF4F'}</span> iPhone
                          </button>
                          <button
                            onClick={() => setInstallStep(2)}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-semibold transition-all"
                            style={{
                              background: installStep === 2 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)',
                              color: installStep === 2 ? '#fff' : 'rgba(255,255,255,0.35)',
                              border: installStep === 2 ? '1px solid rgba(255,255,255,0.15)' : '1px solid transparent',
                            }}>
                            <span className="text-[13px]">{'\uD83E\uDD16'}</span> Android
                          </button>
                        </div>

                        <AnimatePresence mode="wait">
                          {installStep === 1 ? (
                            <motion.div key="ios"
                              initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}
                              transition={{ duration: 0.2 }}>
                              <p className="text-white/30 text-[9px] font-bold uppercase tracking-wider mb-3">En Safari</p>
                              <div className="space-y-3">
                                <div className="flex items-start gap-3">
                                  <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                                    style={{ background: 'rgba(193,156,128,0.2)' }}>
                                    <span className="text-[10px] font-bold" style={{ color: '#C19C80' }}>1</span>
                                  </div>
                                  <div>
                                    <p className="text-white text-[12px] font-medium">
                                      Toca el bot{'ó'}n <span className="inline-flex items-center align-middle mx-0.5 px-1.5 py-0.5 rounded bg-white/10"><FiShare size={11} className="text-blue-400" /></span> Compartir
                                    </p>
                                    <p className="text-white/35 text-[10px] mt-0.5">En la barra inferior de Safari</p>
                                  </div>
                                </div>
                                <div className="flex items-start gap-3">
                                  <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                                    style={{ background: 'rgba(193,156,128,0.2)' }}>
                                    <span className="text-[10px] font-bold" style={{ color: '#C19C80' }}>2</span>
                                  </div>
                                  <div>
                                    <p className="text-white text-[12px] font-medium">
                                      Desliza y busca <span className="inline-flex items-center align-middle mx-0.5 px-1.5 py-0.5 rounded bg-white/10 text-white/80 text-[10px] font-semibold"><FiPlusSquare size={11} className="mr-1" /> Agregar a Inicio</span>
                                    </p>
                                    <p className="text-white/35 text-[10px] mt-0.5">Desliza hacia abajo en el men{'ú'}</p>
                                  </div>
                                </div>
                                <div className="flex items-start gap-3">
                                  <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                                    style={{ background: 'rgba(193,156,128,0.2)' }}>
                                    <span className="text-[10px] font-bold" style={{ color: '#C19C80' }}>3</span>
                                  </div>
                                  <div>
                                    <p className="text-white text-[12px] font-medium">Toca <span className="text-blue-400 font-semibold">Agregar</span></p>
                                    <p className="text-white/35 text-[10px] mt-0.5">{'¡'}Listo! El {'í'}cono aparecer{'á'} en tu inicio</p>
                                  </div>
                                </div>
                              </div>
                            </motion.div>
                          ) : (
                            <motion.div key="android"
                              initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}
                              transition={{ duration: 0.2 }}>
                              <p className="text-white/30 text-[9px] font-bold uppercase tracking-wider mb-3">En Chrome</p>
                              <div className="space-y-3">
                                <div className="flex items-start gap-3">
                                  <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                                    style={{ background: 'rgba(193,156,128,0.2)' }}>
                                    <span className="text-[10px] font-bold" style={{ color: '#C19C80' }}>1</span>
                                  </div>
                                  <div>
                                    <p className="text-white text-[12px] font-medium">
                                      Toca los <span className="inline-flex items-center align-middle mx-0.5 px-1.5 py-0.5 rounded bg-white/10 text-white/80 text-[11px] font-bold">{'⋮'}</span> tres puntos
                                    </p>
                                    <p className="text-white/35 text-[10px] mt-0.5">Arriba a la derecha en Chrome</p>
                                  </div>
                                </div>
                                <div className="flex items-start gap-3">
                                  <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                                    style={{ background: 'rgba(193,156,128,0.2)' }}>
                                    <span className="text-[10px] font-bold" style={{ color: '#C19C80' }}>2</span>
                                  </div>
                                  <div>
                                    <p className="text-white text-[12px] font-medium">
                                      Toca <span className="inline-flex items-center align-middle mx-0.5 px-1.5 py-0.5 rounded bg-white/10 text-white/80 text-[10px] font-semibold"><FiShare size={11} className="mr-1" /> Compartir</span>
                                    </p>
                                    <p className="text-white/35 text-[10px] mt-0.5">En el men{'ú'} que aparece</p>
                                  </div>
                                </div>
                                <div className="flex items-start gap-3">
                                  <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                                    style={{ background: 'rgba(193,156,128,0.2)' }}>
                                    <span className="text-[10px] font-bold" style={{ color: '#C19C80' }}>3</span>
                                  </div>
                                  <div>
                                    <p className="text-white text-[12px] font-medium">
                                      Toca <span className="inline-flex items-center align-middle mx-0.5 px-1.5 py-0.5 rounded bg-white/10 text-white/80 text-[10px] font-semibold">M{'á'}s</span> y luego
                                    </p>
                                    <p className="text-white/35 text-[10px] mt-0.5">
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/10 text-white/80 text-[10px] font-semibold"><FiPlusSquare size={11} /> Agregar a pantalla de inicio</span>
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-start gap-3">
                                  <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                                    style={{ background: 'rgba(193,156,128,0.2)' }}>
                                    <span className="text-[10px] font-bold" style={{ color: '#C19C80' }}>4</span>
                                  </div>
                                  <div>
                                    <p className="text-white text-[12px] font-medium">Toca <span className="text-green-400 font-semibold">Agregar</span></p>
                                    <p className="text-white/35 text-[10px] mt-0.5">{'¡'}Listo! Busca el {'í'}cono en tu inicio</p>
                                  </div>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        <motion.button
                          whileTap={{ scale: 0.95 }}
                          onClick={dismissInstall}
                          className="w-full py-2.5 rounded-xl text-[12px] font-semibold mt-4"
                          style={{ background: 'rgba(143,166,133,0.15)', color: '#8FA685' }}>
                          {'¡'}Entendido!
                        </motion.button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Stats Strip (if has classes) ── */}
        {totalClasses > 0 && (
          <motion.div custom={1} variants={fadeUp} initial="hidden" animate="show" className="mb-5">
            <div className="flex gap-2.5">
              <div className="flex-1 rounded-2xl p-3 text-center"
                style={{ background: 'rgba(193,156,128,0.06)', border: '1px solid rgba(193,156,128,0.06)' }}>
                <p className="font-display text-[22px] font-bold text-charcoal">{totalClasses}</p>
                <p className="text-[9px] font-semibold uppercase tracking-wider mt-0.5" style={{ color: '#C4AFA2' }}>
                  {totalClasses === 1 ? 'Clase' : 'Clases'}
                </p>
              </div>
              <div className="flex-1 rounded-2xl p-3 text-center"
                style={{ background: 'rgba(143,166,133,0.06)', border: '1px solid rgba(143,166,133,0.06)' }}>
                <p className="font-display text-[22px] font-bold text-charcoal">
                  {upcomingBookings.length}
                </p>
                <p className="text-[9px] font-semibold uppercase tracking-wider mt-0.5" style={{ color: '#8FA685' }}>
                  Pr{'ó'}ximas
                </p>
              </div>
              <div className="flex-1 rounded-2xl p-3 text-center"
                style={{ background: 'rgba(196,131,142,0.06)', border: '1px solid rgba(196,131,142,0.06)' }}>
                <p className="font-display text-[22px] font-bold text-charcoal">
                  {hasUsedTrial ? '✓' : '1'}
                </p>
                <p className="text-[9px] font-semibold uppercase tracking-wider mt-0.5" style={{ color: '#C4838E' }}>
                  {hasUsedTrial ? 'Prueba usada' : 'Prueba gratis'}
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Next Booking Card (if exists) ── */}
        {nextBooking ? (
          <motion.div custom={2} variants={fadeUp} initial="hidden" animate="show" className="mb-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] mb-2.5" style={{ color: '#C19C80' }}>
              Tu Pr{'ó'}xima Clase
            </p>
            <motion.div whileTap={{ scale: 0.98 }}
              className="rounded-3xl overflow-hidden" style={{ background: '#1A1A1A' }}>
              <div className="p-5 relative">
                <div className="absolute -top-8 -right-8 w-32 h-32 bg-gold/10 rounded-full blur-3xl" />
                <div className="absolute -bottom-10 -left-6 w-24 h-24 bg-rose/10 rounded-full blur-3xl" />
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-bold px-2.5 py-1 rounded-full"
                      style={{ color: statusConfig[nextBooking.status]?.color || '#8FA685', background: 'rgba(255,255,255,0.08)' }}>
                      {statusConfig[nextBooking.status]?.icon} {statusConfig[nextBooking.status]?.label}
                    </span>
                    <button onClick={() => onNavigate('profile')}
                      className="text-[10px] font-semibold flex items-center gap-1" style={{ color: '#C19C80' }}>
                      Ver todas <FiChevronRight size={10} />
                    </button>
                  </div>
                  <h3 className="text-white font-display text-[20px] font-semibold mb-3">
                    {classTypeLabels[nextBooking.classType] || nextBooking.classType}
                  </h3>
                  <div className="flex items-center gap-5">
                    <div className="flex items-center gap-2">
                      <FiCalendar size={13} className="text-white/30" />
                      <span className="text-white/60 text-[12px] font-medium">
                        {new Date(nextBooking.date + 'T12:00:00').toLocaleDateString('es-CR', { weekday: 'short', day: 'numeric', month: 'short' })}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <FiClock size={13} className="text-white/30" />
                      <span className="text-white/60 text-[12px] font-medium">
                        {nextBooking.time === '07:00' ? '7:00 AM' : '6:00 PM'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        ) : (
          /* ── Hero CTA for new users ── */
          <motion.div custom={2} variants={fadeUp} initial="hidden" animate="show" className="mb-5">
            <div className="rounded-3xl overflow-hidden relative" style={{ background: '#1A1A1A' }}>
              <div className="absolute -top-10 -right-10 w-44 h-44 bg-rose/15 rounded-full blur-3xl" />
              <div className="absolute -bottom-12 -left-8 w-36 h-36 bg-gold/10 rounded-full blur-3xl" />
              <div className="p-6 relative z-10">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.08] text-white/70 text-[11px] font-semibold tracking-wide mb-4">
                  {'✨'} {hasUsedTrial ? 'RESERVA TU CLASE' : 'PRIMERA CLASE $15'}
                </span>
                <h2 className="text-white font-display text-[22px] font-semibold leading-snug mb-2">
                  {hasUsedTrial ? 'Sigue transformando\ntu cuerpo' : 'Tu experiencia de\nPilates comienza hoy'}
                </h2>
                <p className="text-white/40 text-[13px] leading-relaxed mb-5">
                  {hasUsedTrial
                    ? 'Elige tu horario y reserva tu próxima sesión'
                    : 'Clase de prueba semi-grupal a solo $15'
                  }
                </p>
                <motion.button onClick={() => onNavigate('book')}
                  whileTap={{ scale: 0.95 }}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-white text-charcoal text-[13px] font-semibold rounded-xl shadow-card">
                  Reservar ahora <FiArrowRight size={13} />
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Quick Book — Next Available Slots ── */}
        {nextSlots.length > 0 && (
          <motion.div custom={3} variants={fadeUp} initial="hidden" animate="show" className="mb-6">
            <div className="flex items-center justify-between mb-2.5">
              <p className="section-label mb-0">Espacios Disponibles</p>
              <button onClick={() => onNavigate('book')}
                className="text-[10px] font-semibold flex items-center gap-0.5" style={{ color: '#C19C80' }}>
                Ver todos <FiChevronRight size={10} />
              </button>
            </div>
            <div className="flex gap-2">
              {nextSlots.map((s, i) => (
                <motion.button key={i} onClick={() => onNavigate('book')}
                  whileTap={{ scale: 0.95 }}
                  className="flex-1 rounded-2xl p-3 text-left transition-all"
                  style={{ background: 'white', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', border: '1px solid rgba(193,156,128,0.08)' }}>
                  <div className="flex items-center gap-1 mb-1">
                    <FiCalendar size={11} style={{ color: '#C19C80' }} />
                    <p className="text-[11px] font-bold text-charcoal">{s.label}</p>
                  </div>
                  <p className="text-[10px] font-medium" style={{ color: '#666' }}>{s.time.label}</p>
                  <div className="flex items-center gap-1 mt-2">
                    <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(143,166,133,0.15)' }}>
                      <div className="h-full rounded-full" style={{
                        background: s.spots <= 1 ? '#C4838E' : '#8FA685',
                        width: `${Math.max(15, ((3 - s.spots) / 3) * 100)}%`
                      }} />
                    </div>
                    <span className="text-[9px] font-bold" style={{ color: s.spots <= 1 ? '#C4838E' : '#8FA685' }}>
                      {s.spots}
                    </span>
                  </div>
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}

        {/* ── Interactive Benefits Section ── */}
        <motion.div custom={4} variants={fadeUp} initial="hidden" animate="show" className="mb-6">
          <p className="section-label">{'¿'}Por qu{'é'} Pilates by Riven?</p>
          <div className="space-y-2.5">
            {[
              {
                icon: <FiHeart size={16} />,
                title: 'Grupos pequeños',
                desc: 'Máximo 3 personas por clase para atención personalizada',
                color: '#C4838E',
                bg: 'rgba(196,131,142,0.06)',
              },
              {
                icon: <FiStar size={16} />,
                title: 'Equipos profesionales',
                desc: 'Reformer, Cadillac y Wunda Chair de alta calidad',
                color: '#C19C80',
                bg: 'rgba(193,156,128,0.06)',
              },
              {
                icon: <FiZap size={16} />,
                title: 'Resultados reales',
                desc: 'Flexibilidad, fuerza y postura desde la primera sesión',
                color: '#8FA685',
                bg: 'rgba(143,166,133,0.06)',
              },
            ].map((b, i) => (
              <motion.div key={i}
                whileTap={{ scale: 0.98 }}
                className="flex items-center gap-4 p-4 rounded-2xl transition-all"
                style={{ background: b.bg, border: `1px solid ${b.bg}` }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: `${b.color}15`, color: b.color }}>
                  {b.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-charcoal">{b.title}</p>
                  <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: '#999' }}>{b.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* ── Pricing Overview (swipeable feel) ── */}
        <motion.div custom={5} variants={fadeUp} initial="hidden" animate="show" className="mb-6">
          <p className="section-label">Nuestros Precios</p>

          {/* Clases individuales */}
          <div className="grid grid-cols-3 gap-2 mb-2.5">
            {[
              { label: 'Prueba', price: '15', note: 'Primera clase', highlight: true },
              { label: 'Semi-grupal', price: '25', note: 'Por clase' },
              { label: 'Privada', price: '60', note: 'Personalizada' },
            ].map((p, i) => (
              <motion.button key={i}
                whileTap={{ scale: 0.95 }}
                onClick={() => onNavigate('book')}
                className="rounded-2xl text-center relative overflow-hidden"
                style={{
                  background: p.highlight ? 'rgba(143,166,133,0.08)' : 'white',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                  border: p.highlight ? '1px solid rgba(143,166,133,0.15)' : '1px solid rgba(193,156,128,0.06)',
                }}>
                {p.highlight && (
                  <div className="w-full py-[3px] text-[7px] font-bold tracking-wider text-white text-center"
                    style={{ background: '#8FA685' }}>
                    PROMO
                  </div>
                )}
                <div className={`px-2 ${p.highlight ? 'pt-2 pb-3' : 'py-3'}`}>
                  <p className="font-display text-[20px] font-bold text-charcoal">${p.price}</p>
                  <p className="text-[10px] font-semibold text-charcoal mt-0.5">{p.label}</p>
                  <p className="text-[8px] mt-0.5" style={{ color: '#C4AFA2' }}>{p.note}</p>
                </div>
              </motion.button>
            ))}
          </div>

          {/* Paquetes y extras */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Dúo', price: '30', note: 'c/u por clase' },
              { label: '4 Clases', price: '80', note: 'Paquete' },
              { label: '8 Clases', price: '150', note: 'Paquete' },
            ].map((p, i) => (
              <motion.button key={i}
                whileTap={{ scale: 0.95 }}
                onClick={() => onNavigate('book')}
                className="rounded-2xl py-3 px-2 text-center"
                style={{ background: 'white', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', border: '1px solid rgba(193,156,128,0.06)' }}>
                <p className="font-display text-[18px] font-bold text-charcoal">${p.price}</p>
                <p className="text-[10px] font-semibold text-charcoal mt-0.5">{p.label}</p>
                <p className="text-[8px] mt-0.5" style={{ color: '#C4AFA2' }}>{p.note}</p>
              </motion.button>
            ))}
          </div>
        </motion.div>

        {/* ── Schedule overview ── */}
        <motion.div custom={6} variants={fadeUp} initial="hidden" animate="show" className="mb-6">
          <p className="section-label">Horarios</p>
          <div className="rounded-2xl p-4" style={{ background: 'white', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', border: '1px solid rgba(193,156,128,0.06)' }}>
            <div className="flex items-center gap-3 mb-3 pb-3" style={{ borderBottom: '1px solid rgba(193,156,128,0.08)' }}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(193,156,128,0.08)' }}>
                <FiCalendar size={14} style={{ color: '#C19C80' }} />
              </div>
              <div>
                <p className="text-[12px] font-semibold text-charcoal">Martes, Mi{'é'}rcoles y Jueves</p>
                <p className="text-[10px]" style={{ color: '#C4AFA2' }}>Clases disponibles toda la semana</p>
              </div>
            </div>
            <div className="flex gap-3">
              {schedule.times.map(t => (
                <div key={t.id} className="flex items-center gap-2">
                  <FiClock size={12} style={{ color: '#C4AFA2' }} />
                  <span className="text-[12px] font-medium text-charcoal">{t.label}</span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* ── WhatsApp + Instagram CTAs ── */}
        <motion.div custom={7} variants={fadeUp} initial="hidden" animate="show" className="mb-5">
          <div className="flex gap-2.5">
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => window.open(`https://wa.me/${config.WHATSAPP_NUMBER}?text=¡Hola Andressa! Me gustaría saber más sobre las clases de Pilates.`, '_blank')}
              className="flex-1 flex items-center gap-3 p-4 rounded-2xl transition-all"
              style={{ background: 'rgba(37,211,102,0.06)', border: '1px solid rgba(37,211,102,0.1)' }}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: '#25D366' }}>
                <FiMessageCircle size={16} className="text-white" />
              </div>
              <div className="text-left">
                <p className="text-[12px] font-semibold text-charcoal">WhatsApp</p>
                <p className="text-[9px]" style={{ color: '#999' }}>Escr{'í'}benos</p>
              </div>
            </motion.button>

            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => window.open('https://instagram.com/pilatesbyriven', '_blank')}
              className="flex-1 flex items-center gap-3 p-4 rounded-2xl transition-all"
              style={{ background: 'rgba(225,48,108,0.04)', border: '1px solid rgba(225,48,108,0.08)' }}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #833AB4, #E1306C, #F77737)' }}>
                <FiInstagram size={16} className="text-white" />
              </div>
              <div className="text-left">
                <p className="text-[12px] font-semibold text-charcoal">Instagram</p>
                <p className="text-[9px]" style={{ color: '#999' }}>@pilatesbyriven</p>
              </div>
            </motion.button>
          </div>
        </motion.div>

        {/* ── Final CTA ── */}
        <motion.div custom={8} variants={fadeUp} initial="hidden" animate="show">
          <motion.button onClick={() => onNavigate('book')}
            whileTap={{ scale: 0.97 }}
            className="w-full py-4 rounded-2xl text-[14px] font-semibold tracking-wide flex items-center justify-center gap-2"
            style={{ background: 'linear-gradient(135deg, #C19C80 0%, #A67D64 100%)', color: '#FFFFFF', boxShadow: '0 4px 20px rgba(193,156,128,0.35)' }}>
            Reservar una Clase <FiArrowRight size={15} />
          </motion.button>
        </motion.div>

      </div>
    </div>
  )
}
