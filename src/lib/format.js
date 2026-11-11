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
  if (hour < 12) return 'Buenos días'
  if (hour < 18) return 'Buenas tardes'
  return 'Buenas noches'
}

export const firstName = (fullName) => (fullName || '').trim().split(/\s+/)[0] || ''

export const initials = (fullName) =>
  (fullName || '').trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() || '').join('') || '·'

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
