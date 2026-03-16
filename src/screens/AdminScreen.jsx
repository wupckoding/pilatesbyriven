import React, { useState, useMemo, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FiCalendar, FiClock, FiUsers, FiCheck, FiX,
  FiRefreshCw, FiPhone, FiMail, FiChevronRight,
  FiAlertCircle, FiCheckCircle, FiSearch, FiMessageCircle
} from 'react-icons/fi'
import { bookings, auth, schedule, statusConfig } from '../utils/data'
import { config } from '../config'

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: (i) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.05, duration: 0.4, ease: [0.25, 0.1, 0.25, 1] },
  }),
}

const classTypeLabels = {
  'semi-grupal': 'Semi-grupal',
  'duo': 'Dúo',
  'privada': 'Privada',
  'mat': 'MAT',
}

export default function AdminScreen() {
  const [tab, setTab] = useState('hoy')
  const [filter, setFilter] = useState('all')
  const [selectedBooking, setSelectedBooking] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)

  // Data state
  const [stats, setStats] = useState({ total: 0, pending: 0, approved: 0, cancelled: 0, completed: 0, upcoming: 0, todayBookings: [] })
  const [allBookings, setAllBookings] = useState([])
  const [allUsers, setAllUsers] = useState([])

  const today = new Date().toISOString().split('T')[0]

  // Fetch data from API
  const fetchData = useCallback(async () => {
    setLoading(true)
    const [statsData, bookingsData, usersData] = await Promise.all([
      bookings.getStats(),
      bookings.getAll(),
      auth.getAllUsers(),
    ])
    setStats(statsData)
    setAllBookings(bookingsData)
    setAllUsers(usersData)
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const todayBookings = useMemo(() =>
    allBookings.filter(b => b.date === today && b.status !== 'cancelled')
      .sort((a, b) => a.time.localeCompare(b.time)),
    [allBookings, today]
  )

  const pendingBookings = useMemo(() =>
    allBookings.filter(b => b.status === 'pending'),
    [allBookings]
  )

  const filteredBookings = useMemo(() => {
    let list = filter === 'all' ? allBookings : allBookings.filter(b => b.status === filter)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(b =>
        b.userName?.toLowerCase().includes(q) ||
        b.userEmail?.toLowerCase().includes(q) ||
        b.userPhone?.includes(q)
      )
    }
    return list
  }, [allBookings, filter, searchQuery])

  const filteredClients = useMemo(() => {
    if (!searchQuery.trim()) return allUsers
    const q = searchQuery.toLowerCase()
    return allUsers.filter(u =>
      u.name?.toLowerCase().includes(q) ||
      u.surname?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.phone?.includes(q)
    )
  }, [allUsers, searchQuery])

  const handleAction = async (bookingId, action) => {
    const statusMap = { approve: 'approved', cancel: 'cancelled', complete: 'completed' }
    await bookings.updateStatus(bookingId, statusMap[action])
    setSelectedBooking(null)
    fetchData()
  }

  const handleApproveAll = useCallback(async () => {
    await bookings.approveAll()
    fetchData()
  }, [fetchData])

  const tabs = [
    { id: 'hoy', label: 'Hoy', badge: todayBookings.length || null },
    { id: 'reservas', label: 'Reservas', badge: stats.pending || null },
    { id: 'clientes', label: 'Clientes', badge: null },
  ]

  return (
    <div className="screen-scroll">
      <div className="px-6 pt-5 pb-6">

        {/* ── Header ── */}
        <motion.div custom={0} variants={fadeUp} initial="hidden" animate="show" className="mb-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-display text-[24px] font-bold text-charcoal tracking-tight">Panel Admin</h1>
              <p className="text-[12px] mt-0.5" style={{ color: '#C4AFA2' }}>
                {new Date().toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
            </div>
            <button onClick={fetchData}
              className="w-10 h-10 rounded-xl flex items-center justify-center tap"
              style={{ background: 'rgba(193,156,128,0.08)' }}>
              <FiRefreshCw size={16} style={{ color: '#C19C80' }} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </motion.div>

        {/* ── Pending alert ── */}
        {stats.pending > 0 && tab !== 'reservas' && (
          <motion.div custom={0.5} variants={fadeUp} initial="hidden" animate="show" className="mb-5">
            <button onClick={() => { setTab('reservas'); setFilter('pending') }}
              className="w-full flex items-center gap-3 p-4 rounded-2xl tap"
              style={{ background: 'rgba(193,156,128,0.08)', border: '1px solid rgba(193,156,128,0.12)' }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(193,156,128,0.12)' }}>
                <FiAlertCircle size={18} style={{ color: '#C19C80' }} />
              </div>
              <div className="flex-1 text-left">
                <p className="font-semibold text-[13px] text-charcoal">
                  {stats.pending} reserva{stats.pending > 1 ? 's' : ''} pendiente{stats.pending > 1 ? 's' : ''}
                </p>
                <p className="text-[11px]" style={{ color: '#C4AFA2' }}>Toca para revisar y aprobar</p>
              </div>
              <FiChevronRight size={16} style={{ color: '#C19C80' }} />
            </button>
          </motion.div>
        )}

        {/* ── Tab switcher ── */}
        <motion.div custom={1} variants={fadeUp} initial="hidden" animate="show" className="mb-5">
          <div className="flex gap-1 p-1 rounded-2xl" style={{ background: 'rgba(0,0,0,0.03)' }}>
            {tabs.map(t => (
              <button key={t.id} onClick={() => { setTab(t.id); setFilter('all'); setSearchQuery('') }}
                className={`relative flex-1 py-2.5 rounded-xl text-[12px] font-semibold transition-all duration-300 ${
                  tab === t.id ? 'bg-white text-charcoal shadow-card' : 'text-charcoal/30'
                }`}>
                {t.label}
                {t.badge && (
                  <span className="absolute -top-1 -right-0.5 w-5 h-5 rounded-full text-[9px] font-bold flex items-center justify-center text-white"
                    style={{ background: '#C19C80' }}>
                    {t.badge > 9 ? '9+' : t.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </motion.div>

        <AnimatePresence mode="wait">
          {/* ════════════ HOY ════════════ */}
          {tab === 'hoy' && (
            <motion.div key="hoy"
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.2 }}>

              {/* Stats row */}
              <div className="grid grid-cols-4 gap-2 mb-6">
                {[
                  { label: 'Total', value: stats.total, color: '#666' },
                  { label: 'Pendientes', value: stats.pending, color: '#C19C80' },
                  { label: 'Aprobadas', value: stats.approved, color: '#8FA685' },
                  { label: 'Clientes', value: allUsers.length, color: '#C4838E' },
                ].map(s => (
                  <div key={s.label} className="rounded-2xl py-3 text-center"
                    style={{ background: 'white', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                    <p className="font-display text-[20px] font-bold" style={{ color: s.color }}>{s.value}</p>
                    <p className="text-[9px] font-semibold uppercase tracking-wider mt-0.5" style={{ color: '#C4AFA2' }}>{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Today's timeline */}
              <p className="section-label">Clases de Hoy</p>
              {todayBookings.length === 0 ? (
                <div className="text-center py-10 rounded-2xl" style={{ background: 'rgba(0,0,0,0.02)' }}>
                  <FiCalendar size={28} className="mx-auto mb-3" style={{ color: '#C4AFA2' }} />
                  <p className="text-[13px] font-medium text-charcoal/30">No hay clases para hoy</p>
                  <p className="text-[11px] mt-1" style={{ color: '#C4AFA2' }}>Las reservas aparecerán aquí</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {/* Group by time slot */}
                  {['07:00', '18:00'].map(timeSlot => {
                    const slotBookings = todayBookings.filter(b => b.time === timeSlot)
                    if (slotBookings.length === 0) return null
                    const timeLabel = timeSlot === '07:00' ? '7:00 AM' : '6:00 PM'
                    return (
                      <div key={timeSlot}>
                        <div className="flex items-center gap-2 mb-2 mt-1">
                          <div className={`w-2 h-2 rounded-full ${timeSlot === '07:00' ? 'bg-gold' : 'bg-rose'}`} />
                          <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: timeSlot === '07:00' ? '#C19C80' : '#C4838E' }}>
                            {timeLabel}
                          </span>
                          <div className="flex-1 h-px" style={{ background: 'rgba(0,0,0,0.04)' }} />
                          <span className="text-[10px] font-medium" style={{ color: '#C4AFA2' }}>
                            {slotBookings.length} persona{slotBookings.length > 1 ? 's' : ''}
                          </span>
                        </div>
                        <div className="space-y-1.5">
                          {slotBookings.map(b => {
                            const s = statusConfig[b.status]
                            return (
                              <div key={b.id} onClick={() => setSelectedBooking(b.id)}
                                className="flex items-center gap-3 p-3.5 rounded-2xl tap bg-white"
                                style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                                <div className="w-10 h-10 rounded-xl bg-charcoal flex items-center justify-center flex-shrink-0">
                                  <span className="text-cream font-display font-bold text-sm">
                                    {b.userName?.[0]?.toUpperCase() || '?'}
                                  </span>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-semibold text-[13px] text-charcoal truncate">{b.userName}</p>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <p className="text-[10px]" style={{ color: '#C4AFA2' }}>
                                      {classTypeLabels[b.classType]}
                                    </p>
                                    {b.userPhone && (
                                      <p className="text-[10px] flex items-center gap-0.5" style={{ color: '#C4AFA2' }}>
                                        <FiPhone size={8} /> {b.userPhone}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  {b.userPhone && (
                                    <button onClick={(e) => { e.stopPropagation(); window.open(`https://wa.me/${b.userPhone.replace(/\D/g, '')}`, '_blank') }}
                                      className="w-8 h-8 rounded-lg flex items-center justify-center"
                                      style={{ background: 'rgba(37,211,102,0.08)' }}>
                                      <FiMessageCircle size={13} style={{ color: '#25D366' }} />
                                    </button>
                                  )}
                                  <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full"
                                    style={{ color: s.color, background: s.bg }}>
                                    {s.label}
                                  </span>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Upcoming this week */}
              {(() => {
                const upcoming = allBookings.filter(b =>
                  b.date > today && b.status !== 'cancelled'
                ).sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)).slice(0, 5)
                if (upcoming.length === 0) return null
                return (
                  <div className="mt-6">
                    <p className="section-label">Próximas Reservas</p>
                    <div className="space-y-1.5">
                      {upcoming.map(b => {
                        const s = statusConfig[b.status]
                        const dateStr = new Date(b.date + 'T12:00:00').toLocaleDateString('es-CR', { weekday: 'short', day: 'numeric', month: 'short' })
                        const timeStr = b.time === '07:00' ? '7 AM' : '6 PM'
                        return (
                          <div key={b.id} onClick={() => setSelectedBooking(b.id)}
                            className="flex items-center gap-3 p-3.5 rounded-2xl tap bg-white"
                            style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                            <div className="w-10 h-10 rounded-xl flex flex-col items-center justify-center flex-shrink-0"
                              style={{ background: 'rgba(193,156,128,0.06)' }}>
                              <span className="text-[9px] font-bold uppercase" style={{ color: '#C19C80' }}>
                                {dateStr.split(' ')[0]}
                              </span>
                              <span className="text-[10px] font-bold text-charcoal">
                                {dateStr.split(' ').slice(1).join(' ')}
                              </span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-[12px] text-charcoal truncate">{b.userName}</p>
                              <p className="text-[10px]" style={{ color: '#C4AFA2' }}>
                                {classTypeLabels[b.classType]} · {timeStr}
                                {b.userPhone ? ` · ${b.userPhone}` : ''}
                              </p>
                            </div>
                            {b.status === 'pending' ? (
                              <div className="flex gap-1.5">
                                <button onClick={(e) => { e.stopPropagation(); handleAction(b.id, 'cancel') }}
                                  className="w-9 h-9 rounded-xl flex items-center justify-center"
                                  style={{ background: 'rgba(196,131,142,0.08)' }}>
                                  <FiX size={15} style={{ color: '#C4838E' }} />
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); handleAction(b.id, 'approve') }}
                                  className="w-9 h-9 rounded-xl flex items-center justify-center"
                                  style={{ background: 'rgba(143,166,133,0.08)' }}>
                                  <FiCheck size={15} style={{ color: '#8FA685' }} />
                                </button>
                              </div>
                            ) : (
                              <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full"
                                style={{ color: s.color, background: s.bg }}>
                                {s.label}
                              </span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}
            </motion.div>
          )}

          {/* ════════════ RESERVAS ════════════ */}
          {tab === 'reservas' && (
            <motion.div key="reservas"
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.2 }}>

              {/* Search */}
              <div className="relative mb-4">
                <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2" size={15} style={{ color: '#C4AFA2' }} />
                <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Buscar por nombre, email o teléfono..."
                  className="w-full py-3 pl-11 pr-4 rounded-xl text-[13px] outline-none"
                  style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.04)', color: '#333' }}
                />
              </div>

              {/* Filter chips */}
              <div className="flex gap-1.5 mb-5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                {[
                  { id: 'all', label: 'Todas', count: allBookings.length },
                  { id: 'pending', label: 'Pendientes', count: stats.pending, color: '#C19C80' },
                  { id: 'approved', label: 'Aprobadas', count: stats.approved, color: '#8FA685' },
                  { id: 'completed', label: 'Completadas', count: stats.completed, color: '#666' },
                  { id: 'cancelled', label: 'Canceladas', count: stats.cancelled, color: '#C4838E' },
                ].map(f => (
                  <button key={f.id} onClick={() => setFilter(f.id)}
                    className={`flex-shrink-0 px-3.5 py-2 rounded-xl text-[11px] font-semibold transition-all ${
                      filter === f.id
                        ? 'text-white shadow-sm'
                        : 'text-charcoal/35'
                    }`}
                    style={{
                      background: filter === f.id ? (f.color || '#1A1A1A') : 'rgba(0,0,0,0.03)',
                    }}>
                    {f.label} {f.count > 0 ? `(${f.count})` : ''}
                  </button>
                ))}
              </div>

              {/* Bookings list */}
              {pendingBookings.length > 1 && (filter === 'pending' || filter === 'all') && (
                <button onClick={handleApproveAll}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-[12px] font-semibold mb-4 active:scale-[0.97] transition-transform"
                  style={{ background: 'rgba(143,166,133,0.08)', color: '#8FA685' }}>
                  <FiCheckCircle size={14} /> Aprobar todas las pendientes ({pendingBookings.length})
                </button>
              )}
              {filteredBookings.length === 0 ? (
                <div className="text-center py-10 rounded-2xl" style={{ background: 'rgba(0,0,0,0.02)' }}>
                  <p className="text-[13px] text-charcoal/30">No hay reservas</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredBookings.map(b => {
                    const s = statusConfig[b.status]
                    const dateStr = new Date(b.date + 'T12:00:00').toLocaleDateString('es-CR', { weekday: 'short', day: 'numeric', month: 'short' })
                    const timeStr = b.time === '07:00' ? '7 AM' : '6 PM'
                    return (
                      <div key={b.id} onClick={() => setSelectedBooking(b.id)}
                        className="flex items-center gap-3 p-4 rounded-2xl tap bg-white"
                        style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                        <div className="w-11 h-11 rounded-xl bg-charcoal flex items-center justify-center flex-shrink-0">
                          <span className="text-cream font-display font-bold text-sm">{b.userName?.[0]?.toUpperCase() || '?'}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-[13px] text-charcoal truncate">{b.userName}</p>
                          <p className="text-[10px] mt-0.5" style={{ color: '#C4AFA2' }}>
                            {classTypeLabels[b.classType]} · {dateStr} · {timeStr}
                          </p>
                          {b.userPhone && (
                            <p className="text-[10px] mt-0.5 flex items-center gap-1" style={{ color: '#999' }}>
                              <FiPhone size={9} /> {b.userPhone}
                            </p>
                          )}
                        </div>
                        {b.status === 'pending' ? (
                          <div className="flex gap-1.5">
                            <button onClick={(e) => { e.stopPropagation(); handleAction(b.id, 'cancel') }}
                              className="w-10 h-10 rounded-xl flex items-center justify-center tap"
                              style={{ background: 'rgba(196,131,142,0.1)' }}>
                              <FiX size={16} style={{ color: '#C4838E' }} />
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); handleAction(b.id, 'approve') }}
                              className="w-10 h-10 rounded-xl flex items-center justify-center tap"
                              style={{ background: 'rgba(143,166,133,0.1)' }}>
                              <FiCheck size={16} style={{ color: '#8FA685' }} />
                            </button>
                          </div>
                        ) : (
                          <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full"
                            style={{ color: s.color, background: s.bg }}>
                            {s.label}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </motion.div>
          )}

          {/* ════════════ CLIENTES ════════════ */}
          {tab === 'clientes' && (
            <motion.div key="clientes"
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.2 }}>

              {/* Search */}
              <div className="relative mb-5">
                <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2" size={15} style={{ color: '#C4AFA2' }} />
                <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Buscar cliente..."
                  className="w-full py-3 pl-11 pr-4 rounded-xl text-[13px] outline-none"
                  style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.04)', color: '#333' }}
                />
              </div>

              {/* Total clients */}
              <div className="flex items-center gap-3 p-4 rounded-2xl mb-4 bg-white"
                style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: 'rgba(196,131,142,0.08)' }}>
                  <FiUsers size={18} style={{ color: '#C4838E' }} />
                </div>
                <div>
                  <p className="font-display text-[20px] font-bold text-charcoal">{allUsers.length}</p>
                  <p className="text-[10px]" style={{ color: '#C4AFA2' }}>clientes registrados</p>
                </div>
              </div>

              {/* Client list */}
              {filteredClients.length === 0 ? (
                <div className="text-center py-10 rounded-2xl" style={{ background: 'rgba(0,0,0,0.02)' }}>
                  <p className="text-[13px] text-charcoal/30">
                    {searchQuery ? 'No se encontraron clientes' : 'No hay clientes registrados'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredClients.map(u => {
                    const userBookings = allBookings.filter(b => b.userId === u.id)
                    const activeBookings = userBookings.filter(b => b.status !== 'cancelled')
                    return (
                      <div key={u.id} className="p-4 rounded-2xl bg-white"
                        style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-11 rounded-xl bg-charcoal flex items-center justify-center flex-shrink-0">
                            <span className="text-cream font-display font-bold text-sm">
                              {u.name?.[0]?.toUpperCase() || '?'}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-[13px] text-charcoal truncate">
                              {u.name} {u.surname || ''}
                            </p>
                            <p className="text-[10px] truncate flex items-center gap-1" style={{ color: '#C4AFA2' }}>
                              <FiMail size={9} /> {u.email}
                            </p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="font-display text-lg font-bold text-charcoal">{activeBookings.length}</p>
                            <p className="text-[9px]" style={{ color: '#C4AFA2' }}>reservas</p>
                          </div>
                        </div>

                        {/* Contact actions */}
                        {(u.phone || u.email) && (
                          <div className="flex gap-2 mt-3 pt-3" style={{ borderTop: '1px solid rgba(0,0,0,0.04)' }}>
                            {u.phone && (
                              <button onClick={() => window.open(`https://wa.me/${u.phone.replace(/\D/g, '')}`, '_blank')}
                                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-semibold tap"
                                style={{ background: 'rgba(37,211,102,0.06)', color: '#25D366' }}>
                                <FiMessageCircle size={13} /> WhatsApp
                              </button>
                            )}
                            <button onClick={() => window.open(`mailto:${u.email}`, '_blank')}
                              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-semibold tap"
                              style={{ background: 'rgba(193,156,128,0.06)', color: '#C19C80' }}>
                              <FiMail size={13} /> Email
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ════════════ BOOKING DETAIL MODAL ════════════ */}
        <AnimatePresence>
          {selectedBooking && (() => {
            const b = allBookings.find(bk => bk.id === selectedBooking)
            if (!b) return null
            const s = statusConfig[b.status]

            return (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-end justify-center"
                onClick={() => setSelectedBooking(null)}
              >
                <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
                <motion.div
                  initial={{ y: '100%' }}
                  animate={{ y: 0 }}
                  exit={{ y: '100%' }}
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  className="relative w-full max-w-lg bg-white rounded-t-3xl p-6 pb-10 safe-bottom"
                  onClick={e => e.stopPropagation()}
                >
                  {/* Drag handle */}
                  <div className="w-10 h-1 rounded-full bg-charcoal/10 mx-auto mb-5" />

                  {/* Client header */}
                  <div className="flex items-center gap-3 mb-5">
                    <div className="w-12 h-12 rounded-2xl bg-charcoal flex items-center justify-center">
                      <span className="text-cream font-display font-bold text-lg">{b.userName?.[0]?.toUpperCase()}</span>
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-[15px] text-charcoal">{b.userName}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full"
                          style={{ color: s.color, background: s.bg }}>
                          {s.icon} {s.label}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Details grid */}
                  <div className="grid grid-cols-2 gap-3 mb-5">
                    {[
                      { label: 'Clase', value: classTypeLabels[b.classType], icon: '🧘‍♀️' },
                      { label: 'Precio', value: (() => { const ct = schedule.classTypes.find(c => c.id === b.classType); return ct?.price ? `$${ct.price}` : 'Cotizar' })(), icon: '💰' },
                      { label: 'Fecha', value: new Date(b.date + 'T12:00:00').toLocaleDateString('es-CR', { weekday: 'short', day: 'numeric', month: 'short' }), icon: '📅' },
                      { label: 'Hora', value: b.time === '07:00' ? '7:00 AM' : '6:00 PM', icon: '⏰' },
                    ].map(d => (
                      <div key={d.label} className="p-3 rounded-xl" style={{ background: 'rgba(0,0,0,0.02)' }}>
                        <p className="text-[10px] font-medium" style={{ color: '#C4AFA2' }}>{d.icon} {d.label}</p>
                        <p className="text-[13px] font-semibold text-charcoal mt-0.5">{d.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Contact info */}
                  <div className="space-y-2 mb-5">
                    {b.userEmail && (
                      <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'rgba(0,0,0,0.02)' }}>
                        <FiMail size={14} style={{ color: '#C4AFA2' }} />
                        <p className="text-[12px] text-charcoal flex-1">{b.userEmail}</p>
                      </div>
                    )}
                    {b.userPhone && (
                      <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'rgba(0,0,0,0.02)' }}>
                        <FiPhone size={14} style={{ color: '#C4AFA2' }} />
                        <p className="text-[12px] text-charcoal flex-1">{b.userPhone}</p>
                      </div>
                    )}
                    {b.notes && (
                      <div className="p-3 rounded-xl" style={{ background: 'rgba(0,0,0,0.02)' }}>
                        <p className="text-[10px] font-medium" style={{ color: '#C4AFA2' }}>📝 Nota</p>
                        <p className="text-[12px] text-charcoal mt-0.5">{b.notes}</p>
                      </div>
                    )}
                  </div>

                  {/* ── Action buttons (BIG, clear) ── */}
                  {b.status === 'pending' && (
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <button onClick={() => handleAction(b.id, 'cancel')}
                        className="py-4 rounded-2xl text-[14px] font-semibold flex items-center justify-center gap-2 tap"
                        style={{ background: 'rgba(196,131,142,0.1)', color: '#C4838E' }}>
                        <FiX size={18} /> Rechazar
                      </button>
                      <button onClick={() => handleAction(b.id, 'approve')}
                        className="py-4 rounded-2xl text-[14px] font-semibold flex items-center justify-center gap-2 tap"
                        style={{ background: 'rgba(143,166,133,0.1)', color: '#8FA685' }}>
                        <FiCheck size={18} /> Aprobar
                      </button>
                    </div>
                  )}

                  {b.status === 'approved' && (
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <button onClick={() => handleAction(b.id, 'cancel')}
                        className="py-4 rounded-2xl text-[14px] font-semibold flex items-center justify-center gap-2 tap"
                        style={{ background: 'rgba(196,131,142,0.1)', color: '#C4838E' }}>
                        <FiX size={18} /> Cancelar
                      </button>
                      <button onClick={() => handleAction(b.id, 'complete')}
                        className="py-4 rounded-2xl text-[14px] font-semibold flex items-center justify-center gap-2 tap"
                        style={{ background: 'rgba(143,166,133,0.1)', color: '#8FA685' }}>
                        <FiCheck size={18} /> Completar
                      </button>
                    </div>
                  )}

                  {/* WhatsApp */}
                  {b.userPhone && (
                    <button
                      onClick={() => {
                        const msg = b.status === 'approved'
                          ? `¡Hola ${b.userName}! Tu reserva de ${classTypeLabels[b.classType]} ha sido confirmada para el ${new Date(b.date + 'T12:00:00').toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long' })} a las ${b.time === '07:00' ? '7:00 AM' : '6:00 PM'}. ¡Te esperamos! 🧘‍♀️`
                          : `¡Hola ${b.userName}! Te contactamos por tu reserva en Pilates by Riven.`
                        window.open(`https://wa.me/${b.userPhone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`, '_blank')
                      }}
                      className="w-full py-3.5 rounded-2xl text-[13px] font-semibold flex items-center justify-center gap-2 tap"
                      style={{ background: 'rgba(37,211,102,0.08)', color: '#25D366' }}>
                      <FiMessageCircle size={16} /> Contactar por WhatsApp
                    </button>
                  )}
                </motion.div>
              </motion.div>
            )
          })()}
        </AnimatePresence>

      </div>
    </div>
  )
}
