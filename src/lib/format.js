// Fechas, horas y etiquetas. Todo el calendario del estudio opera en hora de Costa Rica.
export const TZ = 'America/Costa_Rica'

const ymdFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
export const todayCR = (date = new Date()) => ymdFmt.format(date)

// Una fecha "YYYY-MM-DD" se trata como mediodía UTC para que nunca cambie de día al formatear.
const asDate = (ymd) => new Date(`${ymd}T12:00:00Z`)

export const addDays = (ymd, days) => {
  const d = asDate(ymd)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export const weekStart = (ymd) => {
  const dow = asDate(ymd).getUTCDay()
  return addDays(ymd, dow === 0 ? -6 : 1 - dow)
}

export const fmtDate = (ymd, options = { weekday: 'long', day: 'numeric', month: 'long' }) =>
  new Intl.DateTimeFormat('es-CR', { timeZone: 'UTC', ...options }).format(asDate(ymd))

export const capitalize = (text) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text)

/** "Hoy", "Mañana" o "jueves 12 de noviembre". */
export const dayLabel = (ymd) => {
  const today = todayCR()
  if (ymd === today) return 'Hoy'
  if (ymd === addDays(today, 1)) return 'Mañana'
  return capitalize(fmtDate(ymd))
}

/** "18:00" → "6:00 p. m." */
export const fmtTime = (hhmm) => {
  if (!hhmm) return ''
  const [h, m] = hhmm.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'a. m.' : 'p. m.'}`
}

export const fmtDateTime = (iso) =>
  new Intl.DateTimeFormat('es-CR', { timeZone: TZ, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
    .format(new Date(iso))

export const greeting = () => {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false }).format(new Date()))
  if (hour < 5) return 'Buenas noches' // de madrugada todavía es "noche"
  if (hour < 12) return 'Buenos días'
  if (hour < 18) return 'Buenas tardes'
  return 'Buenas noches'
}

export const firstName = (fullName) => (fullName || '').trim().split(/\s+/)[0] || ''

// Solo letras y números (un emoji partido a la mitad se ve como "��").
export const initials = (fullName) =>
  (fullName || '').trim().split(/\s+/)
    .map((p) => Array.from(p).find((ch) => /[\p{L}\p{N}]/u.test(ch)) || '')
    .filter(Boolean).slice(0, 2).join('').toUpperCase() || '·'

/** Enlace de WhatsApp con texto opcional. El número llega en formato E.164. */
export const waLink = (e164, text = '') => {
  const digits = (e164 || '').replace(/\D/g, '')
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}

export const fmtPhone = (e164) => {
  if (!e164) return ''
  const m = e164.match(/^\+506(\d{4})(\d{4})$/)
  return m ? `+506 ${m[1]} ${m[2]}` : e164
}

export const MODALITY = { reformer: 'Reformer', cadillac: 'Cadillac', mat: 'Mat' }
export const KIND = { group: 'Grupo', duo: 'Dúo', private: 'Privada', trial: 'Prueba' }
export const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

export const CLIENT_STATUS = {
  interested: { label: 'Interesada', tone: 'honey' },
  trial_scheduled: { label: 'Prueba agendada', tone: 'clay' },
  active: { label: 'Activa', tone: 'sage' },
  paused: { label: 'En pausa', tone: 'neutral' },
  inactive: { label: 'Inactiva', tone: 'neutral' },
}

export const SOURCE = {
  instagram: 'Instagram', whatsapp: 'WhatsApp', referral: 'Recomendación', form: 'Formulario', app: 'App', other: 'Otro',
}

export const BOOKING_STATUS = {
  pending: { label: 'Por confirmar', tone: 'honey' },
  confirmed: { label: 'Confirmada', tone: 'sage' },
  waitlisted: { label: 'Lista de espera', tone: 'clay' },
  cancelled: { label: 'Cancelada', tone: 'neutral' },
  rescheduled: { label: 'Reprogramada', tone: 'neutral' },
}

export const ATTENDANCE = {
  attended: { label: 'Asistió', tone: 'sage' },
  absent: { label: 'Ausente', tone: 'terracotta' },
  cancelled_notice: { label: 'Canceló con aviso', tone: 'neutral' },
  cancelled_late: { label: 'Canceló tarde', tone: 'honey' },
  made_up: { label: 'Repuso', tone: 'clay' },
}

export const INTAKE = {
  pending: { label: 'Admisión pendiente', tone: 'honey' },
  completed: { label: 'Admisión completa', tone: 'sage' },
  needs_review: { label: 'Requiere revisión', tone: 'terracotta' },
  needs_update: { label: 'Requiere actualización', tone: 'honey' },
}

// ─── Dinero ──────────────────────────────────────────────
const SYMBOL = { USD: 'US$', CRC: '₡' }

/** 8000, 'USD' → "US$80"; 8050 → "US$80.50". Los importes viajan en centavos. */
export const fmtMoney = (cents, currency = 'USD', { sign = false } = {}) => {
  const value = (cents || 0) / 100
  const whole = Number.isInteger(value)
  const text = Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })
  const prefix = value < 0 ? '−' : sign && value > 0 ? '+' : ''
  return `${prefix}${SYMBOL[currency] || ''}${text}`
}

/**
 * Texto → centavos. Acepta punto o coma como decimal y el otro como separador de miles:
 * "80", "80.5", "12,50", "1,200.50", "1.234,50", "40 000". Devuelve null si no es un monto claro.
 */
export const parseMoney = (text) => {
  let s = String(text ?? '').replace(/\s/g, '')
  const comma = s.lastIndexOf(',')
  const dot = s.lastIndexOf('.')
  if (comma >= 0 && dot >= 0) {
    // Los dos signos: el último es el decimal y el otro separa miles.
    const [dec, thou] = comma > dot ? [',', '.'] : ['.', ',']
    if (!new RegExp(`^\\d{1,3}(\\${thou}\\d{3})+\\${dec}\\d{1,2}$`).test(s)) return null
    s = s.split(thou).join('').replace(dec, '.')
  } else if (comma >= 0) {
    // Solo comas: "12,50" es decimal; "1,200" o "1,200,000" son miles.
    if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(',', '.')
    else if (/^\d{1,3}(,\d{3})+$/.test(s)) s = s.split(',').join('')
    else return null
  }
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null
  return Math.round(Number(s) * 100)
}

export const METHOD = { sinpe: 'SINPE', card: 'Tarjeta', cash: 'Efectivo', transfer: 'Transferencia', other: 'Otro' }
export const PRODUCT_KIND = { trial: 'Clase de prueba', single: 'Clase suelta', package: 'Paquete' }

export const PACKAGE_STATUS = {
  pending_payment: { label: 'Por cobrar', tone: 'honey' },
  active: { label: 'Activo', tone: 'sage' },
  expired: { label: 'Vencido', tone: 'neutral' },
  cancelled: { label: 'Cancelado', tone: 'neutral' },
  proposed: { label: 'Propuesto', tone: 'clay' },
}

export const PAYMENT_STATUS = {
  pending: { label: 'Pendiente', tone: 'honey' },
  to_verify: { label: 'Por verificar', tone: 'honey' },
  verified: { label: 'Verificado', tone: 'sage' },
  rejected: { label: 'Rechazado', tone: 'terracotta' },
}

export const EXPENSE_CATEGORIES = ['Alquiler', 'Equipo', 'Servicios', 'Limpieza', 'Marketing', 'Impuestos', 'Otro']

/** Primer y último día del mes de una fecha. */
export const monthRange = (ymd = todayCR()) => {
  const from = `${ymd.slice(0, 7)}-01`
  const d = new Date(`${from}T12:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + 1)
  return { from, to: addDays(d.toISOString().slice(0, 10), -1) }
}

export const newKey = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`)
