import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { FiRefreshCw } from 'react-icons/fi'
import { auth, bookings, schedule, statusConfig } from '../utils/data'
import AdminBookingsTab from '../components/admin/AdminBookingsTab'
import AdminSchedulesTab from '../components/admin/AdminSchedulesTab'
import AdminWaitlistTab from '../components/admin/AdminWaitlistTab'
import AdminClientsTab from '../components/admin/AdminClientsTab'
import { classTypeLabels, weekDays, currency } from '../components/admin/shared'

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: (index) => ({
    opacity: 1,
    y: 0,
    transition: { delay: index * 0.05, duration: 0.4, ease: [0.25, 0.1, 0.25, 1] },
  }),
}

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
  const [blocks, setBlocks] = useState([])
  const [waitlist, setWaitlist] = useState([])
  const [reminders, setReminders] = useState([])
  const [reminderConfig, setReminderConfig] = useState({ autoEnabled: false, providerReady: false, from: '' })
  const [runningReminders, setRunningReminders] = useState(false)
  const [classHistoryView, setClassHistoryView] = useState('reserved')

  const today = new Date().toISOString().split('T')[0]

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [statsData, bookingsData, usersData, schedulesData, settingsData, blocksData, waitlistData, remindersData, reminderConfigData] = await Promise.all([
      bookings.getStats(),
      bookings.getAll(),
      auth.getAllUsers(),
      schedule.getAdminSchedules(),
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
          <AdminBookingsTab
            fadeUp={fadeUp}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            filter={filter}
            setFilter={setFilter}
            allBookings={allBookings}
            stats={stats}
            pendingBookings={pendingBookings}
            filteredBookings={filteredBookings}
            handleApproveAll={handleApproveAll}
            handleBookingAction={handleBookingAction}
          />
        )}

        {tab === 'schedules' && (
          <AdminSchedulesTab
            fadeUp={fadeUp}
            handleScheduleSubmit={handleScheduleSubmit}
            scheduleEditingId={scheduleEditingId}
            cancelEditSchedule={cancelEditSchedule}
            scheduleForm={scheduleForm}
            setScheduleForm={setScheduleForm}
            scheduleMode={scheduleMode}
            setScheduleMode={setScheduleMode}
            savingSchedule={savingSchedule}
            handleCreateBlock={handleCreateBlock}
            blockForm={blockForm}
            setBlockForm={setBlockForm}
            savingBlock={savingBlock}
            blocks={blocks}
            handleDeleteBlock={handleDeleteBlock}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            filteredSchedules={filteredSchedules}
            startEditSchedule={startEditSchedule}
            toggleScheduleActive={toggleScheduleActive}
            handleDeleteSchedule={handleDeleteSchedule}
          />
        )}

        {tab === 'waitlist' && (
          <AdminWaitlistTab
            fadeUp={fadeUp}
            waitlist={waitlist}
            reminders={reminders}
            reminderConfig={reminderConfig}
            runningReminders={runningReminders}
            handlePromoteWaitlist={handlePromoteWaitlist}
            handleCancelWaitlist={handleCancelWaitlist}
            handleRunRemindersNow={handleRunRemindersNow}
          />
        )}

        {tab === 'clients' && (
          <AdminClientsTab
            fadeUp={fadeUp}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            filteredUsers={filteredUsers}
            allBookings={allBookings}
          />
        )}
      </div>
    </div>
  )
}
