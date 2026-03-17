import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  FiCheck,
  FiDollarSign,
  FiEdit2,
  FiMail,
  FiMessageCircle,
  FiPhone,
  FiPlus,
  FiPercent,
  FiRefreshCw,
  FiSearch,
  FiTrash2,
  FiUsers,
} from 'react-icons/fi'
import { auth, bookings, schedule, statusConfig } from '../utils/data'

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: (index) => ({
    opacity: 1,
    y: 0,
    transition: { delay: index * 0.05, duration: 0.4, ease: [0.25, 0.1, 0.25, 1] },
  }),
}

const classTypeLabels = {
  'semi-grupal': 'Semi-grupal',
  'duo': 'Duo',
  'privada': 'Privada',
  'mat': 'MAT',
}

const weekDays = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Lunes' },
  { value: 2, label: 'Martes' },
  { value: 3, label: 'Miercoles' },
  { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' },
  { value: 6, label: 'Sabado' },
]

const emptyScheduleForm = {
  classType: 'semi-grupal',
  specificDate: '',
  dayOfWeek: 1,
  time: '18:00',
  maxSpots: 3,
  price: 25,
  isActive: true,
}

const emptyBlockForm = {
  date: '',
  time: '',
  classType: 'all',
  reason: '',
}

const emptyCouponForm = {
  code: '',
  discountPercent: 10,
  isActive: true,
}

const currency = (value) => `$${Number(value || 0).toFixed(2)}`

