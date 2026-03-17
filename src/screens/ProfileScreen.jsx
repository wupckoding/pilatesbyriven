import React, { useState, useCallback, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FiMapPin, FiPhone, FiClock, FiInstagram, FiHeart, FiMessageCircle, FiChevronRight, FiLogOut, FiMail, FiX, FiCalendar, FiEdit2, FiCheck, FiLoader, FiSmartphone, FiBell, FiRefreshCw } from 'react-icons/fi'
import { QRCodeSVG } from 'qrcode.react'
import { bookings, auth, statusConfig } from '../utils/data'
import { config } from '../config'

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: (i) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.05, duration: 0.4, ease: [0.25, 0.1, 0.25, 1] },
  }),
}

const classTypeLabels = { 'semi-grupal': 'Semi-grupal', 'duo': 'Dúo', 'privada': 'Privada', 'mat': 'MAT' }

export default function ProfileScreen({ user, onLogout, onNavigate, onUserUpdate }) {
  const initial = user?.name?.[0]?.toUpperCase() || 'U'
  const [myBookings, setMyBookings] = useState([])
  const [myWaitlist, setMyWaitlist] = useState([])
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingExtras, setLoadingExtras] = useState(true)
  const [showAllBookings, setShowAllBookings] = useState(false)
  const [cancelingId, setCancelingId] = useState(null)
  const [reschedulingBooking, setReschedulingBooking] = useState(null)
  const [rescheduleForm, setRescheduleForm] = useState({ date: '', time: '07:00' })
  const [rescheduleError, setRescheduleError] = useState('')
  const [rescheduleSaving, setRescheduleSaving] = useState(false)
  const [profileTab, setProfileTab] = useState('overview')
  const [historyFilter, setHistoryFilter] = useState('all')

  const [passBooking, setPassBooking] = useState(null)

  // Profile editing
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({ name: '', surname: '', phone: '', objective: '', profileLevel: 'beginner', restrictions: '' })
  const [editError, setEditError] = useState('')
  const [saving, setSaving] = useState(false)

  const refreshProfileData = useCallback(async () => {
    const [bookingData, waitlistData, notifData] = await Promise.all([
      bookings.getByUser(),
      bookings.getMyWaitlist(),
      bookings.getNotifications(30),
    ])
    setMyBookings(bookingData)
    setMyWaitlist(waitlistData)
    setNotifications(notifData)
  }, [])

  // Fetch bookings from API
  useEffect(() => {
    if (!user?.id) return
    setLoading(true)
    setLoadingExtras(true)
    refreshProfileData().finally(() => {
      setLoading(false)
      setLoadingExtras(false)
    })
  }, [user, refreshProfileData])

  const upcomingBookings = myBookings
    .filter(b => b.date >= new Date().toISOString().split('T')[0] && b.status !== 'cancelled')
    .sort((a, b) => a.date.localeCompare(b.date))

  const pastBookings = myBookings
    .filter(b => b.date < new Date().toISOString().split('T')[0] || b.status === 'cancelled')
    .sort((a, b) => b.date.localeCompare(a.date))

  const totalClasses = myBookings.filter(b => b.status === 'completed').length
  const pendingWaitlist = myWaitlist.filter((w) => w.status === 'pending')
  const latestNotifications = notifications.slice(0, 5)

  const historyBookings = useMemo(() => {
    const today = new Date().toISOString().split('T')[0]
    const sorted = [...myBookings].sort((a, b) => {
      const aKey = `${a.date || ''}_${a.time || ''}`
      const bKey = `${b.date || ''}_${b.time || ''}`
      return bKey.localeCompare(aKey)
    })

    if (historyFilter === 'upcoming') {
      return sorted.filter((b) => b.date >= today && b.status !== 'cancelled')
    }
    if (historyFilter === 'done') {
      return sorted.filter((b) => b.status === 'completed')
    }
    return sorted
  }, [historyFilter, myBookings])

  const handleCancel = useCallback((bookingId) => {
    setCancelingId(bookingId)
  }, [])

  const confirmCancel = useCallback(async () => {
    if (!cancelingId) return
    await bookings.cancel(cancelingId)
    setCancelingId(null)
    await refreshProfileData()
  }, [cancelingId, refreshProfileData])

  const startReschedule = useCallback((booking) => {
    setRescheduleForm({ date: booking.date || '', time: booking.time || '07:00' })
    setRescheduleError('')
    setReschedulingBooking(booking)
  }, [])

  const submitReschedule = useCallback(async () => {
    if (!reschedulingBooking?.id) return
    if (!rescheduleForm.date || !rescheduleForm.time) {
      setRescheduleError('Selecciona fecha y horario')
      return
    }
    setRescheduleSaving(true)
    setRescheduleError('')
    const result = await bookings.rescheduleSelf(reschedulingBooking.id, rescheduleForm.date, rescheduleForm.time)
    setRescheduleSaving(false)
    if (result.error) {
      setRescheduleError(result.error)
      return
    }
    setReschedulingBooking(null)
    await refreshProfileData()
  }, [refreshProfileData, rescheduleForm.date, rescheduleForm.time, reschedulingBooking])

  const startEditing = () => {
    setEditForm({
      name: user?.name || '',
      surname: user?.surname || '',
      phone: user?.phone || '',
      objective: user?.objective || '',
      profileLevel: user?.profileLevel || 'beginner',
      restrictions: user?.restrictions || '',
    })
    setEditError('')
    setEditing(true)
  }

  const saveProfile = async () => {
    if (!editForm.name.trim()) return setEditError('Ingresa tu nombre')
    setSaving(true)
    setEditError('')
    const result = await auth.updateUser({
      name: editForm.name.trim(),
      surname: editForm.surname.trim(),
      phone: editForm.phone.trim(),
      objective: editForm.objective.trim(),
      profileLevel: editForm.profileLevel,
      restrictions: editForm.restrictions.trim(),
    })
    setSaving(false)
    if (result.error) return setEditError(result.error)
    onUserUpdate?.(result.user)
    setEditing(false)
  }

  return (
    <div className="screen-scroll">
      <div className="px-6 pt-5 pb-6">

        {/* ── User card ── */}
        <motion.div custom={0} variants={fadeUp} initial="hidden" animate="show" className="mb-6">
          <div className="rounded-3xl p-5 relative overflow-hidden" style={{ background: '#1A1A1A' }}>
            <div className="absolute -top-8 -right-8 w-28 h-28 bg-gold/10 rounded-full blur-3xl" />
            <div className="relative z-10">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-white font-display text-xl font-bold">{initial}</span>
                </div>
                <div className="flex-1 min-w-0">
                  {editing ? (
                    <div className="space-y-2">
                      <input type="text" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                        placeholder="Nombre" className="w-full bg-white/10 text-white text-[14px] rounded-xl px-3 py-2 outline-none placeholder:text-white/20" />
                      <input type="text" value={editForm.surname} onChange={e => setEditForm({ ...editForm, surname: e.target.value })}
                        placeholder="Apellido" className="w-full bg-white/10 text-white text-[14px] rounded-xl px-3 py-2 outline-none placeholder:text-white/20" />
                      <input type="tel" value={editForm.phone} onChange={e => setEditForm({ ...editForm, phone: e.target.value })}
                        placeholder="WhatsApp" className="w-full bg-white/10 text-white text-[14px] rounded-xl px-3 py-2 outline-none placeholder:text-white/20" />
                      <input type="text" value={editForm.objective} onChange={e => setEditForm({ ...editForm, objective: e.target.value })}
                        placeholder="Objetivo (fuerza, movilidad, etc.)" className="w-full bg-white/10 text-white text-[14px] rounded-xl px-3 py-2 outline-none placeholder:text-white/20" />
                      <select value={editForm.profileLevel} onChange={e => setEditForm({ ...editForm, profileLevel: e.target.value })}
                        className="w-full bg-white/10 text-white text-[14px] rounded-xl px-3 py-2 outline-none">
                        <option value="beginner" style={{ color: '#1A1A1A' }}>Principiante</option>
                        <option value="intermediate" style={{ color: '#1A1A1A' }}>Intermedio</option>
                        <option value="advanced" style={{ color: '#1A1A1A' }}>Avanzado</option>
                      </select>
                      <textarea value={editForm.restrictions} onChange={e => setEditForm({ ...editForm, restrictions: e.target.value })}
                        rows={2} placeholder="Restricciones o lesiones a considerar"
                        className="w-full bg-white/10 text-white text-[14px] rounded-xl px-3 py-2 outline-none placeholder:text-white/20 resize-none" />
                      {editError && <p className="text-[11px] text-rose">{editError}</p>}
                      <div className="flex gap-2 pt-1">
                        <button onClick={() => setEditing(false)} className="flex-1 py-2 rounded-xl text-[12px] font-semibold text-white/40 bg-white/5">Cancelar</button>
                        <button onClick={saveProfile} disabled={saving}
                          className="flex-1 py-2 rounded-xl text-[12px] font-semibold text-white flex items-center justify-center gap-1.5 disabled:opacity-50"
                          style={{ background: '#C19C80' }}>
                          {saving ? <FiLoader size={12} className="animate-spin" /> : <><FiCheck size={12} /> Guardar</>}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="font-semibold text-[16px] text-white truncate">{user?.name || 'Usuario'} {user?.surname || ''}</p>
                      <p className="text-[11px] text-white/30 mt-0.5 truncate flex items-center gap-1">
                        <FiMail size={10} /> {user?.email || ''}
                      </p>
                      {user?.phone && (
                        <p className="text-[11px] text-white/30 mt-0.5 truncate flex items-center gap-1">
                          <FiPhone size={10} /> {user.phone}
                        </p>
                      )}
                    </>
                  )}
                </div>
                {!editing && (
                  <button onClick={startEditing} className="w-9 h-9 rounded-xl bg-white/8 flex items-center justify-center flex-shrink-0 tap">
                    <FiEdit2 size={14} className="text-white/40" />
                  </button>
                )}
              </div>

            {/* Mini stats */}
            <div className="flex gap-4 mt-4 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <div>
                <p className="font-display text-[18px] font-bold text-white">{myBookings.length}</p>
                <p className="text-[9px] text-white/25 uppercase tracking-wider font-semibold">Reservas</p>
              </div>
              <div>
                <p className="font-display text-[18px] font-bold text-white">{totalClasses}</p>
                <p className="text-[9px] text-white/25 uppercase tracking-wider font-semibold">Completadas</p>
              </div>
              <div>
                <p className="font-display text-[18px] font-bold text-white">{upcomingBookings.length}</p>
                <p className="text-[9px] text-white/25 uppercase tracking-wider font-semibold">Próximas</p>
              </div>
              <div>
                <p className="font-display text-[18px] font-bold text-white">{pendingWaitlist.length}</p>
                <p className="text-[9px] text-white/25 uppercase tracking-wider font-semibold">Espera</p>
              </div>
            </div>
          </div>
          </div>
        </motion.div>

        <motion.div custom={0.5} variants={fadeUp} initial="hidden" animate="show" className="mb-6">
          <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl" style={{ background: 'rgba(0,0,0,0.03)' }}>
            <button
              onClick={() => setProfileTab('overview')}
              className="py-2.5 rounded-xl text-[12px] font-semibold transition-all"
              style={{
                background: profileTab === 'overview' ? '#1A1A1A' : 'transparent',
                color: profileTab === 'overview' ? '#fff' : '#666',
              }}
            >
              Resumen
            </button>
            <button
              onClick={() => setProfileTab('history')}
              className="py-2.5 rounded-xl text-[12px] font-semibold transition-all"
              style={{
                background: profileTab === 'history' ? '#1A1A1A' : 'transparent',
                color: profileTab === 'history' ? '#fff' : '#666',
              }}
            >
              Historial
            </button>
          </div>
        </motion.div>

        {/* ── Upcoming bookings ── */}
        {profileTab === 'overview' && <motion.div custom={1} variants={fadeUp} initial="hidden" animate="show" className="mb-6">
          <p className="section-label">Próximas Clases</p>
          {loading ? (
            <div className="space-y-2 animate-pulse">
              {[1, 2].map(i => <div key={i} className="h-16 rounded-2xl" style={{ background: 'rgba(0,0,0,0.03)' }} />)}
            </div>
          ) : upcomingBookings.length === 0 ? (
            <div className="text-center py-8 rounded-2xl" style={{ background: 'rgba(0,0,0,0.02)' }}>
              <FiCalendar size={24} className="mx-auto mb-3" style={{ color: '#C4AFA2' }} />
              <p className="text-[13px] font-medium text-charcoal/30">Sin clases agendadas</p>
              <button onClick={() => onNavigate?.('book')}
                className="mt-3 px-5 py-2 rounded-xl text-[12px] font-semibold tap"
                style={{ background: 'rgba(193,156,128,0.08)', color: '#C19C80' }}>
                Agendar clase
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {upcomingBookings.map(b => {
                const s = statusConfig[b.status]
                const dateStr = new Date(b.date + 'T12:00:00').toLocaleDateString('es-CR', { weekday: 'short', day: 'numeric', month: 'short' })
                const timeStr = b.time === '07:00' ? '7:00 AM' : '6:00 PM'
                const canCancel = b.status === 'pending' || b.status === 'approved'

                return (
                  <div key={b.id} className="flex items-center gap-3 p-4 rounded-2xl bg-white"
                    style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: s.bg }}>
                      <span className="text-base">{s.icon}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="font-semibold text-[13px] text-charcoal">
                          {classTypeLabels[b.classType]}
                        </p>
                        <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full"
                          style={{ color: s.color, background: s.bg }}>
                          {s.label}
                        </span>
                      </div>
                      <p className="text-[11px]" style={{ color: '#C4AFA2' }}>{dateStr} · {timeStr}</p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {b.status === 'approved' && (
                        <button onClick={() => setPassBooking(b)}
                          className="px-2.5 py-1.5 rounded-lg flex items-center gap-1 tap"
                          style={{ background: 'rgba(143,166,133,0.1)' }}>
                          <FiSmartphone size={11} style={{ color: '#8FA685' }} />
                          <span className="text-[9px] font-bold" style={{ color: '#8FA685' }}>PASE</span>
                        </button>
                      )}
                      {canCancel && (
                        <button onClick={() => handleCancel(b.id)}
                          className="w-9 h-9 rounded-xl flex items-center justify-center tap"
                          style={{ background: 'rgba(196,131,142,0.08)' }}>
                          <FiX size={15} style={{ color: '#C4838E' }} />
                        </button>
                      )}
                      {canCancel && (
                        <button onClick={() => startReschedule(b)}
                          className="w-9 h-9 rounded-xl flex items-center justify-center tap"
                          style={{ background: 'rgba(193,156,128,0.12)' }}>
                          <FiRefreshCw size={14} style={{ color: '#C19C80' }} />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </motion.div>}

        {profileTab === 'overview' && (
          <motion.div custom={1.5} variants={fadeUp} initial="hidden" animate="show" className="mb-6">
            <p className="section-label">Lista de espera</p>
            <div className="space-y-2">
              {loadingExtras ? (
                <div className="h-16 rounded-2xl animate-pulse" style={{ background: 'rgba(0,0,0,0.03)' }} />
              ) : pendingWaitlist.length === 0 ? (
                <div className="text-center py-5 rounded-2xl" style={{ background: 'rgba(0,0,0,0.02)' }}>
                  <p className="text-[12px] text-charcoal/35">No estás en lista de espera ahora.</p>
                </div>
              ) : (
                pendingWaitlist.slice(0, 3).map((w) => {
                  const dateStr = new Date(w.date + 'T12:00:00').toLocaleDateString('es-CR', { weekday: 'short', day: 'numeric', month: 'short' })
                  return (
                    <div key={w.id} className="p-3.5 rounded-2xl bg-white" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                      <p className="text-[12px] font-semibold text-charcoal">{classTypeLabels[w.classType]} · {w.time === '07:00' ? '7:00 AM' : '6:00 PM'}</p>
                      <p className="text-[10px] mt-0.5" style={{ color: '#C4AFA2' }}>{dateStr}</p>
                      <p className="text-[11px] mt-1.5" style={{ color: '#8FA685' }}>
                        Posición en fila: <span className="font-bold">#{w.position || 1}</span>
                      </p>
                    </div>
                  )
                })
              )}
            </div>
          </motion.div>
        )}

        {profileTab === 'overview' && (
          <motion.div custom={1.8} variants={fadeUp} initial="hidden" animate="show" className="mb-6">
            <p className="section-label">Notificaciones</p>
            <div className="space-y-2">
              {loadingExtras ? (
                <div className="h-16 rounded-2xl animate-pulse" style={{ background: 'rgba(0,0,0,0.03)' }} />
              ) : latestNotifications.length === 0 ? (
                <div className="text-center py-5 rounded-2xl" style={{ background: 'rgba(0,0,0,0.02)' }}>
                  <FiBell size={18} className="mx-auto mb-2" style={{ color: '#C4AFA2' }} />
                  <p className="text-[12px] text-charcoal/35">Aún no hay novedades.</p>
                </div>
              ) : (
                latestNotifications.map((n) => (
                  <div key={n.id} className="flex items-start gap-2.5 p-3 rounded-2xl" style={{ background: 'rgba(0,0,0,0.02)' }}>
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center mt-0.5" style={{ background: 'rgba(193,156,128,0.12)' }}>
                      <FiBell size={13} style={{ color: '#C19C80' }} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[12px] font-semibold text-charcoal">{n.title}</p>
                      <p className="text-[10px] mt-0.5" style={{ color: '#C4AFA2' }}>
                        {classTypeLabels[n.classType]} · {n.date} · {n.time === '07:00' ? '7:00 AM' : '6:00 PM'}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}

        {/* ── Historial (overview) ── */}
        {profileTab === 'overview' && pastBookings.length > 0 && (
          <motion.div custom={2} variants={fadeUp} initial="hidden" animate="show" className="mb-6">
            <button onClick={() => setShowAllBookings(!showAllBookings)}
              className="section-label flex items-center gap-1 cursor-pointer">
              Historial ({pastBookings.length})
              <FiChevronRight size={12} className={`transition-transform ${showAllBookings ? 'rotate-90' : ''}`} />
            </button>
            <AnimatePresence>
              {showAllBookings && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3 }}
                  className="overflow-hidden">
                  <div className="space-y-1.5">
                    {pastBookings.slice(0, 10).map(b => {
                      const s = statusConfig[b.status]
                      const dateStr = new Date(b.date + 'T12:00:00').toLocaleDateString('es-CR', { day: 'numeric', month: 'short' })
                      return (
                        <div key={b.id} className="flex items-center gap-3 p-3 rounded-xl"
                          style={{ background: 'rgba(0,0,0,0.02)' }}>
                          <span className="text-sm">{s.icon}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] font-medium text-charcoal/50">{classTypeLabels[b.classType]}</p>
                            <p className="text-[10px]" style={{ color: '#C4AFA2' }}>{dateStr}</p>
                          </div>
                          <span className="text-[9px] font-semibold" style={{ color: s.color }}>{s.label}</span>
                        </div>
                      )
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {/* ── Dedicated history tab ── */}
        {profileTab === 'history' && (
          <motion.div custom={1} variants={fadeUp} initial="hidden" animate="show" className="mb-6">
            <p className="section-label">Todas tus clases</p>

            <div className="flex gap-2 mb-3">
              {[
                { id: 'all', label: `Todas (${myBookings.length})` },
                { id: 'upcoming', label: `Por hacer (${upcomingBookings.length})` },
                { id: 'done', label: `Hechas (${totalClasses})` },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setHistoryFilter(item.id)}
                  className="px-3 py-2 rounded-xl text-[11px] font-semibold"
                  style={{
                    background: historyFilter === item.id ? '#1A1A1A' : 'rgba(0,0,0,0.04)',
                    color: historyFilter === item.id ? '#fff' : '#666',
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {historyBookings.length === 0 ? (
              <div className="text-center py-8 rounded-2xl" style={{ background: 'rgba(0,0,0,0.02)' }}>
                <FiCalendar size={24} className="mx-auto mb-3" style={{ color: '#C4AFA2' }} />
                <p className="text-[13px] font-medium text-charcoal/30">Sin clases en este filtro</p>
              </div>
            ) : (
              <div className="space-y-2">
                {historyBookings.map((b) => {
                  const s = statusConfig[b.status]
                  const dateStr = new Date(b.date + 'T12:00:00').toLocaleDateString('es-CR', { weekday: 'short', day: 'numeric', month: 'short' })
                  const timeStr = b.time === '07:00' ? '7:00 AM' : '6:00 PM'
                  const canShowPass = b.status === 'approved' || b.status === 'completed'

                  return (
                    <div key={b.id} className="flex items-center gap-3 p-4 rounded-2xl bg-white" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                      <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: s.bg }}>
                        <span className="text-base">{s.icon}</span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="font-semibold text-[13px] text-charcoal">{classTypeLabels[b.classType]}</p>
                          <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full" style={{ color: s.color, background: s.bg }}>
                            {s.label}
                          </span>
                        </div>
                        <p className="text-[11px]" style={{ color: '#C4AFA2' }}>{dateStr} · {timeStr}</p>
                      </div>

                      {canShowPass && (
                        <button
                          onClick={() => setPassBooking(b)}
                          className="px-2.5 py-1.5 rounded-lg flex items-center gap-1 tap flex-shrink-0"
                          style={{ background: 'rgba(143,166,133,0.1)' }}
                        >
                          <FiSmartphone size={11} style={{ color: '#8FA685' }} />
                          <span className="text-[9px] font-bold" style={{ color: '#8FA685' }}>PASE</span>
                        </button>
                      )}

                      {(b.status === 'pending' || b.status === 'approved') && (
                        <button
                          onClick={() => startReschedule(b)}
                          className="px-2.5 py-1.5 rounded-lg flex items-center gap-1 tap flex-shrink-0"
                          style={{ background: 'rgba(193,156,128,0.12)' }}
                        >
                          <FiRefreshCw size={11} style={{ color: '#C19C80' }} />
                          <span className="text-[9px] font-bold" style={{ color: '#C19C80' }}>MOVER</span>
                        </button>
                      )}

                      <button
                        onClick={() => onNavigate?.('book')}
                        className="px-2.5 py-1.5 rounded-lg flex items-center gap-1 tap flex-shrink-0"
                        style={{ background: 'rgba(26,26,26,0.08)' }}
                      >
                        <FiCalendar size={11} style={{ color: '#1A1A1A' }} />
                        <span className="text-[9px] font-bold" style={{ color: '#1A1A1A' }}>REPETIR</span>
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </motion.div>
        )}

        {/* ── Quick links ── */}
        <motion.div custom={3} variants={fadeUp} initial="hidden" animate="show" className="mb-6">
          <p className="section-label">Contacto</p>
          <div className="space-y-2">
            {[
              { icon: FiMessageCircle, label: 'WhatsApp', desc: 'Hablar con el studio', color: '#25D366', bg: 'rgba(37,211,102,0.06)',
                action: () => window.open(`https://wa.me/${config.WHATSAPP_NUMBER}?text=¡Hola! Tengo una consulta.`, '_blank') },
              { icon: FiInstagram, label: 'Instagram', desc: '@pilatesbyriven', color: '#C4838E', bg: 'rgba(196,131,142,0.06)',
                action: () => window.open('https://instagram.com/pilatesbyriven', '_blank') },
              { icon: FiMapPin, label: 'Ubicación', desc: 'Dirección al confirmar tu reserva', color: '#C19C80', bg: 'rgba(193,156,128,0.06)', action: null },
              { icon: FiClock, label: 'Horario', desc: 'Martes, Miércoles y Jueves', color: '#666', bg: 'rgba(0,0,0,0.03)', action: null },
            ].map(item => {
              const Icon = item.icon
              return (
                <button key={item.label} onClick={item.action} disabled={!item.action}
                  className={`w-full flex items-center gap-3 p-3.5 rounded-2xl text-left ${item.action ? 'tap' : ''}`}
                  style={{ background: item.bg }}>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: 'white' }}>
                    <Icon size={16} style={{ color: item.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-[13px] text-charcoal">{item.label}</p>
                    <p className="text-[10px] mt-0.5" style={{ color: '#C4AFA2' }}>{item.desc}</p>
                  </div>
                  {item.action && <FiChevronRight size={14} style={{ color: '#C4AFA2' }} />}
                </button>
              )
            })}
          </div>
        </motion.div>

        {/* ── Logout ── */}
        <motion.div custom={4} variants={fadeUp} initial="hidden" animate="show" className="mb-4">
          <button onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-[12px] font-semibold tap transition-colors"
            style={{ background: 'rgba(196,131,142,0.06)', color: '#C4838E' }}>
            <FiLogOut size={14} /> Cerrar sesión
          </button>
        </motion.div>

        <div className="text-center">
          <p className="text-[10px] flex items-center justify-center gap-1" style={{ color: '#C4AFA2' }}>
            Hecho con <FiHeart size={9} className="text-rose/40" /> Pilates by Riven © {new Date().getFullYear()}
          </p>
        </div>

      </div>

      {/* ── Digital Pass Modal ── */}
      <AnimatePresence>
        {passBooking && (() => {
          const b = passBooking
          const dateObj = new Date(b.date + 'T12:00:00')
          const dayName = dateObj.toLocaleDateString('es-CR', { weekday: 'long' })
          const dateStr = dateObj.toLocaleDateString('es-CR', { day: 'numeric', month: 'long', year: 'numeric' })
          const timeStr = b.time === '07:00' ? '7:00 AM' : '6:00 PM'
          const endTime = b.time === '07:00' ? '8:15 AM' : '7:15 PM'
          const passCode = b.id.toUpperCase().slice(-8)
          const passUrl = `https://pilatesbyriven.com/pass/${b.id}`
          const calendarDate = b.date.replace(/-/g, '')
          const calStartTime = b.time === '07:00' ? 'T070000' : 'T180000'
          const calEndTime = b.time === '07:00' ? 'T081500' : 'T191500'

          const downloadCalendar = () => {
            const icsContent = [
              'BEGIN:VCALENDAR',
              'VERSION:2.0',
              'PRODID:-//Pilates by Riven//ES',
              'BEGIN:VEVENT',
              `DTSTART:${calendarDate}${calStartTime}`,
              `DTEND:${calendarDate}${calEndTime}`,
              `SUMMARY:Pilates ${classTypeLabels[b.classType]} - Pilates by Riven`,
              'DESCRIPTION:Tu clase de Pilates está confirmada. Muestra tu pase digital en la entrada.',
              'LOCATION:Pilates by Riven, Costa Rica',
              `STATUS:CONFIRMED`,
              'END:VEVENT',
              'END:VCALENDAR',
            ].join('\r\n')
            const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `pilates-${b.date}.ics`
            a.click()
            URL.revokeObjectURL(url)
          }

          return (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              onClick={() => setPassBooking(null)}
            >
              <div className="absolute inset-0 bg-black/60 backdrop-blur-md" />
              <motion.div
                initial={{ scale: 0.85, y: 40 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.85, y: 40 }}
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                className="relative w-full max-w-sm"
                onClick={e => e.stopPropagation()}
              >
                {/* Close button */}
                <button onClick={() => setPassBooking(null)}
                  className="absolute -top-3 -right-2 w-8 h-8 rounded-full bg-white/20 backdrop-blur flex items-center justify-center z-20">
                  <FiX size={16} className="text-white" />
                </button>

                {/* Pass Card */}
                <div className="rounded-3xl overflow-hidden shadow-2xl" style={{ background: '#1A1A1A' }}>
                  {/* Header strip */}
                  <div className="relative px-6 pt-6 pb-4" style={{ background: 'linear-gradient(135deg, #C19C80 0%, #A67D64 100%)' }}>
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
                    <div className="relative z-10">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                            <span className="text-white text-sm font-bold">PbR</span>
                          </div>
                          <div>
                            <p className="text-white text-[13px] font-bold tracking-wide">PILATES BY RIVEN</p>
                            <p className="text-white/60 text-[9px]">Costa Rica</p>
                          </div>
                        </div>
                        <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-white/20 text-white">
                          CONFIRMADA
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Notch connector */}
                  <div className="relative h-5 flex items-center" style={{ background: '#1A1A1A' }}>
                    <div className="absolute -left-3 w-6 h-6 rounded-full" style={{ background: 'rgba(0,0,0,0.6)' }} />
                    <div className="absolute -right-3 w-6 h-6 rounded-full" style={{ background: 'rgba(0,0,0,0.6)' }} />
                    <div className="flex-1 mx-5 border-t-2 border-dashed border-white/10" />
                  </div>

                  {/* Body */}
                  <div className="px-6 pb-6 relative">
                    <div className="absolute -bottom-16 -right-16 w-40 h-40 bg-gold/5 rounded-full blur-3xl" />

                    {/* Class info */}
                    <div className="mb-4 relative z-10">
                      <p className="text-white/30 text-[9px] font-bold uppercase tracking-[0.2em] mb-1">Clase</p>
                      <p className="text-white font-display text-[22px] font-bold">{classTypeLabels[b.classType]}</p>
                    </div>

                    {/* Details grid */}
                    <div className="grid grid-cols-2 gap-3 mb-5 relative z-10">
                      <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.05)' }}>
                        <p className="text-white/25 text-[9px] font-bold uppercase tracking-wider mb-0.5">Fecha</p>
                        <p className="text-white text-[13px] font-semibold capitalize">{dayName}</p>
                        <p className="text-white/50 text-[11px]">{dateStr}</p>
                      </div>
                      <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.05)' }}>
                        <p className="text-white/25 text-[9px] font-bold uppercase tracking-wider mb-0.5">Horario</p>
                        <p className="text-white text-[13px] font-semibold">{timeStr}</p>
                        <p className="text-white/50 text-[11px]">hasta {endTime}</p>
                      </div>
                      <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.05)' }}>
                        <p className="text-white/25 text-[9px] font-bold uppercase tracking-wider mb-0.5">Cliente</p>
                        <p className="text-white text-[13px] font-semibold truncate">{user?.name} {user?.surname || ''}</p>
                      </div>
                      <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.05)' }}>
                        <p className="text-white/25 text-[9px] font-bold uppercase tracking-wider mb-0.5">C{'ó'}digo</p>
                        <p className="text-white text-[13px] font-mono font-bold tracking-wider">{passCode}</p>
                      </div>
                    </div>

                    {/* QR Code */}
                    <div className="flex flex-col items-center mb-5 relative z-10">
                      <div className="bg-white rounded-2xl p-4 mb-2 shadow-lg">
                        <QRCodeSVG
                          value={passUrl}
                          size={140}
                          level="M"
                          bgColor="#ffffff"
                          fgColor="#1A1A1A"
                          style={{ display: 'block' }}
                        />
                      </div>
                      <p className="text-white/20 text-[10px] font-medium">Muestra este c{'ó'}digo en la entrada</p>
                    </div>

                    {/* Action buttons */}
                    <div className="space-y-2.5 relative z-10">
                      {/* Save QR hint */}
                      <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.05)' }}>
                        <span className="text-[16px]">{'\u{1F4F1}'}</span>
                        <p className="text-white/40 text-[11px] leading-snug">
                          Haz <span className="text-white/70 font-semibold">captura de pantalla</span> o mant{'é'}n presionado el QR para guardar la imagen y mostrarlo en la entrada.
                        </p>
                      </div>

                      {/* Calendar + WhatsApp row */}
                      <div className="flex flex-wrap gap-2">
                        <button onClick={downloadCalendar}
                          className="flex-1 min-w-0 py-3 rounded-xl text-[11px] font-semibold flex items-center justify-center gap-1.5 tap"
                          style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}>
                          <FiCalendar size={12} /> Calendario
                        </button>
                        <button onClick={() => window.open(`https://wa.me/${config.WHATSAPP_NUMBER}?text=${encodeURIComponent(`¡Hola! Mi código de reserva es ${passCode} para el ${dateStr} a las ${timeStr}.`)}`, '_blank')}
                          className="flex-1 min-w-0 py-3 rounded-xl text-[12px] font-semibold flex items-center justify-center gap-2 tap"
                          style={{ background: 'rgba(37,211,102,0.08)', color: '#25D366' }}>
                          <FiMessageCircle size={14} /> WhatsApp
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Hint */}
                <div className="mt-3 text-center">
                  <p className="text-white/25 text-[10px]">
                    Tu pase digital con QR para la entrada
                  </p>
                </div>
              </motion.div>
            </motion.div>
          )
        })()}
      </AnimatePresence>

      {/* ── Cancel confirmation sheet ── */}
      <AnimatePresence>
        {reschedulingBooking && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.35)' }}
              onClick={() => setReschedulingBooking(null)} />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl px-6 pt-5 pb-8"
              style={{ background: '#FAF8F5' }}>
              <div className="w-10 h-1 rounded-full mx-auto mb-5" style={{ background: 'rgba(0,0,0,0.08)' }} />
              <h3 className="font-display text-[18px] font-semibold text-charcoal mb-1 text-center">Reagendar clase</h3>
              <p className="text-[12px] text-center mb-5" style={{ color: '#C4AFA2' }}>
                Elige nueva fecha y horario para tu reserva.
              </p>

              <div className="space-y-3 mb-4">
                <input
                  type="date"
                  value={rescheduleForm.date}
                  onChange={(e) => setRescheduleForm((prev) => ({ ...prev, date: e.target.value }))}
                  className="w-full bg-white text-charcoal text-[14px] rounded-xl px-3 py-3 outline-none"
                />
                <select
                  value={rescheduleForm.time}
                  onChange={(e) => setRescheduleForm((prev) => ({ ...prev, time: e.target.value }))}
                  className="w-full bg-white text-charcoal text-[14px] rounded-xl px-3 py-3 outline-none"
                >
                  <option value="07:00">7:00 AM</option>
                  <option value="18:00">6:00 PM</option>
                </select>
                {rescheduleError && <p className="text-[11px] text-rose">{rescheduleError}</p>}
              </div>

              <div className="flex gap-3">
                <button onClick={() => setReschedulingBooking(null)}
                  className="flex-1 py-3.5 rounded-2xl text-[13px] font-semibold text-charcoal active:scale-[0.97] transition-transform"
                  style={{ background: 'rgba(0,0,0,0.04)' }}>
                  Volver
                </button>
                <button onClick={submitReschedule} disabled={rescheduleSaving}
                  className="flex-1 py-3.5 rounded-2xl text-[13px] font-semibold text-white active:scale-[0.97] transition-transform disabled:opacity-60"
                  style={{ background: '#C19C80' }}>
                  {rescheduleSaving ? 'Guardando...' : 'Confirmar'}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {cancelingId && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.35)' }}
              onClick={() => setCancelingId(null)} />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl px-6 pt-5 pb-8"
              style={{ background: '#FAF8F5' }}>
              <div className="w-10 h-1 rounded-full mx-auto mb-5" style={{ background: 'rgba(0,0,0,0.08)' }} />
              <div className="text-center">
                <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3"
                  style={{ background: 'rgba(196,131,142,0.1)' }}>
                  <FiX size={24} style={{ color: '#C4838E' }} />
                </div>
                <h3 className="font-display text-[18px] font-semibold text-charcoal mb-1">¿Cancelar reserva?</h3>
                <p className="text-[12px] mb-5" style={{ color: '#C4AFA2' }}>
                  Esta acción no se puede deshacer.
                </p>
                <div className="flex gap-3">
                  <button onClick={() => setCancelingId(null)}
                    className="flex-1 py-3.5 rounded-2xl text-[13px] font-semibold text-charcoal active:scale-[0.97] transition-transform"
                    style={{ background: 'rgba(0,0,0,0.04)' }}>
                    Volver
                  </button>
                  <button onClick={confirmCancel}
                    className="flex-1 py-3.5 rounded-2xl text-[13px] font-semibold text-white active:scale-[0.97] transition-transform"
                    style={{ background: '#C4838E' }}>
                    Sí, cancelar
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
