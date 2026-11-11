import { config } from '../config.js'

const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: config.timezone, year: 'numeric', month: '2-digit', day: '2-digit' })

/** Fecha de hoy en Costa Rica como "YYYY-MM-DD" (no depende de la zona del servidor). */
export const todayCR = (date = new Date()) => fmt.format(date)

/** Suma días a una fecha "YYYY-MM-DD". */
export const addDays = (ymd, days) => {
  const d = new Date(`${ymd}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Lunes de la semana de una fecha "YYYY-MM-DD". */
export const weekStart = (ymd) => {
  const d = new Date(`${ymd}T12:00:00Z`)
  const dow = d.getUTCDay()
  return addDays(ymd, dow === 0 ? -6 : 1 - dow)
}

export const formatStudentNumber = (n) => `PR ${String(n).padStart(4, '0')}`
