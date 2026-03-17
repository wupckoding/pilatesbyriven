/**
 * Data layer for Pilates by Riven
 * All auth, booking and schedule operations go through the backend API.
 */
import { api, setToken, clearToken, hasToken } from './api'

// ─── AUTH ───────────────────────────────────────────────
export const auth = {
  /** Check if a token exists locally */
  hasSession() {
    return hasToken()
  },

  /** Validate token and get current user from server */
  async getUser() {
    if (!hasToken()) return null
    try {
      const { user } = await api.get('/api/auth/me')
      return user
    } catch {
      clearToken()
      return null
    }
  },

  /** Register a new account */
  async register({ name, surname, email, phone, password }) {
    try {
      const { user, token } = await api.post('/api/auth/register', { name, surname, email, phone, password })
      setToken(token)
      return { user }
    } catch (err) {
      return { error: err.message }
    }
  },

  /** Login with email and password */
  async login(email, password) {
    try {
      const { user, token } = await api.post('/api/auth/login', { email, password })
      setToken(token)
      return { user }
    } catch (err) {
      return { error: err.message }
    }
  },

  /** Update user profile data */
  async updateUser(updates) {
    try {
      const { user } = await api.put('/api/auth/me', updates)
      return { user }
    } catch (err) {
      return { error: err.message }
    }
  },

  /** Logout */
  logout() {
    clearToken()
  },

  /** Get all accounts (admin) */
  async getAllUsers(search = '') {
    try {
      const q = search ? `?search=${encodeURIComponent(search)}` : ''
      const { users } = await api.get(`/api/admin/users${q}`)
      return users
    } catch {
      return []
    }
  },
}

