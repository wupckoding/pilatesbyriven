/**
 * Data layer for Pilates by Riven
 * All auth + booking operations go through the backend API
 * Schedule + status config remain client-side (static data)
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
      return { total: 0, pending: 0, approved: 0, cancelled: 0, completed: 0, upcoming: 0, todayBookings: [] }
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
}

// ─── SCHEDULE HELPERS ───────────────────────────────────
export const schedule = {
  /** Days the studio operates */
  days: [
    { id: 'martes', label: 'Martes', short: 'Mar', weekday: 2 },
    { id: 'miercoles', label: 'Miércoles', short: 'Mié', weekday: 3 },
    { id: 'jueves', label: 'Jueves', short: 'Jue', weekday: 4 },
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

  /** Get next N available dates (only Mar/Mie/Jue) — includes today if applicable */
  getNextDates(count = 12) {
    const dates = []
    const today = new Date()
    const d = new Date(today)
    // Start from today (not tomorrow) so users can book same-day if it's a class day

    while (dates.length < count) {
      const weekday = d.getDay()
      // 2=Tue, 3=Wed, 4=Thu
      if (weekday === 2 || weekday === 3 || weekday === 4) {
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
      d.setDate(d.getDate() + 1)
    }

    return dates
  },
}

// ─── STATUS HELPERS ─────────────────────────────────────
export const statusConfig = {
  pending:   { label: 'Pendiente', color: '#C19C80', bg: 'rgba(193,156,128,0.1)', icon: '⏳' },
  approved:  { label: 'Aprobada', color: '#8FA685', bg: 'rgba(143,166,133,0.1)', icon: '✅' },
  cancelled: { label: 'Cancelada', color: '#C4838E', bg: 'rgba(196,131,142,0.1)', icon: '❌' },
  completed: { label: 'Completada', color: '#666', bg: 'rgba(0,0,0,0.04)', icon: '✔️' },
}