export default function AdminScreen() {
  const [tab, setTab] = useState('dashboard')
  const [filter, setFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [savingSchedule, setSavingSchedule] = useState(false)
  const [scheduleMode, setScheduleMode] = useState('date')
  const [scheduleForm, setScheduleForm] = useState(emptyScheduleForm)
  const [scheduleEditingId, setScheduleEditingId] = useState('')

  const [blockForm, setBlockForm] = useState(emptyBlockForm)
  const [savingBlock, setSavingBlock] = useState(false)
  const [couponForm, setCouponForm] = useState(emptyCouponForm)
  const [savingCoupon, setSavingCoupon] = useState(false)
  const [financeRange, setFinanceRange] = useState({
    from: new Date(new Date().setDate(new Date().getDate() - 29)).toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0],
  })

  const [stats, setStats] = useState({
    total: 0,
    totalUsers: 0,
    totalSchedules: 0,
    pending: 0,
    approved: 0,
    cancelled: 0,
    completed: 0,
    noShow: 0,
    upcoming: 0,
    weekBookings: 0,
    monthCompleted: 0,
    waitlistPending: 0,
    todayBookings: [],
    finance: {
      grossRevenue: 0,
      totalPaidBookings: 0,
      averageTicket: 0,
      byClass: [],
      daily: [],
    },
  })

  const [finance, setFinance] = useState({
    fromDate: '',
    toDate: '',
    grossRevenue: 0,
    totalPaidBookings: 0,
    averageTicket: 0,
    byClass: [],
    daily: [],
  })

  const [settings, setSettings] = useState({ cancelWindowHours: 8, noShowGraceMinutes: 20 })
  const [allBookings, setAllBookings] = useState([])
  const [allUsers, setAllUsers] = useState([])
  const [allSchedules, setAllSchedules] = useState([])
  const [coupons, setCoupons] = useState([])
  const [blocks, setBlocks] = useState([])
  const [waitlist, setWaitlist] = useState([])
  const [reminders, setReminders] = useState([])
  const [reminderConfig, setReminderConfig] = useState({ autoEnabled: false, providerReady: false, from: '' })
  const [runningReminders, setRunningReminders] = useState(false)
  const [classHistoryView, setClassHistoryView] = useState('reserved')

  const today = new Date().toISOString().split('T')[0]

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [statsData, bookingsData, usersData, schedulesData, couponsData, settingsData, blocksData, waitlistData, remindersData, reminderConfigData] = await Promise.all([
      bookings.getStats(),
      bookings.getAll(),
      auth.getAllUsers(),
      schedule.getAdminSchedules(),
      bookings.getCoupons(),
      bookings.getPolicySettings(),
      bookings.getBlockedSlots(true),
      bookings.getWaitlist({ status: 'pending' }),
      bookings.getPendingReminders(),
      bookings.getReminderConfig(),
    ])
    setStats(statsData)
    setFinance(statsData.finance || finance)
    setAllBookings(bookingsData)
    setAllUsers(usersData)
    setAllSchedules(schedulesData)
    setCoupons(couponsData)
    setSettings(settingsData)
    setBlocks(blocksData)
    setWaitlist(waitlistData)
    setReminders(remindersData)
    setReminderConfig(reminderConfigData)
    setLoading(false)
  }, [finance])

  const fetchFinance = useCallback(async () => {
    const data = await bookings.getFinance(financeRange.from, financeRange.to)
    setFinance(data)
  }, [financeRange.from, financeRange.to])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    if (tab === 'finance') fetchFinance()
  }, [fetchFinance, tab])

  const todayBookings = useMemo(
    () => allBookings.filter((item) => item.date === today && item.status !== 'cancelled').sort((left, right) => left.time.localeCompare(right.time)),
    [allBookings, today],
  )

  const pendingBookings = useMemo(() => allBookings.filter((item) => item.status === 'pending'), [allBookings])

  const filteredBookings = useMemo(() => {
    let list = filter === 'all' ? allBookings : allBookings.filter((item) => item.status === filter)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      list = list.filter((item) =>
        item.userName?.toLowerCase().includes(query) ||
        item.userEmail?.toLowerCase().includes(query) ||
        item.userPhone?.includes(query)
      )
    }
    return list
  }, [allBookings, filter, searchQuery])

  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return allUsers
    const query = searchQuery.toLowerCase()
    return allUsers.filter((item) =>
      item.name?.toLowerCase().includes(query) ||
      item.surname?.toLowerCase().includes(query) ||
      item.email?.toLowerCase().includes(query) ||
      item.phone?.includes(query)
    )
  }, [allUsers, searchQuery])

  const filteredSchedules = useMemo(() => {
    if (!searchQuery.trim()) return allSchedules
    const query = searchQuery.toLowerCase()
    return allSchedules.filter((item) => {
      const dayLabel = item.specificDate || weekDays.find((day) => day.value === item.dayOfWeek)?.label || ''
      return classTypeLabels[item.classType]?.toLowerCase().includes(query) || dayLabel.toLowerCase().includes(query) || item.time.includes(query)
    })
  }, [allSchedules, searchQuery])

  const filteredCoupons = useMemo(() => {
    if (!searchQuery.trim()) return coupons
    const query = searchQuery.toLowerCase()
    return coupons.filter((item) => item.code?.toLowerCase().includes(query))
  }, [coupons, searchQuery])

  const classHistoryItems = useMemo(() => {
    const sorted = [...allBookings].sort((left, right) => {
      const leftStamp = `${left.date || ''} ${left.time || ''}`
      const rightStamp = `${right.date || ''} ${right.time || ''}`
      return rightStamp.localeCompare(leftStamp)
    })

    if (classHistoryView === 'reserved') {
      return sorted.filter((item) => ['pending', 'approved'].includes(item.status))
    }

    if (classHistoryView === 'completed') {
      return sorted.filter((item) => item.status === 'completed')
    }

    return sorted.filter((item) => ['pending', 'approved'].includes(item.status) && item.date >= today)
  }, [allBookings, classHistoryView, today])

  const handleBookingAction = async (bookingId, nextStatus) => {
    await bookings.updateStatus(bookingId, nextStatus)
    fetchData()
  }

  const handleApproveAll = async () => {
    await bookings.approveAll()
    fetchData()
  }

  const handleScheduleSubmit = async (event) => {
    event.preventDefault()
    setSavingSchedule(true)

    const payload = {
      classType: scheduleForm.classType,
      time: scheduleForm.time,
      maxSpots: Number(scheduleForm.maxSpots),
      price: Number(scheduleForm.price),
      isActive: scheduleForm.isActive,
      specificDate: scheduleMode === 'date' ? scheduleForm.specificDate : null,
      dayOfWeek: scheduleMode === 'weekly' ? Number(scheduleForm.dayOfWeek) : null,
    }

    const result = scheduleEditingId
      ? await schedule.updateAdminSchedule(scheduleEditingId, payload)
      : await schedule.createAdminSchedule(payload)

    setSavingSchedule(false)
    if (result.error) {
      window.alert(result.error)
      return
    }

    setScheduleForm(emptyScheduleForm)
    setScheduleMode('date')
    setScheduleEditingId('')
    fetchData()
  }

  const startEditSchedule = (item) => {
    setScheduleEditingId(item.id)
    setScheduleMode(item.specificDate ? 'date' : 'weekly')
    setScheduleForm({
      classType: item.classType,
      specificDate: item.specificDate || '',
      dayOfWeek: item.dayOfWeek ?? 1,
      time: item.time,
      maxSpots: item.maxSpots,
      price: item.price,
      isActive: item.isActive,
    })
  }

  const cancelEditSchedule = () => {
    setScheduleEditingId('')
    setScheduleForm(emptyScheduleForm)
    setScheduleMode('date')
  }

  const handleDeleteSchedule = async (scheduleId) => {
    const result = await schedule.deleteAdminSchedule(scheduleId)
    if (result.error) {
      window.alert(result.error)
      return
    }
    fetchData()
  }

  const toggleScheduleActive = async (scheduleItem) => {
    const result = await schedule.updateAdminSchedule(scheduleItem.id, { isActive: !scheduleItem.isActive })
    if (result.error) {
      window.alert(result.error)
      return
    }
    fetchData()
  }

  const handleCreateBlock = async (event) => {
    event.preventDefault()
    setSavingBlock(true)
    const result = await bookings.createBlockedSlot({
      date: blockForm.date,
      time: blockForm.time || null,
      classType: blockForm.classType === 'all' ? null : blockForm.classType,
      reason: blockForm.reason,
      isActive: true,
    })
    setSavingBlock(false)
    if (result.error) {
      window.alert(result.error)
      return
    }
    setBlockForm(emptyBlockForm)
    fetchData()
  }

  const handleDeleteBlock = async (blockId) => {
    const result = await bookings.deleteBlockedSlot(blockId)
    if (result.error) {
      window.alert(result.error)
      return
    }
    fetchData()
  }

  const handleCreateCoupon = async (event) => {
    event.preventDefault()
    setSavingCoupon(true)
    const result = await bookings.createCoupon({
      code: couponForm.code,
      discountPercent: Number(couponForm.discountPercent),
      isActive: couponForm.isActive,
    })
    setSavingCoupon(false)
    if (result.error) {
      window.alert(result.error)
      return
    }
    setCouponForm(emptyCouponForm)
    fetchData()
  }

  const handleToggleCoupon = async (coupon) => {
    const result = await bookings.updateCoupon(coupon.id, { isActive: !coupon.isActive })
    if (result.error) {
      window.alert(result.error)
      return
    }
    fetchData()
  }

  const handleDeleteCoupon = async (couponId) => {
    const result = await bookings.deleteCoupon(couponId)
    if (result.error) {
      window.alert(result.error)
      return
    }
    fetchData()
  }

  const handlePromoteWaitlist = async (waitlistId) => {
    const result = await bookings.promoteWaitlist(waitlistId)
    if (result.error) {
      window.alert(result.error)
      return
    }
    fetchData()
  }

  const handleCancelWaitlist = async (waitlistId) => {
    const result = await bookings.cancelWaitlist(waitlistId)
    if (result.error) {
      window.alert(result.error)
      return
    }
    fetchData()
  }

  const handleSaveSettings = async () => {
    const result = await bookings.updatePolicySettings(settings)
    if (result.error) {
      window.alert(result.error)
      return
    }
    setSettings(result.settings)
    window.alert('Politicas guardadas')
  }

  const handleRunRemindersNow = async () => {
    setRunningReminders(true)
    const result = await bookings.runAutomaticReminders()
    setRunningReminders(false)
    if (result.error) {
      window.alert(result.error)
      return
    }
    window.alert(`Recordatorios enviados: 24h ${result.sent24}, 2h ${result.sent2}`)
    fetchData()
  }

  const tabs = [
    { id: 'dashboard', label: 'Resumen', badge: null },
    { id: 'classes', label: 'Clases', badge: null },
    { id: 'finance', label: 'Finanzas', badge: null },
    { id: 'bookings', label: 'Reservas', badge: stats.pending || null },
    { id: 'schedules', label: 'Horarios', badge: stats.totalSchedules || null },
    { id: 'waitlist', label: 'Espera', badge: stats.waitlistPending || null },
    { id: 'clients', label: 'Clientes', badge: null },
  ]

  return (
    <div className="screen-scroll">
      <div className="px-6 pt-5 pb-8">
        <motion.div custom={0} variants={fadeUp} initial="hidden" animate="show" className="mb-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="font-display text-[24px] font-bold text-charcoal tracking-tight">Panel Admin</h1>
              <p className="text-[12px] mt-0.5" style={{ color: '#C4AFA2' }}>
                Operacion completa: horarios, bloqueos, lista de espera y finanzas
              </p>
            </div>
            <button onClick={fetchData} className="w-10 h-10 rounded-xl flex items-center justify-center tap" style={{ background: 'rgba(193,156,128,0.08)' }}>
              <FiRefreshCw size={16} style={{ color: '#C19C80' }} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </motion.div>

        <motion.div custom={1} variants={fadeUp} initial="hidden" animate="show" className="mb-5">
          <div className="flex gap-1 p-1 rounded-2xl overflow-x-auto" style={{ background: 'rgba(0,0,0,0.03)' }}>
            {tabs.map((item) => (
              <button
                key={item.id}
                onClick={() => { setTab(item.id); setSearchQuery(''); setFilter('all') }}
                className={`relative flex-1 py-2.5 px-3 rounded-xl text-[12px] font-semibold transition-all duration-300 ${tab === item.id ? 'bg-white text-charcoal shadow-card' : 'text-charcoal/30'}`}
              >
                {item.label}
                {item.badge ? (
                  <span className="absolute -top-1 -right-0.5 w-5 h-5 rounded-full text-[9px] font-bold flex items-center justify-center text-white" style={{ background: '#C19C80' }}>
                    {item.badge > 9 ? '9+' : item.badge}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </motion.div>

        {tab === 'dashboard' && (
          <motion.div custom={2} variants={fadeUp} initial="hidden" animate="show">
            <div className="grid grid-cols-2 gap-3 mb-5">
              {[
                { label: 'Pendientes', value: stats.pending, color: '#C19C80' },
                { label: 'Espera', value: stats.waitlistPending, color: '#875D4A' },
                { label: 'No show', value: stats.noShow, color: '#C4838E' },
                { label: 'Ingresos mes', value: currency(stats.finance?.grossRevenue || 0), color: '#8FA685' },
              ].map((item) => (
                <div key={item.label} className="rounded-3xl p-4 bg-white" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                  <p className="text-[10px] uppercase font-bold tracking-[0.12em] mb-2" style={{ color: '#C4AFA2' }}>{item.label}</p>
                  <p className="font-display text-[24px]" style={{ color: item.color }}>{item.value}</p>
                </div>
              ))}
            </div>

            <div className="rounded-3xl p-4 bg-white mb-5" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <p className="section-label mb-3">Politicas operativas</p>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <p className="text-[11px] mb-1" style={{ color: '#C4AFA2' }}>Cancelacion (horas)</p>
                  <input type="number" min="0" max="72" value={settings.cancelWindowHours} onChange={(event) => setSettings((current) => ({ ...current, cancelWindowHours: Number(event.target.value) }))} className="input-field" />
                </div>
                <div>
                  <p className="text-[11px] mb-1" style={{ color: '#C4AFA2' }}>No-show (minutos)</p>
                  <input type="number" min="0" max="180" value={settings.noShowGraceMinutes} onChange={(event) => setSettings((current) => ({ ...current, noShowGraceMinutes: Number(event.target.value) }))} className="input-field" />
                </div>
              </div>
              <button onClick={handleSaveSettings} className="w-full py-3 rounded-2xl text-[12px] font-semibold tap" style={{ background: 'rgba(143,166,133,0.12)', color: '#5F7756' }}>
                Guardar politicas
              </button>
            </div>

            <p className="section-label">Clases de hoy</p>
            <div className="space-y-2">
              {todayBookings.length === 0 ? (
                <div className="rounded-3xl p-5 bg-white text-center" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                  <p className="font-semibold text-charcoal">Sin clases para hoy</p>
                </div>
              ) : todayBookings.map((item) => {
                const status = statusConfig[item.status]
                return (
                  <div key={item.id} className="rounded-3xl p-4 bg-white" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-[14px] text-charcoal">{item.userName}</p>
                        <p className="text-[11px] mt-1" style={{ color: '#C4AFA2' }}>
                          {classTypeLabels[item.classType]} · {schedule.formatTimeLabel(item.time)}
                        </p>
                      </div>
                      <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full" style={{ color: status.color, background: status.bg }}>
                        {item.isNoShow ? 'No show' : status.label}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </motion.div>
        )}

        {tab === 'finance' && (
          <motion.div custom={2} variants={fadeUp} initial="hidden" animate="show">
            <div className="rounded-3xl p-4 bg-white mb-4" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <p className="section-label mb-3">Rango</p>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <input type="date" value={financeRange.from} onChange={(event) => setFinanceRange((current) => ({ ...current, from: event.target.value }))} className="input-field" />
                <input type="date" value={financeRange.to} onChange={(event) => setFinanceRange((current) => ({ ...current, to: event.target.value }))} className="input-field" />
              </div>
              <button onClick={fetchFinance} className="w-full py-3 rounded-2xl text-[12px] font-semibold tap" style={{ background: '#1A1A1A', color: '#fff' }}>
                Actualizar dashboard financiero
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="rounded-3xl p-4 bg-white" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                <p className="text-[10px] uppercase font-bold tracking-[0.12em]" style={{ color: '#C4AFA2' }}>Ingresos</p>
                <p className="font-display text-[24px] mt-2" style={{ color: '#8FA685' }}>{currency(finance.grossRevenue)}</p>
              </div>
              <div className="rounded-3xl p-4 bg-white" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                <p className="text-[10px] uppercase font-bold tracking-[0.12em]" style={{ color: '#C4AFA2' }}>Ticket medio</p>
                <p className="font-display text-[24px] mt-2" style={{ color: '#C19C80' }}>{currency(finance.averageTicket)}</p>
              </div>
            </div>

            <div className="rounded-3xl p-4 bg-white mb-4" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <p className="section-label mb-2">Ingresos por clase</p>
              <div className="space-y-2">
                {finance.byClass?.length ? finance.byClass.map((item) => (
                  <div key={item.classType} className="flex items-center justify-between text-[12px] py-2 border-b border-black/5 last:border-b-0">
                    <span className="font-medium text-charcoal">{classTypeLabels[item.classType] || item.classType}</span>
                    <span style={{ color: '#8FA685' }}>{currency(item.revenue)} · {item.count}</span>
                  </div>
                )) : (
                  <p className="text-[12px]" style={{ color: '#C4AFA2' }}>Sin movimientos en el rango.</p>
                )}
              </div>
            </div>

            <div className="rounded-3xl p-4 bg-white" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <p className="section-label mb-2">Ingresos diarios</p>
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {finance.daily?.length ? finance.daily.map((item) => (
                  <div key={item.date} className="flex items-center justify-between text-[12px] py-2 border-b border-black/5 last:border-b-0">
                    <span className="font-medium text-charcoal">{new Date(item.date + 'T12:00:00').toLocaleDateString('es-CR', { day: 'numeric', month: 'short' })}</span>
                    <span style={{ color: '#C19C80' }}>{currency(item.revenue)} · {item.bookings} clases</span>
                  </div>
                )) : (
                  <p className="text-[12px]" style={{ color: '#C4AFA2' }}>Sin movimientos en el rango.</p>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {tab === 'classes' && (
          <motion.div custom={2} variants={fadeUp} initial="hidden" animate="show">
            <div className="rounded-3xl p-4 bg-white mb-4" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <p className="section-label mb-3">Historial de clases</p>
              <div className="flex gap-2">
                {[
                  { id: 'reserved', label: 'Reservadas' },
                  { id: 'completed', label: 'Completadas' },
                  { id: 'upcoming', label: 'Proximas' },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setClassHistoryView(item.id)}
                    className="flex-1 py-2.5 rounded-xl text-[11px] font-semibold tap"
                    style={{
                      background: classHistoryView === item.id ? '#1A1A1A' : 'rgba(0,0,0,0.04)',
                      color: classHistoryView === item.id ? '#fff' : '#555',
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              {classHistoryItems.length === 0 ? (
                <div className="rounded-3xl p-5 bg-white text-center" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                  <p className="font-semibold text-charcoal">Sin clases en esta vista</p>
                </div>
              ) : classHistoryItems.map((item) => {
                const status = statusConfig[item.status]
                return (
                  <div key={item.id} className="rounded-3xl p-4 bg-white" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-[14px] text-charcoal">{item.userName}</p>
                        <p className="text-[11px] mt-1" style={{ color: '#C4AFA2' }}>
                          {classTypeLabels[item.classType] || item.classType} · {new Date(item.date + 'T12:00:00').toLocaleDateString('es-CR', { day: 'numeric', month: 'short' })} · {schedule.formatTimeLabel(item.time)}
                        </p>
                        <p className="text-[11px] mt-1" style={{ color: '#8FA685' }}>Valor {currency(item.priceAtBooking)}</p>
                      </div>
                      <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full" style={{ color: item.isNoShow ? '#875D4A' : status.color, background: item.isNoShow ? 'rgba(135,93,74,0.1)' : status.bg }}>
                        {item.isNoShow ? 'No show' : status.label}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </motion.div>
        )}

        {tab === 'bookings' && (
          <motion.div custom={2} variants={fadeUp} initial="hidden" animate="show">
            <div className="relative mb-4">
              <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2" size={15} style={{ color: '#C4AFA2' }} />
              <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Buscar reservas..." className="w-full py-3 pl-11 pr-4 rounded-xl text-[13px] outline-none" style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.04)', color: '#333' }} />
            </div>

            <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
              {[
                { id: 'all', label: 'Todas', count: allBookings.length, color: '#1A1A1A' },
                { id: 'pending', label: 'Pendientes', count: stats.pending, color: '#C19C80' },
                { id: 'approved', label: 'Aprobadas', count: stats.approved, color: '#8FA685' },
                { id: 'completed', label: 'Completadas', count: stats.completed, color: '#666' },
                { id: 'cancelled', label: 'Canceladas', count: stats.cancelled, color: '#C4838E' },
              ].map((item) => (
                <button key={item.id} onClick={() => setFilter(item.id)} className={`flex-shrink-0 px-3.5 py-2 rounded-xl text-[11px] font-semibold transition-all ${filter === item.id ? 'text-white shadow-sm' : 'text-charcoal/35'}`} style={{ background: filter === item.id ? item.color : 'rgba(0,0,0,0.03)' }}>
                  {item.label} {item.count > 0 ? `(${item.count})` : ''}
                </button>
              ))}
            </div>

            {pendingBookings.length > 1 && (filter === 'pending' || filter === 'all') && (
              <button onClick={handleApproveAll} className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-[12px] font-semibold mb-4 tap" style={{ background: 'rgba(143,166,133,0.08)', color: '#8FA685' }}>
                <FiCheck size={14} /> Aprobar todas ({pendingBookings.length})
              </button>
            )}

            <div className="space-y-2">
              {filteredBookings.map((item) => {
                const status = statusConfig[item.status]
                return (
                  <div key={item.id} className="rounded-3xl p-4 bg-white" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-[14px] text-charcoal">{item.userName}</p>
                        <p className="text-[11px] mt-1" style={{ color: '#C4AFA2' }}>
                          {classTypeLabels[item.classType]} · {new Date(item.date + 'T12:00:00').toLocaleDateString('es-CR', { day: 'numeric', month: 'short' })} · {schedule.formatTimeLabel(item.time)}
                        </p>
                        <p className="text-[11px] mt-1" style={{ color: '#8FA685' }}>Valor: {currency(item.priceAtBooking)}</p>
                        {item.userPhone ? (
                          <p className="text-[10px] mt-1 flex items-center gap-1" style={{ color: '#999' }}>
                            <FiPhone size={9} /> {item.userPhone}
                          </p>
                        ) : null}
                      </div>
                      <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full" style={{ color: item.isNoShow ? '#875D4A' : status.color, background: item.isNoShow ? 'rgba(135,93,74,0.1)' : status.bg }}>
                        {item.isNoShow ? 'No show' : status.label}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mt-4">
                      {item.userPhone ? (
                        <button onClick={() => window.open(`https://wa.me/${item.userPhone.replace(/\D/g, '')}`, '_blank')} className="py-2.5 rounded-2xl text-[11px] font-semibold flex items-center justify-center gap-1.5 tap" style={{ background: 'rgba(37,211,102,0.08)', color: '#25D366' }}>
                          <FiMessageCircle size={13} /> WhatsApp
                        </button>
                      ) : <div />}
                      {item.status === 'pending' ? (
                        <button onClick={() => handleBookingAction(item.id, 'approved')} className="py-2.5 rounded-2xl text-[11px] font-semibold tap" style={{ background: 'rgba(143,166,133,0.1)', color: '#8FA685' }}>
                          Aprobar
                        </button>
                      ) : item.status === 'approved' ? (
                        <button onClick={() => handleBookingAction(item.id, 'completed')} className="py-2.5 rounded-2xl text-[11px] font-semibold tap" style={{ background: 'rgba(143,166,133,0.1)', color: '#8FA685' }}>
                          Completar
                        </button>
                      ) : (
                        <div />
                      )}
                      <button onClick={() => handleBookingAction(item.id, 'no-show')} className="py-2.5 rounded-2xl text-[11px] font-semibold tap" style={{ background: 'rgba(135,93,74,0.12)', color: '#875D4A' }}>
                        No show
                      </button>
                      <button onClick={() => handleBookingAction(item.id, 'cancelled')} className="py-2.5 rounded-2xl text-[11px] font-semibold tap" style={{ background: 'rgba(196,131,142,0.1)', color: '#C4838E' }}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </motion.div>
        )}

        {tab === 'schedules' && (
          <motion.div custom={2} variants={fadeUp} initial="hidden" animate="show">
            <form onSubmit={handleScheduleSubmit} className="rounded-3xl p-5 mb-5 bg-white" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <div className="flex items-center justify-between gap-2 mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(193,156,128,0.08)' }}>
                    {scheduleEditingId ? <FiEdit2 size={16} style={{ color: '#C19C80' }} /> : <FiPlus size={16} style={{ color: '#C19C80' }} />}
                  </div>
                  <div>
                    <p className="font-semibold text-charcoal">{scheduleEditingId ? 'Editar horario' : 'Nuevo horario'}</p>
                    <p className="text-[11px]" style={{ color: '#C4AFA2' }}>Fecha especifica o repeticion semanal</p>
                  </div>
                </div>
                {scheduleEditingId ? (
                  <button type="button" onClick={cancelEditSchedule} className="text-[11px] font-semibold" style={{ color: '#C4838E' }}>
                    Cancelar edicion
                  </button>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <select
                  value={scheduleForm.classType}
                  onChange={(event) => {
                    const nextType = event.target.value
                    const classData = schedule.getClassType(nextType)
                    setScheduleForm((current) => ({
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
                <input type="time" value={scheduleForm.time} onChange={(event) => setScheduleForm((current) => ({ ...current, time: event.target.value }))} className="input-field" />
              </div>

              <div className="flex gap-2 mb-3">
                <button type="button" onClick={() => setScheduleMode('date')} className="flex-1 py-2.5 rounded-2xl text-[11px] font-semibold tap" style={{ background: scheduleMode === 'date' ? '#1A1A1A' : 'rgba(0,0,0,0.03)', color: scheduleMode === 'date' ? '#fff' : '#444' }}>
                  Fecha especifica
                </button>
                <button type="button" onClick={() => setScheduleMode('weekly')} className="flex-1 py-2.5 rounded-2xl text-[11px] font-semibold tap" style={{ background: scheduleMode === 'weekly' ? '#1A1A1A' : 'rgba(0,0,0,0.03)', color: scheduleMode === 'weekly' ? '#fff' : '#444' }}>
                  Repetir semanal
                </button>
              </div>

              {scheduleMode === 'date' ? (
                <input type="date" value={scheduleForm.specificDate} onChange={(event) => setScheduleForm((current) => ({ ...current, specificDate: event.target.value }))} className="input-field mb-3" required />
              ) : (
                <select value={scheduleForm.dayOfWeek} onChange={(event) => setScheduleForm((current) => ({ ...current, dayOfWeek: Number(event.target.value) }))} className="input-field mb-3">
                  {weekDays.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              )}

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="relative">
                  <FiUsers className="absolute left-4 top-1/2 -translate-y-1/2" size={14} style={{ color: '#C4AFA2' }} />
                  <input type="number" min="1" value={scheduleForm.maxSpots} onChange={(event) => setScheduleForm((current) => ({ ...current, maxSpots: event.target.value }))} className="w-full py-3 pl-11 pr-4 rounded-xl text-[13px] outline-none" style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.04)' }} />
                </div>
                <div className="relative">
                  <FiDollarSign className="absolute left-4 top-1/2 -translate-y-1/2" size={14} style={{ color: '#C4AFA2' }} />
                  <input type="number" min="0" step="0.01" value={scheduleForm.price} onChange={(event) => setScheduleForm((current) => ({ ...current, price: event.target.value }))} className="w-full py-3 pl-11 pr-4 rounded-xl text-[13px] outline-none" style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.04)' }} />
                </div>
              </div>

              <button type="submit" disabled={savingSchedule} className="w-full py-3.5 rounded-2xl text-[13px] font-semibold text-white tap disabled:opacity-60" style={{ background: '#1A1A1A' }}>
                {savingSchedule ? 'Guardando...' : scheduleEditingId ? 'Actualizar horario' : 'Guardar horario'}
              </button>
            </form>

            <form onSubmit={handleCreateBlock} className="rounded-3xl p-4 mb-4 bg-white" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <p className="section-label mb-3">Bloqueos y excepciones</p>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <input type="date" value={blockForm.date} onChange={(event) => setBlockForm((current) => ({ ...current, date: event.target.value }))} className="input-field" required />
                <input type="time" value={blockForm.time} onChange={(event) => setBlockForm((current) => ({ ...current, time: event.target.value }))} className="input-field" />
              </div>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <select value={blockForm.classType} onChange={(event) => setBlockForm((current) => ({ ...current, classType: event.target.value }))} className="input-field">
                  <option value="all">Todas las clases</option>
                  {Object.entries(classTypeLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                <input placeholder="Razon" value={blockForm.reason} onChange={(event) => setBlockForm((current) => ({ ...current, reason: event.target.value }))} className="input-field" />
              </div>
              <button type="submit" disabled={savingBlock} className="w-full py-2.5 rounded-2xl text-[12px] font-semibold tap" style={{ background: 'rgba(196,131,142,0.1)', color: '#C4838E' }}>
                {savingBlock ? 'Guardando...' : 'Crear bloqueo'}
              </button>

              <div className="space-y-2 mt-3">
                {blocks.map((blockItem) => (
                  <div key={blockItem.id} className="rounded-2xl p-3" style={{ background: 'rgba(0,0,0,0.02)' }}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[12px] font-semibold text-charcoal">
                        {new Date(blockItem.date + 'T12:00:00').toLocaleDateString('es-CR', { day: 'numeric', month: 'short' })}
                        {blockItem.time ? ` · ${schedule.formatTimeLabel(blockItem.time)}` : ' · Dia completo'}
                      </p>
                      <button type="button" onClick={() => handleDeleteBlock(blockItem.id)} className="text-[11px] font-semibold" style={{ color: '#C4838E' }}>
                        Eliminar
                      </button>
                    </div>
                    <p className="text-[11px] mt-1" style={{ color: '#C4AFA2' }}>{blockItem.reason || 'Sin motivo'}</p>
                  </div>
                ))}
              </div>
            </form>

            <div className="relative mb-4">
              <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2" size={15} style={{ color: '#C4AFA2' }} />
              <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Buscar horarios..." className="w-full py-3 pl-11 pr-4 rounded-xl text-[13px] outline-none" style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.04)', color: '#333' }} />
            </div>

            <div className="space-y-2">
              {filteredSchedules.map((item) => {
                const dayLabel = item.specificDate
                  ? new Date(item.specificDate + 'T12:00:00').toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'short' })
                  : weekDays.find((day) => day.value === item.dayOfWeek)?.label
                return (
                  <div key={item.id} className="rounded-3xl p-4 bg-white" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-[14px] text-charcoal">{classTypeLabels[item.classType]}</p>
                        <p className="text-[11px] mt-1" style={{ color: '#C4AFA2' }}>{dayLabel} · {schedule.formatTimeLabel(item.time)}</p>
                        <p className="text-[11px] mt-1" style={{ color: '#666' }}>{item.maxSpots} cupos · {currency(item.price)}</p>
                      </div>
                      <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full" style={{ color: item.isActive ? '#8FA685' : '#C4838E', background: item.isActive ? 'rgba(143,166,133,0.1)' : 'rgba(196,131,142,0.1)' }}>
                        {item.isActive ? 'Activo' : 'Inactivo'}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 mt-4">
                      <button onClick={() => startEditSchedule(item)} className="py-2.5 rounded-2xl text-[11px] font-semibold tap" style={{ background: 'rgba(0,0,0,0.04)', color: '#444' }}>
                        Editar
                      </button>
                      <button onClick={() => toggleScheduleActive(item)} className="py-2.5 rounded-2xl text-[11px] font-semibold tap" style={{ background: 'rgba(193,156,128,0.08)', color: '#8B6B53' }}>
                        {item.isActive ? 'Desactivar' : 'Activar'}
                      </button>
                      <button onClick={() => handleDeleteSchedule(item.id)} className="py-2.5 rounded-2xl text-[11px] font-semibold flex items-center justify-center gap-1.5 tap" style={{ background: 'rgba(196,131,142,0.1)', color: '#C4838E' }}>
                        <FiTrash2 size={13} /> Eliminar
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </motion.div>
        )}

        {tab === 'waitlist' && (
          <motion.div custom={2} variants={fadeUp} initial="hidden" animate="show">
            <div className="rounded-3xl p-4 bg-white mb-4" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <p className="section-label mb-2">Lista de espera activa</p>
              <div className="space-y-2">
                {waitlist.length === 0 ? (
                  <p className="text-[12px]" style={{ color: '#C4AFA2' }}>Sin clientes en espera.</p>
                ) : waitlist.map((item) => (
                  <div key={item.id} className="rounded-2xl p-3" style={{ background: 'rgba(0,0,0,0.02)' }}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-[13px] text-charcoal">{item.userName}</p>
                        <p className="text-[11px] mt-0.5" style={{ color: '#C4AFA2' }}>
                          {classTypeLabels[item.classType]} · {new Date(item.date + 'T12:00:00').toLocaleDateString('es-CR', { day: 'numeric', month: 'short' })} · {schedule.formatTimeLabel(item.time)}
                        </p>
                      </div>
                      <span className="text-[10px] font-semibold px-2 py-1 rounded-full" style={{ color: '#875D4A', background: 'rgba(135,93,74,0.12)' }}>
                        En cola
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-3">
                      <button onClick={() => handlePromoteWaitlist(item.id)} className="py-2.5 rounded-2xl text-[11px] font-semibold tap" style={{ background: 'rgba(143,166,133,0.1)', color: '#5F7756' }}>
                        Promover a reserva
                      </button>
                      <button onClick={() => handleCancelWaitlist(item.id)} className="py-2.5 rounded-2xl text-[11px] font-semibold tap" style={{ background: 'rgba(196,131,142,0.1)', color: '#C4838E' }}>
                        Quitar de cola
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl p-4 bg-white" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <p className="section-label mb-2">Recordatorios pendientes</p>
              <div className="rounded-2xl p-3 mb-3" style={{ background: 'rgba(0,0,0,0.03)' }}>
                <p className="text-[11px]" style={{ color: '#666' }}>
                  Auto envio: <strong>{reminderConfig.autoEnabled ? 'Activo' : 'Inactivo'}</strong> · Proveedor: <strong>{reminderConfig.providerReady ? 'Conectado' : 'Sin credenciales'}</strong>
                </p>
                <button
                  onClick={handleRunRemindersNow}
                  disabled={runningReminders}
                  className="mt-2 w-full py-2.5 rounded-2xl text-[11px] font-semibold tap disabled:opacity-60"
                  style={{ background: 'rgba(193,156,128,0.12)', color: '#8B6B53' }}
                >
                  {runningReminders ? 'Enviando...' : 'Ejecutar envio automatico ahora'}
                </button>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {reminders.length === 0 ? (
                  <p className="text-[12px]" style={{ color: '#C4AFA2' }}>Sin recordatorios por ahora.</p>
                ) : reminders.slice(0, 20).map((item) => (
                  <div key={item.id} className="rounded-2xl p-3" style={{ background: 'rgba(0,0,0,0.02)' }}>
                    <p className="text-[12px] font-semibold text-charcoal">{item.userName}</p>
                    <p className="text-[11px]" style={{ color: '#C4AFA2' }}>
                      {new Date(item.date + 'T12:00:00').toLocaleDateString('es-CR', { day: 'numeric', month: 'short' })} · {schedule.formatTimeLabel(item.time)}
                    </p>
                    {item.userPhone ? (
                      <button onClick={() => window.open(`https://wa.me/${item.userPhone.replace(/\D/g, '')}`, '_blank')} className="mt-2 w-full py-2 rounded-2xl text-[11px] font-semibold tap" style={{ background: 'rgba(37,211,102,0.08)', color: '#25D366' }}>
                        Enviar WhatsApp
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {tab === 'clients' && (
          <motion.div custom={2} variants={fadeUp} initial="hidden" animate="show">
            <div className="relative mb-4">
              <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2" size={15} style={{ color: '#C4AFA2' }} />
              <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Buscar cliente..." className="w-full py-3 pl-11 pr-4 rounded-xl text-[13px] outline-none" style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.04)', color: '#333' }} />
            </div>

            <div className="space-y-2">
              {filteredUsers.map((item) => {
                const activeBookings = allBookings.filter((bookingItem) => bookingItem.userId === item.id && bookingItem.status !== 'cancelled')
                return (
                  <div key={item.id} className="rounded-3xl p-4 bg-white" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-[14px] text-charcoal">{item.name} {item.surname || ''}</p>
                        <p className="text-[11px] mt-1 flex items-center gap-1" style={{ color: '#C4AFA2' }}>
                          <FiMail size={10} /> {item.email}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-display text-[22px] text-charcoal">{activeBookings.length}</p>
                        <p className="text-[10px]" style={{ color: '#C4AFA2' }}>reservas</p>
                      </div>
                    </div>

                    <div className="flex gap-2 mt-4">
                      {item.phone ? (
                        <button onClick={() => window.open(`https://wa.me/${item.phone.replace(/\D/g, '')}`, '_blank')} className="flex-1 py-2.5 rounded-2xl text-[11px] font-semibold flex items-center justify-center gap-1.5 tap" style={{ background: 'rgba(37,211,102,0.08)', color: '#25D366' }}>
                          <FiMessageCircle size={13} /> WhatsApp
                        </button>
                      ) : null}
                      <button onClick={() => window.open(`mailto:${item.email}`, '_blank')} className="flex-1 py-2.5 rounded-2xl text-[11px] font-semibold flex items-center justify-center gap-1.5 tap" style={{ background: 'rgba(193,156,128,0.08)', color: '#8B6B53' }}>
                        <FiMail size={13} /> Email
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}