// ─── BOOKINGS ───────────────────────────────────────────
export const bookings = {
  /** Get current user's bookings */
  async getByUser() {
    try {
      const { bookings } = await api.get('/api/bookings')
      return bookings
    } catch {
      return []
    }
  },

  /** Get upcoming bookings for current user */
  async getUpcoming() {
    try {
      const { bookings } = await api.get('/api/bookings/upcoming')
      return bookings
    } catch {
      return []
    }
  },

  /** Check if current user already used trial */
  async hasUsedTrial() {
    try {
      const { hasUsedTrial } = await api.get('/api/bookings/trial')
      return hasUsedTrial
    } catch {
      return false
    }
  },

  /** Get availability counts for a date range */
  async getAvailability(startDate, endDate) {
    try {
      const { counts } = await api.get(`/api/bookings/availability?startDate=${startDate}&endDate=${endDate}`)
      return counts
    } catch {
      return {}
    }
  },

  /** Create a new booking */
  async create({ classType, date, time, notes, equipment, isTrial }) {
    try {
      const { booking } = await api.post('/api/bookings', { classType, date, time, notes, equipment, isTrial })
      return { booking }
    } catch (err) {
      return { error: err.message }
    }
  },

  /** Cancel a booking */
  async cancel(bookingId) {
    try {
      const { booking } = await api.put(`/api/bookings/${bookingId}/cancel`)
      return { booking }
    } catch (err) {
      return { error: err.message }
    }
  },

  async rescheduleSelf(bookingId, date, time) {
    try {
      const { booking } = await api.put(`/api/bookings/${bookingId}/reschedule`, { date, time })
      return { booking }
    } catch (err) {
      return { error: err.message }
    }
  },

  async joinWaitlist({ classType, date, time, notes }) {
    try {
      const { waitlist } = await api.post('/api/waitlist/join', { classType, date, time, notes })
      return { waitlist }
    } catch (err) {
      return { error: err.message }
    }
  },

  async getMyWaitlist() {
    try {
      const { waitlist } = await api.get('/api/waitlist/my')
      return waitlist
    } catch {
      return []
    }
  },

  async getNotifications(limit = 20) {
    try {
      const { notifications } = await api.get(`/api/notifications?limit=${limit}`)
      return notifications
    } catch {
      return []
    }
  },

  // ── Admin methods ──

  /** Get all bookings (admin) with optional filters */
  async getAll(filters = {}) {
    try {
      const params = new URLSearchParams()
      if (filters.status) params.set('status', filters.status)
      if (filters.search) params.set('search', filters.search)
      if (filters.date) params.set('date', filters.date)
      const q = params.toString()
      const { bookings } = await api.get(`/api/admin/bookings${q ? '?' + q : ''}`)
      return bookings
    } catch {
      return []
    }
  },

  /** Update booking status (admin) */
  async updateStatus(bookingId, status, adminNotes = '') {
    try {
      const { booking } = await api.put(`/api/admin/bookings/${bookingId}/status`, { status, adminNotes })
      return { booking }
    } catch (err) {
      return { error: err.message }
    }
  },

  /** Reschedule a booking (admin) */
  async reschedule(bookingId, date, time) {
    try {
      const { booking } = await api.put(`/api/admin/bookings/${bookingId}/reschedule`, { date, time })
      return { booking }
    } catch (err) {
      return { error: err.message }
    }
  },

  /** Get stats (admin) */
  async getStats() {
    try {
      return await api.get('/api/admin/stats')
    } catch {
      return {
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
        finance: {
          grossRevenue: 0,
          totalPaidBookings: 0,
          averageTicket: 0,
          byClass: [],
          daily: [],
        },
        todayBookings: [],
      }
    }
  },

  /** Approve all pending (admin) */
  async approveAll() {
    try {
      const { count } = await api.post('/api/admin/bookings/approve-all')
      return { count }
    } catch (err) {
      return { error: err.message }
    }
  },

  async getFinance(from, to) {
    try {
      const q = new URLSearchParams()
      if (from) q.set('from', from)
      if (to) q.set('to', to)
      return await api.get(`/api/admin/finance${q.toString() ? `?${q.toString()}` : ''}`)
    } catch {
      return {
        fromDate: '',
        toDate: '',
        grossRevenue: 0,
        totalPaidBookings: 0,
        averageTicket: 0,
        byClass: [],
        daily: [],
      }
    }
  },

  async getPolicySettings() {
    try {
      const { settings } = await api.get('/api/admin/settings')
      return settings
    } catch {
      return { cancelWindowHours: 8, noShowGraceMinutes: 20 }
    }
  },

  async updatePolicySettings(payload) {
    try {
      const { settings } = await api.put('/api/admin/settings', payload)
      return { settings }
    } catch (err) {
      return { error: err.message }
    }
  },

  async getBlockedSlots(active) {
    try {
      const q = active === undefined ? '' : `?active=${active ? 'true' : 'false'}`
      const { blocks } = await api.get(`/api/admin/blocks${q}`)
      return blocks
    } catch {
      return []
    }
  },

  async createBlockedSlot(payload) {
    try {
      const { block } = await api.post('/api/admin/blocks', payload)
      return { block }
    } catch (err) {
      return { error: err.message }
    }
  },

  async deleteBlockedSlot(blockId) {
    try {
      await api.delete(`/api/admin/blocks/${blockId}`)
      return { ok: true }
    } catch (err) {
      return { error: err.message }
    }
  },

  async getWaitlist(filters = {}) {
    try {
      const q = new URLSearchParams()
      if (filters.status) q.set('status', filters.status)
      if (filters.date) q.set('date', filters.date)
      const { waitlist } = await api.get(`/api/admin/waitlist${q.toString() ? `?${q.toString()}` : ''}`)
      return waitlist
    } catch {
      return []
    }
  },

  async promoteWaitlist(waitlistId) {
    try {
      const { booking } = await api.post(`/api/admin/waitlist/${waitlistId}/promote`, {})
      return { booking }
    } catch (err) {
      return { error: err.message }
    }
  },

  async cancelWaitlist(waitlistId) {
    try {
      await api.put(`/api/admin/waitlist/${waitlistId}/cancel`, {})
      return { ok: true }
    } catch (err) {
      return { error: err.message }
    }
  },

  async getPendingReminders() {
    try {
      const { reminders } = await api.get('/api/admin/reminders/pending')
      return reminders
    } catch {
      return []
    }
  },

  async getReminderConfig() {
    try {
      return await api.get('/api/admin/reminders/config')
    } catch {
      return { autoEnabled: false, providerReady: false, from: '' }
    }
  },

  async runAutomaticReminders() {
    try {
      return await api.post('/api/admin/reminders/run', {})
    } catch (err) {
      return { error: err.message }
    }
  },
}

