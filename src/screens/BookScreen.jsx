import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FiCheck, FiClock, FiX, FiMessageCircle, FiTag, FiLoader, FiPlus, FiTrash2, FiDollarSign, FiUsers } from 'react-icons/fi'
import { bookings, schedule } from '../utils/data'
import { config } from '../config'

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: (index) => ({
    opacity: 1,
    y: 0,
    transition: { delay: index * 0.05, duration: 0.4, ease: [0.25, 0.1, 0.25, 1] },
  }),
}

const equipmentOptions = [
  { id: 'reformer', label: 'Reformer', icon: '🏋️' },
  { id: 'cadillac', label: 'Cadillac', icon: '🔗' },
  { id: 'wunda', label: 'Wunda Chair', icon: '🪑' },
]

const weekDays = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Lunes' },
  { value: 2, label: 'Martes' },
  { value: 3, label: 'Miércoles' },
  { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' },
  { value: 6, label: 'Sábado' },
]

export default function BookScreen({ user }) {
  const isAdmin = user?.role === 'admin' || user?.email === 'admin@pilatesbyriven.com'
  const classTypes = useMemo(
    () => schedule.classTypes.filter((item) => item.price !== null && item.id !== 'mat'),
    [],
  )
  const dates = useMemo(() => schedule.getNextDates(14), [])

  const [selectedType, setSelectedType] = useState(classTypes[0])
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [notes, setNotes] = useState('')
  const [booked, setBooked] = useState(null)
  const [error, setError] = useState('')
  const [isTrial, setIsTrial] = useState(false)
  const [equipment, setEquipment] = useState('reformer')
  const [hasUsedTrial, setHasUsedTrial] = useState(true)
  const [availableByDate, setAvailableByDate] = useState({})
  const [loading, setLoading] = useState(true)
  const [booking, setBooking] = useState(false)
  const [joiningWaitlist, setJoiningWaitlist] = useState(false)
  const [waitlistDone, setWaitlistDone] = useState(false)
  const [couponCode, setCouponCode] = useState('')
  const [couponApplied, setCouponApplied] = useState(null)
  const [couponLoading, setCouponLoading] = useState(false)
  const [adminSchedules, setAdminSchedules] = useState([])
  const [adminLoading, setAdminLoading] = useState(false)
  const [adminSaving, setAdminSaving] = useState(false)
  const [adminMode, setAdminMode] = useState('date')
  const [adminForm, setAdminForm] = useState({
    classType: 'semi-grupal',
    specificDate: '',
    dayOfWeek: 1,
    time: '18:00',
    maxSpots: 3,
    price: 25,
    isActive: true,
  })

  const canUseTrial = selectedType.id === 'semi-grupal' && !hasUsedTrial

  useEffect(() => {
    if (!canUseTrial) setIsTrial(false)
  }, [canUseTrial])

  const loadSchedules = useCallback(async () => {
    setLoading(true)
    const responses = await Promise.all(
      dates.map(async (dateItem) => [dateItem.date, await schedule.getAvailable(dateItem.date, selectedType.id)])
    )
    setAvailableByDate(Object.fromEntries(responses))
    setLoading(false)
  }, [dates, selectedType.id])

  const loadAdminSchedules = useCallback(async () => {
    setAdminLoading(true)
    const list = await schedule.getAdminSchedules()
    setAdminSchedules(list)
    setAdminLoading(false)
  }, [])

  useEffect(() => {
    if (!user?.id) return
    if (isAdmin) {
      loadAdminSchedules()
      setLoading(false)
      return
    }
    bookings.hasUsedTrial().then(setHasUsedTrial)
    loadSchedules()
  }, [isAdmin, loadAdminSchedules, loadSchedules, user])

  const upcomingDays = useMemo(() => {
    return dates
      .map((dateItem) => ({
        ...dateItem,
        slots: (availableByDate[dateItem.date] || []).filter((slot) => slot.classType === selectedType.id),
      }))
      .filter((dateItem) => dateItem.slots.length > 0)
  }, [availableByDate, dates, selectedType.id])

  const actualPrice = useMemo(() => {
    const basePrice = selectedSlot?.price ?? selectedType.price
    return isTrial ? (selectedType.trialPrice || basePrice) : basePrice
  }, [isTrial, selectedSlot, selectedType])

  const couponPreview = useMemo(() => {
    if (!couponApplied || !actualPrice) {
      return { finalPrice: actualPrice, discountAmount: 0, discountPercent: 0 }
    }
    const percent = Math.max(0, Math.min(100, Number(couponApplied.discountPercent || 0)))
    const discountAmount = Math.round((actualPrice * (percent / 100)) * 100) / 100
    return {
      discountPercent: percent,
      discountAmount,
      finalPrice: Math.max(0, Math.round((actualPrice - discountAmount) * 100) / 100),
    }
  }, [actualPrice, couponApplied])

  const handleBook = useCallback(async () => {
    if (!selectedSlot || !user || booking) return
    setError('')
    setBooking(true)

    const result = await bookings.create({
      classType: selectedType.id,
      date: selectedSlot.date,
      time: selectedSlot.time,
      notes,
      equipment,
      isTrial,
      couponCode: couponApplied?.code || '',
    })

    if (result.error) {
      setError(result.error)
      setBooking(false)
      return
    }

    setBooked(result.booking)
    setBooking(false)
    if (isTrial) setHasUsedTrial(true)
    loadSchedules()
  }, [booking, equipment, isTrial, loadSchedules, notes, selectedSlot, selectedType.id, user])

  const closeSheet = () => {
    setSelectedSlot(null)
    setNotes('')
    setError('')
    setBooked(null)
    setWaitlistDone(false)
    setCouponCode('')
    setCouponApplied(null)
    setCouponLoading(false)
  }

  const handleApplyCoupon = async () => {
    if (!selectedSlot || !couponCode.trim() || couponLoading) return
    setCouponLoading(true)
    setError('')
    const result = await bookings.validateCoupon({
      code: couponCode,
      classType: selectedType.id,
      date: selectedSlot.date,
      time: selectedSlot.time,
      isTrial,
    })
    setCouponLoading(false)
    if (result.error) {
      setCouponApplied(null)
      setError(result.error)
      return
    }
    setCouponApplied(result.coupon)
    setCouponCode(result.coupon.code)
  }

  const handleJoinWaitlist = async () => {
    if (!selectedSlot || joiningWaitlist) return
    setJoiningWaitlist(true)
    setError('')
    const result = await bookings.joinWaitlist({
      classType: selectedType.id,
      date: selectedSlot.date,
      time: selectedSlot.time,
      notes,
    })
    setJoiningWaitlist(false)
    if (result.error) {
      setError(result.error)
      return
    }
    setWaitlistDone(true)
  }

  const handleAdminCreateSchedule = async (event) => {
    event.preventDefault()
    setAdminSaving(true)

    const payload = {
      classType: adminForm.classType,
      time: adminForm.time,
      maxSpots: Number(adminForm.maxSpots),
      price: Number(adminForm.price),
      isActive: adminForm.isActive,
      specificDate: adminMode === 'date' ? adminForm.specificDate : null,
      dayOfWeek: adminMode === 'weekly' ? Number(adminForm.dayOfWeek) : null,
    }

    const result = await schedule.createAdminSchedule(payload)
    setAdminSaving(false)
    if (result.error) {
      window.alert(result.error)
      return
    }

    setAdminForm((current) => ({ ...current, specificDate: '' }))
    loadAdminSchedules()
  }

  const handleAdminDeleteSchedule = async (scheduleId) => {
    const result = await schedule.deleteAdminSchedule(scheduleId)
    if (result.error) {
      window.alert(result.error)
      return
    }
    loadAdminSchedules()
  }

  const handleAdminToggleSchedule = async (scheduleItem) => {
    const result = await schedule.updateAdminSchedule(scheduleItem.id, { isActive: !scheduleItem.isActive })
    if (result.error) {
      window.alert(result.error)
      return
    }
    loadAdminSchedules()
  }

  if (isAdmin) {
    return (
      <div className="screen-scroll">
        <div className="px-6 pt-5 pb-6">
          <motion.div custom={0} variants={fadeUp} initial="hidden" animate="show" className="mb-4">
            <h1 className="font-display text-[22px] font-semibold text-charcoal tracking-tight">Reservar (Admin)</h1>
            <p className="text-[13px] mt-0.5" style={{ color: '#C4AFA2' }}>
              Cria horários, define cupos e preço direto nesta aba
            </p>
          </motion.div>

          <motion.form custom={1} variants={fadeUp} initial="hidden" animate="show" onSubmit={handleAdminCreateSchedule} className="rounded-3xl p-5 mb-5 bg-white" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(193,156,128,0.08)' }}>
                <FiPlus size={16} style={{ color: '#C19C80' }} />
              </div>
              <div>
                <p className="font-semibold text-charcoal">Nuevo horario</p>
                <p className="text-[11px]" style={{ color: '#C4AFA2' }}>Por fecha específica o semanal</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <select
                value={adminForm.classType}
                onChange={(event) => {
                  const nextType = event.target.value
                  const classData = schedule.getClassType(nextType)
                  setAdminForm((current) => ({
                    ...current,
                    classType: nextType,
                    maxSpots: classData?.maxSpots || current.maxSpots,
                    price: classData?.price || current.price,
                  }))
                }}
                className="input-field"
              >
                {schedule.classTypes.map((item) => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </select>
              <input type="time" value={adminForm.time} onChange={(event) => setAdminForm((current) => ({ ...current, time: event.target.value }))} className="input-field" />
            </div>

            <div className="flex gap-2 mb-3">
              <button type="button" onClick={() => setAdminMode('date')} className="flex-1 py-2.5 rounded-2xl text-[11px] font-semibold tap" style={{ background: adminMode === 'date' ? '#1A1A1A' : 'rgba(0,0,0,0.03)', color: adminMode === 'date' ? '#fff' : '#444' }}>
                Fecha específica
              </button>
              <button type="button" onClick={() => setAdminMode('weekly')} className="flex-1 py-2.5 rounded-2xl text-[11px] font-semibold tap" style={{ background: adminMode === 'weekly' ? '#1A1A1A' : 'rgba(0,0,0,0.03)', color: adminMode === 'weekly' ? '#fff' : '#444' }}>
                Repetir semanal
              </button>
            </div>

            {adminMode === 'date' ? (
              <input type="date" value={adminForm.specificDate} onChange={(event) => setAdminForm((current) => ({ ...current, specificDate: event.target.value }))} className="input-field mb-3" required />
            ) : (
              <select value={adminForm.dayOfWeek} onChange={(event) => setAdminForm((current) => ({ ...current, dayOfWeek: Number(event.target.value) }))} className="input-field mb-3">
                {weekDays.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            )}

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="relative">
                <FiUsers className="absolute left-4 top-1/2 -translate-y-1/2" size={14} style={{ color: '#C4AFA2' }} />
                <input type="number" min="1" value={adminForm.maxSpots} onChange={(event) => setAdminForm((current) => ({ ...current, maxSpots: event.target.value }))} className="w-full py-3 pl-11 pr-4 rounded-xl text-[13px] outline-none" style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.04)' }} />
              </div>
              <div className="relative">
                <FiDollarSign className="absolute left-4 top-1/2 -translate-y-1/2" size={14} style={{ color: '#C4AFA2' }} />
                <input type="number" min="0" step="0.01" value={adminForm.price} onChange={(event) => setAdminForm((current) => ({ ...current, price: event.target.value }))} className="w-full py-3 pl-11 pr-4 rounded-xl text-[13px] outline-none" style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.04)' }} />
              </div>
            </div>

            <button type="submit" disabled={adminSaving} className="w-full py-3.5 rounded-2xl text-[13px] font-semibold text-white tap disabled:opacity-60" style={{ background: '#1A1A1A' }}>
              {adminSaving ? 'Guardando...' : 'Guardar horario'}
            </button>
          </motion.form>

          <motion.div custom={2} variants={fadeUp} initial="hidden" animate="show" className="space-y-2">
            {adminLoading ? (
              <div className="rounded-3xl p-5 bg-white text-center" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                <p className="text-[12px]" style={{ color: '#C4AFA2' }}>Cargando horarios...</p>
              </div>
            ) : adminSchedules.length === 0 ? (
              <div className="rounded-3xl p-5 bg-white text-center" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                <p className="font-semibold text-charcoal mb-1">Sin horarios todavía</p>
                <p className="text-[11px]" style={{ color: '#C4AFA2' }}>Crea el primero arriba.</p>
              </div>
            ) : adminSchedules.map((item) => {
              const dayLabel = item.specificDate
                ? new Date(item.specificDate + 'T12:00:00').toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'short' })
                : weekDays.find((day) => day.value === item.dayOfWeek)?.label
              return (
                <div key={item.id} className="rounded-3xl p-4 bg-white" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-[14px] text-charcoal">{classTypes.find((classType) => classType.id === item.classType)?.label || item.classType}</p>
                      <p className="text-[11px] mt-1" style={{ color: '#C4AFA2' }}>{dayLabel} · {schedule.formatTimeLabel(item.time)}</p>
                      <p className="text-[11px] mt-1" style={{ color: '#666' }}>{item.maxSpots} cupos · ${item.price}</p>
                    </div>
                    <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full" style={{ color: item.isActive ? '#8FA685' : '#C4838E', background: item.isActive ? 'rgba(143,166,133,0.1)' : 'rgba(196,131,142,0.1)' }}>
                      {item.isActive ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-4">
                    <button onClick={() => handleAdminToggleSchedule(item)} className="py-2.5 rounded-2xl text-[11px] font-semibold tap" style={{ background: 'rgba(193,156,128,0.08)', color: '#8B6B53' }}>
                      {item.isActive ? 'Desactivar' : 'Activar'}
                    </button>
                    <button onClick={() => handleAdminDeleteSchedule(item.id)} className="py-2.5 rounded-2xl text-[11px] font-semibold flex items-center justify-center gap-1.5 tap" style={{ background: 'rgba(196,131,142,0.1)', color: '#C4838E' }}>
                      <FiTrash2 size={13} /> Eliminar
                    </button>
                  </div>
                </div>
              )
            })}
          </motion.div>
        </div>
      </div>
    )
  }

  return (
    <div className="screen-scroll">
      <div className="px-6 pt-5 pb-6">
        <motion.div custom={0} variants={fadeUp} initial="hidden" animate="show" className="mb-4">
          <h1 className="font-display text-[22px] font-semibold text-charcoal tracking-tight">Reservar</h1>
          <p className="text-[13px] mt-0.5" style={{ color: '#C4AFA2' }}>
            Horarios reales, cupos reales y precio configurado por el admin
          </p>
        </motion.div>

        <motion.div custom={1} variants={fadeUp} initial="hidden" animate="show" className="mb-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] mb-2" style={{ color: '#C4AFA2' }}>Tipo de clase</p>
          <div className="flex flex-wrap gap-2">
            {classTypes.map((classType) => (
              <button
                key={classType.id}
                onClick={() => { setSelectedType(classType); setSelectedSlot(null); setEquipment('reformer') }}
                className="flex-1 min-w-0 py-2.5 px-1 rounded-2xl text-center transition-all duration-300 tap"
                style={selectedType.id === classType.id
                  ? { background: '#1A1A1A', color: '#fff', boxShadow: '0 4px 16px rgba(0,0,0,0.15)' }
                  : { background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}
              >
                <p className={`text-[12px] font-bold ${selectedType.id === classType.id ? 'text-white' : 'text-charcoal'}`}>
                  {classType.short || classType.label}
                </p>
                <p
                  className={`text-[10px] font-semibold mt-0.5 ${selectedType.id === classType.id ? 'text-white/50' : ''}`}
                  style={selectedType.id !== classType.id ? { color: '#C19C80' } : {}}
                >
                  ${classType.price}
                </p>
              </button>
            ))}
          </div>
        </motion.div>

        {canUseTrial && (
          <motion.div custom={1.5} variants={fadeUp} initial="hidden" animate="show" className="mb-4">
            <button
              onClick={() => setIsTrial(!isTrial)}
              className="w-full flex items-center gap-3 p-3.5 rounded-2xl transition-all tap"
              style={{
                background: isTrial ? 'rgba(143,166,133,0.1)' : 'rgba(143,166,133,0.04)',
                border: isTrial ? '2px solid #8FA685' : '1px solid rgba(143,166,133,0.12)',
              }}
            >
              <div
                className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 transition-all ${isTrial ? '' : 'border'}`}
                style={{
                  background: isTrial ? '#8FA685' : 'transparent',
                  borderColor: isTrial ? '#8FA685' : 'rgba(143,166,133,0.3)',
                }}
              >
                {isTrial && <FiCheck size={12} className="text-white" />}
              </div>
              <div className="flex-1 text-left">
                <p className="text-[12px] font-semibold text-charcoal">Clase de prueba</p>
                <p className="text-[10px]" style={{ color: '#8FA685' }}>
                  Primera clase a solo <strong>${selectedType.trialPrice}</strong>
                </p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <FiTag size={12} style={{ color: '#8FA685' }} />
                <span className="text-[11px] font-bold" style={{ color: '#8FA685' }}>${selectedType.trialPrice}</span>
              </div>
            </button>
          </motion.div>
        )}

        <motion.div custom={1.8} variants={fadeUp} initial="hidden" animate="show" className="mb-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] mb-2" style={{ color: '#C4AFA2' }}>Equipo</p>
          <div className="flex flex-wrap gap-2">
            {equipmentOptions.map((item) => (
              <button
                key={item.id}
                onClick={() => setEquipment(item.id)}
                className="flex-1 min-w-0 py-2.5 rounded-2xl text-center transition-all duration-200 tap"
                style={equipment === item.id
                  ? { background: 'rgba(193,156,128,0.12)', border: '2px solid #C19C80' }
                  : { background: 'white', border: '1px solid rgba(193,156,128,0.08)', boxShadow: '0 1px 4px rgba(0,0,0,0.03)' }}
              >
                <span className="text-[16px] block mb-0.5">{item.icon}</span>
                <p className={`text-[10px] font-semibold ${equipment === item.id ? 'text-charcoal' : ''}`} style={equipment !== item.id ? { color: '#999' } : {}}>
                  {item.label}
                </p>
              </button>
            ))}
          </div>
        </motion.div>

        {loading ? (
          <div className="space-y-4 animate-pulse">
            {[1, 2, 3].map((item) => (
              <div key={item}>
                <div className="h-3 w-24 rounded-full mb-3" style={{ background: 'rgba(193,156,128,0.1)' }} />
                <div className="space-y-2">
                  {[1, 2].map((line) => (
                    <div key={line} className="h-16 rounded-2xl" style={{ background: 'rgba(0,0,0,0.02)' }} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : upcomingDays.length === 0 ? (
          <div className="rounded-3xl p-6 text-center bg-white" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <p className="font-display text-[20px] text-charcoal mb-1">Sin horarios disponibles</p>
            <p className="text-[12px]" style={{ color: '#C4AFA2' }}>
              El admin todavía no configuró horarios para este tipo de clase.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {upcomingDays.map((day, dayIndex) => (
              <motion.div key={day.date} custom={dayIndex + 2} variants={fadeUp} initial="hidden" animate="show">
                <div className="flex items-center gap-2 mb-2">
                  {day.isToday && (
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-full text-white" style={{ background: '#8FA685' }}>HOY</span>
                  )}
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: '#C19C80' }}>{day.day.label}</p>
                  <p className="text-[10px] font-medium" style={{ color: '#C4AFA2' }}>{day.label}</p>
                  <div className="flex-1 h-px" style={{ background: 'rgba(0,0,0,0.04)' }} />
                </div>

                <div className="space-y-2">
                  {day.slots.map((slot) => {
                    const full = slot.spots <= 0
                    const equipmentLabel = equipmentOptions.find((item) => item.id === equipment)?.label || 'Reformer'
                    return (
                      <div
                        key={`${day.date}_${slot.time}_${slot.id}`}
                        className={`flex items-center gap-3 p-3.5 rounded-2xl bg-white transition-all tap cursor-pointer active:scale-[0.98] ${full ? 'opacity-80' : ''}`}
                        style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}
                        onClick={() => setSelectedSlot({ ...slot, date: day.date, fullLabel: day.fullLabel, isFull: full })}
                      >
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(193,156,128,0.08)' }}>
                          <FiClock size={16} style={{ color: '#C19C80' }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-[13px] text-charcoal">{schedule.formatTimeLabel(slot.time)}</p>
                          <p className="text-[10px] mt-0.5" style={{ color: '#C4AFA2' }}>
                            {equipmentLabel} · 75 min · ${slot.price}
                          </p>
                        </div>
                        {full ? (
                          <span className="text-[10px] font-semibold px-3 py-1.5 rounded-full" style={{ background: 'rgba(196,131,142,0.08)', color: '#C4838E' }}>
                            Lleno
                          </span>
                        ) : (
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-[10px] font-medium" style={{ color: '#8FA685' }}>
                              {slot.spots} {slot.spots === 1 ? 'cupo' : 'cupos'}
                            </span>
                            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: '#C19C80' }}>
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

        <motion.div custom={9} variants={fadeUp} initial="hidden" animate="show" className="mt-6">
          <button
            onClick={() => window.open(`https://wa.me/${config.WHATSAPP_NUMBER}?text=¡Hola! Me interesa una clase MAT para mi evento.`, '_blank')}
            className="w-full flex items-center gap-3 p-3.5 rounded-2xl tap mb-4"
            style={{ background: 'rgba(193,156,128,0.06)' }}
          >
            <span className="text-lg">🎉</span>
            <div className="flex-1 text-left">
              <p className="font-semibold text-[12px] text-charcoal">Clase MAT para tu evento</p>
              <p className="text-[10px]" style={{ color: '#C4AFA2' }}>Cotización personalizada por WhatsApp</p>
            </div>
            <FiMessageCircle size={16} style={{ color: '#C19C80' }} />
          </button>
        </motion.div>
      </div>

      <AnimatePresence>
        {selectedSlot && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.35)' }} onClick={closeSheet} />

            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="fixed left-0 right-0 z-50 rounded-t-3xl flex flex-col"
              style={{
                background: '#FAF8F5',
                bottom: 'calc(56px + env(safe-area-inset-bottom, 0px))',
                maxHeight: 'min(78vh, 560px)',
              }}
            >
              {/* Handle */}
              <div className="w-10 h-1 rounded-full mx-auto mt-4 mb-3 flex-shrink-0" style={{ background: 'rgba(0,0,0,0.08)' }} />

              {booked || waitlistDone ? (
                <motion.div
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="text-center px-6 py-4 flex-1"
                  style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
                >
                  <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: 'rgba(143,166,133,0.1)' }}>
                    <FiCheck size={24} style={{ color: '#8FA685' }} />
                  </div>
                  <h3 className="font-display text-[18px] font-semibold text-charcoal mb-1">{booked ? '¡Reserva creada!' : 'Lista de espera confirmada'}</h3>
                  <p className="text-[12px] mb-4" style={{ color: '#C4AFA2' }}>{booked ? 'Pendiente de confirmación.' : 'Te avisaremos cuando se libere un cupo.'}</p>
                  <button onClick={closeSheet} className="w-full py-3.5 rounded-2xl text-[13px] font-semibold text-white active:scale-[0.97] transition-transform" style={{ background: '#1A1A1A' }}>
                    Entendido
                  </button>
                </motion.div>
              ) : (
                <>
                  {/* Scrollable content area — min-height:0 is required to allow flex children to shrink */}
                  <div className="overflow-y-auto flex-1 px-6" style={{ minHeight: 0 }}>
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="font-display text-[18px] font-semibold text-charcoal">Confirmar Reserva</h3>
                        <p className="text-[12px] mt-0.5" style={{ color: '#C4AFA2' }}>
                          {selectedSlot.fullLabel} · {schedule.formatTimeLabel(selectedSlot.time)}
                        </p>
                      </div>
                      <button onClick={closeSheet} className="w-8 h-8 rounded-xl flex items-center justify-center tap" style={{ background: 'rgba(0,0,0,0.04)' }}>
                        <FiX size={16} style={{ color: 'rgba(26,26,26,0.3)' }} />
                      </button>
                    </div>

                    <div className="rounded-2xl p-4 mb-4" style={{ background: 'white', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                      <div className="flex justify-between text-[12px] mb-2">
                        <span style={{ color: '#C4AFA2' }}>Clase</span>
                        <span className="font-semibold text-charcoal">{selectedType.label}</span>
                      </div>
                      <div className="flex justify-between text-[12px] mb-2">
                        <span style={{ color: '#C4AFA2' }}>Equipo</span>
                        <span className="font-semibold text-charcoal">{equipmentOptions.find((item) => item.id === equipment)?.label}</span>
                      </div>
                      <div className="flex justify-between text-[12px] mb-2">
                        <span style={{ color: '#C4AFA2' }}>Precio</span>
                        <div className="flex items-center gap-2">
                          {isTrial && <span className="line-through text-[11px]" style={{ color: '#C4AFA2' }}>${selectedSlot.price}</span>}
                          <span className="font-semibold" style={{ color: isTrial ? '#8FA685' : '#1A1A1A' }}>${actualPrice}</span>
                        </div>
                      </div>
                      <div className="flex justify-between text-[12px]">
                        <span style={{ color: '#C4AFA2' }}>Cupos</span>
                        <span className="font-semibold" style={{ color: '#8FA685' }}>
                          {selectedSlot.spots} disponible{selectedSlot.spots > 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>

                    {canUseTrial && !isTrial && (
                      <button onClick={() => setIsTrial(true)} className="w-full flex items-center gap-3 p-3 rounded-2xl mb-4 tap" style={{ background: 'rgba(143,166,133,0.06)', border: '1px dashed rgba(143,166,133,0.25)' }}>
                        <FiTag size={14} style={{ color: '#8FA685' }} />
                        <p className="text-[11px] flex-1 text-left" style={{ color: '#6B7B63' }}>
                          ¿Primera vez? Aplica tu clase de prueba a <strong>${selectedType.trialPrice}</strong>
                        </p>
                      </button>
                    )}

                    <div className="rounded-2xl p-3 mb-4" style={{ background: 'white', border: '1px solid rgba(0,0,0,0.06)' }}>
                      <p className="text-[11px] font-semibold mb-2" style={{ color: '#666' }}>Cupón de descuento</p>
                      <div className="flex gap-2">
                        <input
                          value={couponCode}
                          onChange={(event) => {
                            setCouponCode(event.target.value.toUpperCase())
                            setCouponApplied(null)
                          }}
                          placeholder="Ex: BIENVENIDA20"
                          className="flex-1 px-3 py-2.5 rounded-xl text-[12px] outline-none"
                          style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.05)' }}
                        />
                        <button
                          type="button"
                          onClick={handleApplyCoupon}
                          disabled={!couponCode.trim() || couponLoading}
                          className="px-3.5 py-2.5 rounded-xl text-[11px] font-semibold text-white disabled:opacity-60"
                          style={{ background: '#1A1A1A' }}
                        >
                          {couponLoading ? '...' : 'Aplicar'}
                        </button>
                      </div>
                      {couponApplied ? (
                        <p className="text-[11px] mt-2" style={{ color: '#8FA685' }}>
                          Cupón {couponApplied.code} aplicado: -{couponPreview.discountPercent}%
                        </p>
                      ) : null}
                    </div>

                    <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} placeholder="Nota opcional (ej: primera vez, lesión...)" className="w-full p-3.5 rounded-2xl text-[12px] resize-none mb-2" style={{ background: 'white', border: '1px solid rgba(0,0,0,0.06)', outline: 'none' }} />

                    <AnimatePresence>
                      {error && (
                        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-[11px] font-medium text-center mt-1 mb-1" style={{ color: '#C4838E' }}>
                          {error}
                        </motion.p>
                      )}
                    </AnimatePresence>

                    {/* Spacer so last content isn't hidden behind sticky button */}
                    <div className="h-4" />
                  </div>

                  {/* Sticky action button — always visible above tab bar */}
                  <div
                    className="px-6 pt-3 pb-5 flex-shrink-0"
                    style={{
                      background: '#FAF8F5',
                      boxShadow: '0 -12px 20px 4px #FAF8F5',
                    }}
                  >
                    {selectedSlot.spots <= 0 ? (
                      <button onClick={handleJoinWaitlist} disabled={joiningWaitlist} className="w-full py-4 rounded-2xl text-[13px] font-semibold text-white active:scale-[0.97] transition-transform disabled:opacity-60 flex items-center justify-center gap-2" style={{ background: '#875D4A', boxShadow: '0 4px 16px rgba(135,93,74,0.3)' }}>
                        {joiningWaitlist ? <FiLoader size={15} className="animate-spin" /> : 'Entrar en lista de espera'}
                      </button>
                    ) : (
                      <button onClick={handleBook} disabled={booking} className="w-full py-4 rounded-2xl text-[13px] font-semibold text-white active:scale-[0.97] transition-transform disabled:opacity-60 flex items-center justify-center gap-2" style={{ background: '#C19C80', boxShadow: '0 4px 16px rgba(193,156,128,0.3)' }}>
                        {booking ? <FiLoader size={15} className="animate-spin" /> : <>Confirmar Reserva — ${couponPreview.finalPrice}</>}
                      </button>
                    )}
                  </div>
                </>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
