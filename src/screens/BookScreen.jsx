import React, { useState, useMemo, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FiCheck, FiClock, FiX, FiMessageCircle, FiTag, FiLoader } from 'react-icons/fi'
import { bookings, schedule } from '../utils/data'
import { config } from '../config'

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: (i) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.05, duration: 0.4, ease: [0.25, 0.1, 0.25, 1] },
  }),
}

const classTypes = [
  { id: 'semi-grupal', label: 'Semi-grupal', short: 'Grupal', price: 25, trialPrice: 15 },
  { id: 'duo', label: 'Dúo', short: 'Dúo', price: 30 },
  { id: 'privada', label: 'Privada', short: 'Privada', price: 60 },
]

const equipmentOptions = [
  { id: 'reformer', label: 'Reformer', icon: '\u{1F3CB}\u{FE0F}' },
  { id: 'cadillac', label: 'Cadillac', icon: '\u{1F517}' },
  { id: 'wunda', label: 'Wunda Chair', icon: '\u{1FA91}' },
]

export default function BookScreen({ user }) {
  const [selectedType, setSelectedType] = useState(classTypes[0])
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [notes, setNotes] = useState('')
  const [booked, setBooked] = useState(null)
  const [error, setError] = useState('')
  const [isTrial, setIsTrial] = useState(false)
  const [equipment, setEquipment] = useState('reformer')
  const [hasUsedTrial, setHasUsedTrial] = useState(true)
  const [availability, setAvailability] = useState({})
  const [loading, setLoading] = useState(true)
  const [booking, setBooking] = useState(false)

  // Get upcoming dates (static, client-side)
  const dates = useMemo(() => schedule.getNextDates(6), [])

  // Can this class type use trial?
  const canUseTrial = selectedType.id === 'semi-grupal' && !hasUsedTrial

  // Reset trial if not available
  useEffect(() => {
    if (!canUseTrial) setIsTrial(false)
  }, [canUseTrial])

  // Calculate actual price
  const actualPrice = isTrial ? selectedType.trialPrice : selectedType.price

  // Fetch trial status + availability from API
  useEffect(() => {
    if (!user?.id) return
    setLoading(true)

    const startDate = dates[0]?.date
    const endDate = dates[dates.length - 1]?.date
    if (!startDate || !endDate) return

    Promise.all([
      bookings.hasUsedTrial(),
      bookings.getAvailability(startDate, endDate),
    ]).then(([trial, avail]) => {
      setHasUsedTrial(trial)
      setAvailability(avail)
    }).finally(() => setLoading(false))
  }, [user, dates])

  // Compute slots with availability
  const upcomingDays = useMemo(() => {
    return dates.map(d => ({
      ...d,
      slots: schedule.times.map(t => {
        const booked = availability[`${d.date}_${t.id}`] || 0
        const max = selectedType.id === 'duo' ? 2 : selectedType.id === 'privada' ? 1 : 3
        return {
          time: t,
          spots: Math.max(0, max - booked),
        }
      }),
    }))
  }, [dates, selectedType, availability])

  const handleBook = useCallback(async () => {
    if (!selectedSlot || !user || booking) return
    setError('')
    setBooking(true)

    const result = await bookings.create({
      classType: selectedType.id,
      date: selectedSlot.date,
      time: selectedSlot.time.id,
      notes,
      equipment,
      isTrial,
    })

    if (result.error) {
      setError(result.error)
      setBooking(false)
      return
    }

    setBooked(result.booking)
    setBooking(false)

    // Refresh availability
    const startDate = dates[0]?.date
    const endDate = dates[dates.length - 1]?.date
    if (startDate && endDate) {
      bookings.getAvailability(startDate, endDate).then(setAvailability)
    }
    if (isTrial) setHasUsedTrial(true)
  }, [selectedSlot, selectedType, notes, user, equipment, isTrial, booking, dates])

  const closeSheet = () => {
    setSelectedSlot(null)
    setNotes('')
    setError('')
    setBooked(null)
  }

  return (
    <div className="screen-scroll">
      <div className="px-6 pt-5 pb-6">

        {/* Header */}
        <motion.div custom={0} variants={fadeUp} initial="hidden" animate="show" className="mb-4">
          <h1 className="font-display text-[22px] font-semibold text-charcoal tracking-tight">Reservar</h1>
          <p className="text-[13px] mt-0.5" style={{ color: '#C4AFA2' }}>
            Elige tu horario y reserva en un toque
          </p>
        </motion.div>

        {/* Class type selector */}
        <motion.div custom={1} variants={fadeUp} initial="hidden" animate="show" className="mb-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] mb-2" style={{ color: '#C4AFA2' }}>Tipo de clase</p>
          <div className="flex flex-wrap gap-2">
            {classTypes.map(ct => (
              <button key={ct.id} onClick={() => { setSelectedType(ct); setEquipment('reformer') }}
                className="flex-1 min-w-0 py-2.5 px-1 rounded-2xl text-center transition-all duration-300 tap"
                style={selectedType.id === ct.id
                  ? { background: '#1A1A1A', color: '#fff', boxShadow: '0 4px 16px rgba(0,0,0,0.15)' }
                  : { background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }
                }>
                <p className={`text-[12px] font-bold ${selectedType.id === ct.id ? 'text-white' : 'text-charcoal'}`}>
                  {ct.short}
                </p>
                <p className={`text-[10px] font-semibold mt-0.5 ${selectedType.id === ct.id ? 'text-white/50' : ''}`}
                  style={selectedType.id !== ct.id ? { color: '#C19C80' } : {}}>
                  ${ct.price}
                </p>
              </button>
            ))}
          </div>
        </motion.div>

        {/* Trial class toggle */}
        {canUseTrial && (
          <motion.div custom={1.5} variants={fadeUp} initial="hidden" animate="show" className="mb-4">
            <button onClick={() => setIsTrial(!isTrial)}
              className="w-full flex items-center gap-3 p-3.5 rounded-2xl transition-all tap"
              style={{
                background: isTrial ? 'rgba(143,166,133,0.1)' : 'rgba(143,166,133,0.04)',
                border: isTrial ? '2px solid #8FA685' : '1px solid rgba(143,166,133,0.12)',
              }}>
              <div className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 transition-all ${isTrial ? '' : 'border'}`}
                style={{
                  background: isTrial ? '#8FA685' : 'transparent',
                  borderColor: isTrial ? '#8FA685' : 'rgba(143,166,133,0.3)',
                }}>
                {isTrial && <FiCheck size={12} className="text-white" />}
              </div>
              <div className="flex-1 text-left">
                <p className="text-[12px] font-semibold text-charcoal">Clase de prueba</p>
                <p className="text-[10px]" style={{ color: '#8FA685' }}>
                  Primera clase a solo <strong>$15</strong> en vez de $25
                </p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <FiTag size={12} style={{ color: '#8FA685' }} />
                <span className="text-[11px] font-bold" style={{ color: '#8FA685' }}>$15</span>
              </div>
            </button>
          </motion.div>
        )}

        {/* Equipment selector */}
        <motion.div custom={1.8} variants={fadeUp} initial="hidden" animate="show" className="mb-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] mb-2" style={{ color: '#C4AFA2' }}>Equipo</p>
          <div className="flex flex-wrap gap-2">
            {equipmentOptions.map(eq => (
              <button key={eq.id} onClick={() => setEquipment(eq.id)}
                className="flex-1 min-w-0 py-2.5 rounded-2xl text-center transition-all duration-200 tap"
                style={equipment === eq.id
                  ? { background: 'rgba(193,156,128,0.12)', border: '2px solid #C19C80' }
                  : { background: 'white', border: '1px solid rgba(193,156,128,0.08)', boxShadow: '0 1px 4px rgba(0,0,0,0.03)' }
                }>
                <span className="text-[16px] block mb-0.5">{eq.icon}</span>
                <p className={`text-[10px] font-semibold ${equipment === eq.id ? 'text-charcoal' : ''}`}
                  style={equipment !== eq.id ? { color: '#999' } : {}}>
                  {eq.label}
                </p>
              </button>
            ))}
          </div>
        </motion.div>

        {/* Week schedule */}
        {loading ? (
          <div className="space-y-4 animate-pulse">
            {[1, 2, 3].map(i => (
              <div key={i}>
                <div className="h-3 w-24 rounded-full mb-3" style={{ background: 'rgba(193,156,128,0.1)' }} />
                <div className="space-y-2">
                  {[1, 2].map(j => (
                    <div key={j} className="h-16 rounded-2xl" style={{ background: 'rgba(0,0,0,0.02)' }} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
        <div className="space-y-5">
          {upcomingDays.map((day, dayIdx) => (
            <motion.div key={day.date} custom={dayIdx + 2} variants={fadeUp} initial="hidden" animate="show">
              {/* Day header */}
              <div className="flex items-center gap-2 mb-2">
                {day.isToday && (
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-full text-white" style={{ background: '#8FA685' }}>HOY</span>
                )}
                <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: '#C19C80' }}>
                  {day.day.label}
                </p>
                <p className="text-[10px] font-medium" style={{ color: '#C4AFA2' }}>
                  {day.label}
                </p>
                <div className="flex-1 h-px" style={{ background: 'rgba(0,0,0,0.04)' }} />
              </div>

              {/* Time slots */}
              <div className="space-y-2">
                {day.slots.map(slot => {
                  const isAM = slot.time.id === '07:00'
                  const full = slot.spots <= 0
                  const timeLabel = isAM ? '7:00 — 8:15 AM' : '6:00 — 7:15 PM'
                  const eqLabel = equipmentOptions.find(e => e.id === equipment)?.label || 'Reformer'

                  return (
                    <div key={slot.time.id}
                      className={`flex items-center gap-3 p-3.5 rounded-2xl bg-white transition-all ${full ? 'opacity-40' : 'tap cursor-pointer active:scale-[0.98]'}`}
                      style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}
                      onClick={() => !full && setSelectedSlot({ ...day, time: slot.time, spots: slot.spots })}>

                      {/* Time icon */}
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: isAM ? 'rgba(193,156,128,0.08)' : 'rgba(196,131,142,0.08)' }}>
                        <FiClock size={16} style={{ color: isAM ? '#C19C80' : '#C4838E' }} />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-[13px] text-charcoal">{timeLabel}</p>
                        <p className="text-[10px] mt-0.5" style={{ color: '#C4AFA2' }}>
                          {eqLabel} · 75 min{isTrial ? ' · Prueba' : ''}
                        </p>
                      </div>

                      {/* Action */}
                      {full ? (
                        <span className="text-[10px] font-semibold px-3 py-1.5 rounded-full"
                          style={{ background: 'rgba(196,131,142,0.08)', color: '#C4838E' }}>
                          Lleno
                        </span>
                      ) : (
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-[10px] font-medium" style={{ color: '#8FA685' }}>
                            {slot.spots} {slot.spots === 1 ? 'cupo' : 'cupos'}
                          </span>
                          <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                            style={{ background: '#C19C80' }}>
                            <span className="text-white text-[14px] font-bold">+</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </motion.div>
          ))}
        </div>
        )}

        {/* MAT + Pricing footnote */}
        <motion.div custom={9} variants={fadeUp} initial="hidden" animate="show" className="mt-6">
          <button
            onClick={() => window.open(`https://wa.me/${config.WHATSAPP_NUMBER}?text=¡Hola! Me interesa una clase MAT para mi evento.`, '_blank')}
            className="w-full flex items-center gap-3 p-3.5 rounded-2xl tap mb-4"
            style={{ background: 'rgba(193,156,128,0.06)' }}>
            <span className="text-lg">{'\u{1F389}'}</span>
            <div className="flex-1 text-left">
              <p className="font-semibold text-[12px] text-charcoal">Clase MAT para tu evento</p>
              <p className="text-[10px]" style={{ color: '#C4AFA2' }}>Cotización personalizada por WhatsApp</p>
            </div>
            <FiMessageCircle size={16} style={{ color: '#C19C80' }} />
          </button>
          <p className="text-center text-[11px]" style={{ color: '#C4AFA2' }}>
            Prueba <span className="font-semibold" style={{ color: '#C19C80' }}>$15</span>{' · '}
            4 clases <span className="font-semibold" style={{ color: '#C19C80' }}>$80</span>{' · '}
            8 clases <span className="font-semibold" style={{ color: '#C19C80' }}>$150</span>
          </p>
        </motion.div>

      </div>

      {/* Bottom sheet (booking confirmation) */}
      <AnimatePresence>
        {selectedSlot && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.35)' }}
              onClick={closeSheet} />

            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl px-6 pt-5 pb-8"
              style={{ background: '#FAF8F5' }}>

              {/* Handle bar */}
              <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ background: 'rgba(0,0,0,0.08)' }} />

              {booked ? (
                /* Success */
                <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                  className="text-center py-4">
                  <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3"
                    style={{ background: 'rgba(143,166,133,0.1)' }}>
                    <FiCheck size={24} style={{ color: '#8FA685' }} />
                  </div>
                  <h3 className="font-display text-[18px] font-semibold text-charcoal mb-1">
                    {'¡'}Reserva Creada!
                  </h3>
                  <p className="text-[12px] mb-1" style={{ color: '#C4AFA2' }}>
                    Pendiente de confirmación.
                  </p>
                  <p className="text-[11px] mb-5" style={{ color: '#C4AFA2' }}>
                    Te notificaremos por WhatsApp.
                  </p>
                  {isTrial && (
                    <div className="mb-4 px-4 py-2 rounded-xl inline-block" style={{ background: 'rgba(143,166,133,0.08)' }}>
                      <p className="text-[11px] font-semibold" style={{ color: '#8FA685' }}>
                        {'\u{2705}'} Clase de prueba aplicada — $15
                      </p>
                    </div>
                  )}
                  <button onClick={closeSheet}
                    className="w-full py-3.5 rounded-2xl text-[13px] font-semibold text-white active:scale-[0.97] transition-transform"
                    style={{ background: '#1A1A1A' }}>
                    Entendido
                  </button>
                </motion.div>
              ) : (
                /* Confirm form */
                <>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="font-display text-[18px] font-semibold text-charcoal">Confirmar Reserva</h3>
                      <p className="text-[12px] mt-0.5" style={{ color: '#C4AFA2' }}>
                        {selectedSlot.fullLabel} · {selectedSlot.time.label}
                      </p>
                    </div>
                    <button onClick={closeSheet} className="w-8 h-8 rounded-xl flex items-center justify-center tap"
                      style={{ background: 'rgba(0,0,0,0.04)' }}>
                      <FiX size={16} style={{ color: 'rgba(26,26,26,0.3)' }} />
                    </button>
                  </div>

                  {/* Summary */}
                  <div className="rounded-2xl p-4 mb-4" style={{ background: 'white', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                    <div className="flex justify-between text-[12px] mb-2">
                      <span style={{ color: '#C4AFA2' }}>Clase</span>
                      <span className="font-semibold text-charcoal">{selectedType.label}</span>
                    </div>
                    <div className="flex justify-between text-[12px] mb-2">
                      <span style={{ color: '#C4AFA2' }}>Equipo</span>
                      <span className="font-semibold text-charcoal">
                        {equipmentOptions.find(e => e.id === equipment)?.label}
                      </span>
                    </div>
                    <div className="flex justify-between text-[12px] mb-2">
                      <span style={{ color: '#C4AFA2' }}>Precio</span>
                      <div className="flex items-center gap-2">
                        {isTrial && (
                          <span className="line-through text-[11px]" style={{ color: '#C4AFA2' }}>
                            ${selectedType.price}
                          </span>
                        )}
                        <span className="font-semibold" style={{ color: isTrial ? '#8FA685' : '#1A1A1A' }}>
                          ${actualPrice}
                        </span>
                        {isTrial && (
                          <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full text-white" style={{ background: '#8FA685' }}>
                            PRUEBA
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex justify-between text-[12px]">
                      <span style={{ color: '#C4AFA2' }}>Cupos</span>
                      <span className="font-semibold" style={{ color: '#8FA685' }}>
                        {selectedSlot.spots} disponible{selectedSlot.spots > 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>

                  {/* Trial toggle inside sheet (if available and not toggled above) */}
                  {canUseTrial && !isTrial && (
                    <button onClick={() => setIsTrial(true)}
                      className="w-full flex items-center gap-3 p-3 rounded-2xl mb-4 tap"
                      style={{ background: 'rgba(143,166,133,0.06)', border: '1px dashed rgba(143,166,133,0.25)' }}>
                      <FiTag size={14} style={{ color: '#8FA685' }} />
                      <p className="text-[11px] flex-1 text-left" style={{ color: '#6B7B63' }}>
                        {'¿'}Primera vez? Aplica tu clase de prueba a <strong>$15</strong>
                      </p>
                    </button>
                  )}

                  {/* Notes */}
                  <textarea value={notes} onChange={e => setNotes(e.target.value)}
                    rows={2} placeholder="Nota opcional (ej: primera vez, lesión...)"
                    className="w-full p-3.5 rounded-2xl text-[12px] resize-none mb-4"
                    style={{ background: 'white', border: '1px solid rgba(0,0,0,0.06)', outline: 'none' }} />

                  <AnimatePresence>
                    {error && (
                      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="text-[11px] font-medium text-center mb-3" style={{ color: '#C4838E' }}>
                        {error}
                      </motion.p>
                    )}
                  </AnimatePresence>

                  {/* Confirm button */}
                  <button onClick={handleBook} disabled={booking}
                    className="w-full py-3.5 rounded-2xl text-[13px] font-semibold text-white active:scale-[0.97] transition-transform disabled:opacity-60 flex items-center justify-center gap-2"
                    style={{ background: '#C19C80', boxShadow: '0 4px 16px rgba(193,156,128,0.3)' }}>
                    {booking ? (
                      <FiLoader size={15} className="animate-spin" />
                    ) : (
                      <>Confirmar Reserva {'—'} ${actualPrice}</>
                    )}
                  </button>
                </>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