// ─── SCHEDULE HELPERS ───────────────────────────────────
export const schedule = {
  /** Days the studio operates */
  days: [
    { id: 'domingo', label: 'Domingo', short: 'Dom', weekday: 0 },
    { id: 'lunes', label: 'Lunes', short: 'Lun', weekday: 1 },
    { id: 'martes', label: 'Martes', short: 'Mar', weekday: 2 },
    { id: 'miercoles', label: 'Miércoles', short: 'Mié', weekday: 3 },
    { id: 'jueves', label: 'Jueves', short: 'Jue', weekday: 4 },
    { id: 'viernes', label: 'Viernes', short: 'Vie', weekday: 5 },
    { id: 'sabado', label: 'Sábado', short: 'Sáb', weekday: 6 },
  ],

  /** Time slots */
  times: [
    { id: '07:00', label: '7:00 AM', period: 'AM' },
    { id: '18:00', label: '6:00 PM', period: 'PM' },
  ],

  /** Class types */
  classTypes: [
    { id: 'semi-grupal', label: 'Semi-grupal', desc: 'Hasta 3 personas · Reformer', price: 25, trialPrice: 15, maxSpots: 3, icon: '🏋️' },
    { id: 'duo', label: 'Dúo', desc: '2 personas · Reformer', price: 30, maxSpots: 2, icon: '👯' },
    { id: 'privada', label: 'Privada', desc: '1 persona · Reformer/Cadillac', price: 60, maxSpots: 1, icon: '🧘‍♀️' },
    { id: 'mat', label: 'MAT Evento', desc: 'Cotización personalizada', price: null, maxSpots: null, icon: '🎉' },
  ],

  getClassType(classTypeId) {
    return this.classTypes.find((item) => item.id === classTypeId) || null
  },

  formatTimeLabel(time) {
    if (!time) return ''
    const [hour, minute] = time.split(':').map(Number)
    const suffix = hour >= 12 ? 'PM' : 'AM'
    const normalizedHour = hour % 12 || 12
    return `${normalizedHour}:${String(minute).padStart(2, '0')} ${suffix}`
  },

  /** Get next N dates starting from today */
  getNextDates(count = 12) {
    const dates = []
    const today = new Date()
    for (let offset = 0; offset < count; offset += 1) {
      const d = new Date(today)
      d.setDate(today.getDate() + offset)
      const weekday = d.getDay()
      const dateStr = d.toISOString().split('T')[0]
      const dayName = this.days.find(day => day.weekday === weekday)
      const isToday = dateStr === today.toISOString().split('T')[0]
      dates.push({
        date: dateStr,
        day: dayName,
        isToday,
        label: isToday ? 'Hoy' : d.toLocaleDateString('es-CR', { day: 'numeric', month: 'short' }),
        fullLabel: isToday
          ? 'Hoy, ' + d.toLocaleDateString('es-CR', { day: 'numeric', month: 'long' })
          : d.toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long' }),
      })
    }
    return dates
  },

  async getAvailable(date, classType = '') {
    try {
      const q = new URLSearchParams({ date })
      if (classType) q.set('classType', classType)
      const { schedules } = await api.get(`/api/schedules/available?${q.toString()}`)
      return schedules
    } catch {
      return []
    }
  },

  async getAdminSchedules(filters = {}) {
    try {
      const q = new URLSearchParams()
      if (filters.classType) q.set('classType', filters.classType)
      if (filters.active !== undefined) q.set('active', String(filters.active))
      const { schedules } = await api.get(`/api/admin/schedules${q.toString() ? `?${q.toString()}` : ''}`)
      return schedules
    } catch {
      return []
    }
  },

  async createAdminSchedule(payload) {
    try {
      const { schedule } = await api.post('/api/admin/schedules', payload)
      return { schedule }
    } catch (err) {
      return { error: err.message }
    }
  },

  async updateAdminSchedule(scheduleId, payload) {
    try {
      const { schedule } = await api.put(`/api/admin/schedules/${scheduleId}`, payload)
      return { schedule }
    } catch (err) {
      return { error: err.message }
    }
  },

  async deleteAdminSchedule(scheduleId) {
    try {
      await api.delete(`/api/admin/schedules/${scheduleId}`)
      return { ok: true }
    } catch (err) {
      return { error: err.message }
    }
  },
}

// ─── STATUS HELPERS ─────────────────────────────────────
export const statusConfig = {
  pending:   { label: 'Pendiente', color: '#C19C80', bg: 'rgba(193,156,128,0.1)', icon: '⏳' },
  approved:  { label: 'Aprobada', color: '#8FA685', bg: 'rgba(143,166,133,0.1)', icon: '✅' },
  cancelled: { label: 'Cancelada', color: '#C4838E', bg: 'rgba(196,131,142,0.1)', icon: '❌' },
  completed: { label: 'Completada', color: '#666', bg: 'rgba(0,0,0,0.04)', icon: '✔️' },
  'no-show': { label: 'No show', color: '#875D4A', bg: 'rgba(135,93,74,0.12)', icon: '⚠️' },
}
