import express from 'express'
import cors from 'cors'
import bcrypt from 'bcryptjs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { createHash } from 'crypto'
import archiver from 'archiver'
import db from './db.js'
import { generateToken, authMiddleware, adminMiddleware } from './auth.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3001

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || ''
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || ''
const TWILIO_WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886'
const REMINDER_AUTO_ENABLED = (process.env.REMINDER_AUTO_ENABLED || 'true') === 'true'

app.use(cors())
app.use(express.json())

// ─── HELPERS ──────────────────────────────────────────
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
const now = () => new Date().toISOString()
const fixTrial = (r) => ({ ...r, isTrial: !!r.isTrial })
const dateToDayOfWeek = (dateStr) => new Date(`${dateStr}T00:00:00`).getDay()
const defaultCapacity = (classType) => classType === 'duo' ? 2 : classType === 'privada' ? 1 : 3
const normalizeSchedule = (r) => ({
  ...r,
  dayOfWeek: r.dayOfWeek === null ? null : Number(r.dayOfWeek),
  maxSpots: Number(r.maxSpots),
  price: Number(r.price),
  isActive: !!r.isActive,
})
const CLASS_TYPE_NAMES = { 'semi-grupal': 'Semi-grupal', 'duo': 'Dúo', 'privada': 'Privada', 'mat': 'MAT' }
const getScheduleForSlot = (date, time, classType) => {
  const byDate = db.prepare(
    `SELECT * FROM schedules
     WHERE isActive = 1 AND classType = ? AND specificDate = ? AND time = ?
     ORDER BY createdAt DESC LIMIT 1`
  ).get(classType, date, time)
  if (byDate) return byDate

  const day = dateToDayOfWeek(date)
  return db.prepare(
    `SELECT * FROM schedules
     WHERE isActive = 1 AND classType = ? AND specificDate IS NULL AND dayOfWeek = ? AND time = ?
     ORDER BY createdAt DESC LIMIT 1`
  ).get(classType, day, time)
}

const getSettingInt = (key, fallback) => {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key)
  if (!row) return fallback
  const parsed = Number(row.value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const getPolicySettings = () => ({
  cancelWindowHours: getSettingInt('cancelWindowHours', 8),
  noShowGraceMinutes: getSettingInt('noShowGraceMinutes', 20),
})

const isBlockedSlot = (date, time, classType) => {
  const block = db.prepare(
    `SELECT id FROM schedule_blocks
     WHERE isActive = 1
       AND date = ?
       AND (time IS NULL OR time = ?)
       AND (classType IS NULL OR classType = ?)
     LIMIT 1`
  ).get(date, time, classType)
  return !!block
}

const getBookingPrice = ({ classType, date, time, isTrial }) => {
  if (isTrial && classType === 'semi-grupal') return 15
  const schedule = getScheduleForSlot(date, time, classType)
  if (schedule) return Number(schedule.price)

  if (classType === 'duo') return 30
  if (classType === 'privada') return 60
  if (classType === 'semi-grupal') return 25
  return 0
}

const promoteWaitlistForSlot = (date, time, classType) => {
  const next = db.prepare(
    `SELECT * FROM waitlist
     WHERE date = ? AND time = ? AND classType = ? AND status = 'pending'
     ORDER BY createdAt ASC
     LIMIT 1`
  ).get(date, time, classType)

  if (!next) return null

  const duplicate = db.prepare(
    `SELECT id FROM bookings
     WHERE userId = ? AND date = ? AND time = ? AND status != 'cancelled'
     LIMIT 1`
  ).get(next.userId, date, time)

  if (duplicate) {
    db.prepare(`UPDATE waitlist SET status = 'cancelled', updatedAt = ? WHERE id = ?`).run(now(), next.id)
    return null
  }

  const priceAtBooking = getBookingPrice({ classType, date, time, isTrial: false })
  const bookingId = uid()
  const ts = now()
  db.prepare(
    `INSERT INTO bookings (id, userId, userName, userPhone, userEmail, classType, date, time, notes, equipment, isTrial, status, createdAt, updatedAt, priceAtBooking)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'approved', ?, ?, ?)`
  ).run(
    bookingId,
    next.userId,
    next.userName,
    next.userPhone || '',
    next.userEmail || '',
    classType,
    date,
    time,
    'Promoted from waitlist',
    'reformer',
    ts,
    ts,
    priceAtBooking,
  )

  db.prepare(`UPDATE waitlist SET status = 'promoted', updatedAt = ? WHERE id = ?`).run(ts, next.id)
  return db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId)
}

const getFinanceSummary = (fromDate, toDate) => {
  const rows = db.prepare(
    `SELECT date, classType, status, COALESCE(priceAtBooking, 0) as priceAtBooking
     FROM bookings
     WHERE date >= ? AND date <= ?`
  ).all(fromDate, toDate)

  const completedRows = rows.filter((item) => item.status === 'completed' || item.status === 'approved')
  const grossRevenue = completedRows.reduce((sum, item) => sum + Number(item.priceAtBooking || 0), 0)
  const byClass = completedRows.reduce((acc, item) => {
    if (!acc[item.classType]) acc[item.classType] = { classType: item.classType, count: 0, revenue: 0 }
    acc[item.classType].count += 1
    acc[item.classType].revenue += Number(item.priceAtBooking || 0)
    return acc
  }, {})

  const daily = completedRows.reduce((acc, item) => {
    if (!acc[item.date]) acc[item.date] = { date: item.date, bookings: 0, revenue: 0 }
    acc[item.date].bookings += 1
    acc[item.date].revenue += Number(item.priceAtBooking || 0)
    return acc
  }, {})

  return {
    grossRevenue,
    totalPaidBookings: completedRows.length,
    averageTicket: completedRows.length ? grossRevenue / completedRows.length : 0,
    byClass: Object.values(byClass).sort((a, b) => b.revenue - a.revenue),
    daily: Object.values(daily).sort((a, b) => a.date.localeCompare(b.date)),
  }
}

const normalizePhoneToE164 = (rawPhone) => {
  const digits = String(rawPhone || '').replace(/\D/g, '')
  if (!digits) return null
  if (digits.length === 8) return `+506${digits}`
  if (digits.startsWith('506') && digits.length === 11) return `+${digits}`
  if (digits.length >= 10 && digits.length <= 15) return `+${digits}`
  return null
}

const canSendWhatsAppReminders = () => Boolean(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_WHATSAPP_FROM)

const sendWhatsAppMessage = async (toPhone, body) => {
  if (!canSendWhatsAppReminders()) {
    return { sent: false, reason: 'missing-config' }
  }

  const normalized = normalizePhoneToE164(toPhone)
  if (!normalized) return { sent: false, reason: 'invalid-phone' }

  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`
  const credentials = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64')
  const form = new URLSearchParams({
    To: `whatsapp:${normalized}`,
    From: TWILIO_WHATSAPP_FROM,
    Body: body,
  })

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form,
  })

  if (!response.ok) {
    const text = await response.text()
    return { sent: false, reason: 'provider-error', detail: text.slice(0, 300) }
  }

  return { sent: true }
}

const buildReminderMessage = (booking, reminderType) => {
  const classLabel = CLASS_TYPE_NAMES[booking.classType] || booking.classType
  const dateLabel = new Date(`${booking.date}T12:00:00`).toLocaleDateString('es-CR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  const timeLabel = booking.time
  const prefix = reminderType === '24h' ? 'Recordatorio 24h' : 'Recordatorio 2h'
  return `${prefix} - Pilates by Riven\n${classLabel}\n${dateLabel} a las ${timeLabel}\nNos vemos en el estudio.`
}

const processAutomaticReminders = async () => {
  const rows = db.prepare(
    `SELECT * FROM bookings
     WHERE status IN ('approved','pending')
       AND date >= date('now','-1 day')
       AND userPhone IS NOT NULL
       AND userPhone != ''`
  ).all()

  let sent24 = 0
  let sent2 = 0
  let failed = 0

  for (const booking of rows) {
    const start = new Date(`${booking.date}T${booking.time}:00`).getTime()
    if (Number.isNaN(start)) continue
    const hoursToStart = (start - Date.now()) / (1000 * 60 * 60)

    const shouldSend24 = !booking.reminder24Sent && hoursToStart <= 24.2 && hoursToStart >= 23.7
    const shouldSend2 = !booking.reminder2Sent && hoursToStart <= 2.2 && hoursToStart >= 1.7
    if (!shouldSend24 && !shouldSend2) continue

    if (shouldSend24) {
      const result = await sendWhatsAppMessage(booking.userPhone, buildReminderMessage(booking, '24h'))
      if (result.sent) {
        db.prepare('UPDATE bookings SET reminder24Sent = 1, updatedAt = ? WHERE id = ?').run(now(), booking.id)
        sent24 += 1
      } else {
        failed += 1
      }
    }

    if (shouldSend2) {
      const result = await sendWhatsAppMessage(booking.userPhone, buildReminderMessage(booking, '2h'))
      if (result.sent) {
        db.prepare('UPDATE bookings SET reminder2Sent = 1, updatedAt = ? WHERE id = ?').run(now(), booking.id)
        sent2 += 1
      } else {
        failed += 1
      }
    }
  }

  return { sent24, sent2, failed, enabled: canSendWhatsAppReminders() }
}

// ─── SEED ADMIN ───────────────────────────────────────
;(() => {
  const admin = db.prepare('SELECT id FROM users WHERE email = ?').get('admin@pilatesbyriven.com')
  if (!admin) {
    const hash = bcrypt.hashSync('Admin2025!', 10)
    db.prepare(
      `INSERT INTO users (id, name, surname, email, phone, password, role, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run('admin', 'Riven', 'Admin', 'admin@pilatesbyriven.com', '', hash, 'admin', now())
    console.log('Admin seeded: admin@pilatesbyriven.com / Admin2025!')
  }
})()

// ═══════════════════════════════════════════════════════
// AUTH ROUTES
// ═══════════════════════════════════════════════════════

app.post('/api/auth/register', (req, res) => {
  try {
    const { name, surname, email, phone, password } = req.body
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Campos requeridos: nombre, email, contraseña' })
    }
    const emailLower = email.trim().toLowerCase()
    if (db.prepare('SELECT id FROM users WHERE email = ?').get(emailLower)) {
      return res.status(409).json({ error: 'Este email ya está registrado' })
    }

    const hash = bcrypt.hashSync(password, 10)
    const id = uid()
    const ts = now()
    const role = emailLower === 'admin@pilatesbyriven.com' ? 'admin' : 'user'

    db.prepare(
      `INSERT INTO users (id, name, surname, email, phone, password, role, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, name.trim(), (surname || '').trim(), emailLower, (phone || '').trim(), hash, role, ts)

    const user = { id, name: name.trim(), surname: (surname || '').trim(), email: emailLower, phone: (phone || '').trim(), role, createdAt: ts }
    res.json({ user, token: generateToken(user) })
  } catch (err) {
    console.error('Register error:', err)
    res.status(500).json({ error: 'Error interno del servidor' })
  }
})

app.post('/api/auth/login', (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña requeridos' })
    }
    const emailLower = email.trim().toLowerCase()
    const row = db.prepare('SELECT * FROM users WHERE email = ?').get(emailLower)
    if (!row || !bcrypt.compareSync(password, row.password)) {
      return res.status(401).json({ error: 'Email o contraseña incorrectos' })
    }

    const { password: _, ...user } = row
    res.json({ user, token: generateToken(user) })
  } catch (err) {
    console.error('Login error:', err)
    res.status(500).json({ error: 'Error interno del servidor' })
  }
})

app.get('/api/auth/me', authMiddleware, (req, res) => {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)
  if (!row) return res.status(404).json({ error: 'Usuario no encontrado' })
  const { password: _, ...user } = row
  res.json({ user })
})

app.put('/api/auth/me', authMiddleware, (req, res) => {
  try {
    const { name, surname, phone, email, objective, profileLevel, restrictions } = req.body
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)
    if (!row) return res.status(404).json({ error: 'Usuario no encontrado' })

    if (email) {
      const emailLower = email.trim().toLowerCase()
      const dup = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(emailLower, req.user.id)
      if (dup) return res.status(409).json({ error: 'Este email ya está en uso' })
    }

    const u = {
      name: name !== undefined ? name.trim() : row.name,
      surname: surname !== undefined ? surname.trim() : row.surname,
      phone: phone !== undefined ? phone.trim() : row.phone,
      email: email ? email.trim().toLowerCase() : row.email,
      objective: objective !== undefined ? String(objective).trim() : (row.objective || ''),
      profileLevel: profileLevel !== undefined ? String(profileLevel).trim() : (row.profileLevel || 'beginner'),
      restrictions: restrictions !== undefined ? String(restrictions).trim() : (row.restrictions || ''),
    }

    db.prepare(
      `UPDATE users SET name = ?, surname = ?, phone = ?, email = ?, objective = ?, profileLevel = ?, restrictions = ?, updatedAt = ? WHERE id = ?`
    ).run(u.name, u.surname, u.phone, u.email, u.objective, u.profileLevel, u.restrictions, now(), req.user.id)

    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)
    const { password: _, ...user } = updated
    res.json({ user })
  } catch (err) {
    console.error('Update user error:', err)
    res.status(500).json({ error: 'Error interno del servidor' })
  }
})

// ═══════════════════════════════════════════════════════
// BOOKING ROUTES (authenticated users)
// ═══════════════════════════════════════════════════════

app.get('/api/bookings', authMiddleware, (req, res) => {
  const rows = db.prepare('SELECT * FROM bookings WHERE userId = ? ORDER BY createdAt DESC').all(req.user.id)
  res.json({ bookings: rows.map(fixTrial) })
})

app.get('/api/bookings/upcoming', authMiddleware, (req, res) => {
  const today = new Date().toISOString().split('T')[0]
  const rows = db.prepare(
    `SELECT * FROM bookings WHERE userId = ? AND date >= ? AND status IN ('approved','pending') ORDER BY date ASC, time ASC`
  ).all(req.user.id, today)
  res.json({ bookings: rows.map(fixTrial) })
})

app.get('/api/bookings/trial', authMiddleware, (req, res) => {
  const row = db.prepare(
    `SELECT COUNT(*) as c FROM bookings WHERE userId = ? AND isTrial = 1 AND status != 'cancelled'`
  ).get(req.user.id)
  res.json({ hasUsedTrial: row.c > 0 })
})

app.get('/api/bookings/spots', authMiddleware, (req, res) => {
  const { date, time, classType } = req.query
  if (!date || !time || !classType) return res.status(400).json({ error: 'date, time y classType requeridos' })
  const schedule = classType ? getScheduleForSlot(date, time, classType) : null
  const max = schedule ? Number(schedule.maxSpots) : defaultCapacity(classType)
  const row = db.prepare(
    `SELECT COUNT(*) as c FROM bookings WHERE date = ? AND time = ? AND classType = ? AND status != 'cancelled'`
  ).get(date, time, classType)
  res.json({ spots: Math.max(0, max - row.c) })
})

app.get('/api/schedules/available', authMiddleware, (req, res) => {
  const { date, classType } = req.query
  if (!date) return res.status(400).json({ error: 'date requerido' })

  const day = dateToDayOfWeek(date)
  const params = [date, day]
  let classFilter = ''
  if (classType) {
    classFilter = ' AND classType = ?'
    params.push(classType)
  }

  const rows = db.prepare(
    `SELECT * FROM schedules
     WHERE isActive = 1 AND (specificDate = ? OR (specificDate IS NULL AND dayOfWeek = ?))${classFilter}
     ORDER BY time ASC, classType ASC`
  ).all(...params)

  const schedules = rows.map((row) => {
    if (isBlockedSlot(date, row.time, row.classType)) {
      return null
    }
    const used = db.prepare(
      `SELECT COUNT(*) as c FROM bookings WHERE date = ? AND time = ? AND classType = ? AND status != 'cancelled'`
    ).get(date, row.time, row.classType).c

    const maxSpots = Number(row.maxSpots)
    return {
      ...normalizeSchedule(row),
      date,
      spots: Math.max(0, maxSpots - used),
    }
  }).filter(Boolean)

  res.json({ schedules })
})

// Bulk availability for a date range
app.get('/api/bookings/availability', authMiddleware, (req, res) => {
  const { startDate, endDate } = req.query
  if (!startDate || !endDate) return res.status(400).json({ error: 'startDate y endDate requeridos' })
  const rows = db.prepare(
    `SELECT date, time, COUNT(*) as count FROM bookings WHERE date >= ? AND date <= ? AND status != 'cancelled' GROUP BY date, time`
  ).all(startDate, endDate)
  const counts = {}
  rows.forEach(r => { counts[`${r.date}_${r.time}`] = r.count })
  res.json({ counts })
})

app.post('/api/bookings', authMiddleware, (req, res) => {
  try {
    const { classType, date, time, notes, equipment, isTrial } = req.body
    if (!classType || !date || !time) {
      return res.status(400).json({ error: 'Clase, fecha y hora requeridos' })
    }

    if (isBlockedSlot(date, time, classType)) {
      return res.status(409).json({ error: 'Este horario está bloqueado por el estudio' })
    }

    // Duplicate check
    const dup = db.prepare(
      `SELECT id FROM bookings WHERE userId = ? AND date = ? AND time = ? AND status != 'cancelled'`
    ).get(req.user.id, date, time)
    if (dup) return res.status(409).json({ error: 'Ya tienes una reserva a esa hora' })

    // Capacity check
    const schedule = getScheduleForSlot(date, time, classType)
    const max = schedule ? Number(schedule.maxSpots) : defaultCapacity(classType)
    const cnt = db.prepare(
      `SELECT COUNT(*) as c FROM bookings WHERE date = ? AND time = ? AND classType = ? AND status != 'cancelled'`
    ).get(date, time, classType)
    if (cnt.c >= max) return res.status(409).json({ error: 'Este horario está lleno' })

    // Trial check
    if (isTrial) {
      const t = db.prepare(
        `SELECT COUNT(*) as c FROM bookings WHERE userId = ? AND isTrial = 1 AND status != 'cancelled'`
      ).get(req.user.id)
      if (t.c > 0) return res.status(409).json({ error: 'Ya utilizaste tu clase de prueba' })
    }

    const user = db.prepare('SELECT name, surname, phone, email FROM users WHERE id = ?').get(req.user.id)
    const id = uid()
    const ts = now()
    const priceAtBooking = getBookingPrice({ classType, date, time, isTrial: !!isTrial })

    db.prepare(
      `INSERT INTO bookings (id, userId, userName, userPhone, userEmail, classType, date, time, notes, equipment, isTrial, status, createdAt, updatedAt, priceAtBooking) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`
    ).run(
      id, req.user.id, `${user.name} ${user.surname || ''}`.trim(),
      user.phone || '', user.email || '', classType, date, time,
      notes || '', equipment || 'reformer', isTrial ? 1 : 0, ts, ts, priceAtBooking
    )

    const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id)
    res.json({ booking: fixTrial(booking) })
  } catch (err) {
    console.error('Create booking error:', err)
    res.status(500).json({ error: 'Error interno del servidor' })
  }
})

app.post('/api/waitlist/join', authMiddleware, (req, res) => {
  try {
    const { classType, date, time, notes } = req.body
    if (!classType || !date || !time) {
      return res.status(400).json({ error: 'classType, date y time requeridos' })
    }

    const alreadyBooked = db.prepare(
      `SELECT id FROM bookings WHERE userId = ? AND date = ? AND time = ? AND status != 'cancelled'`
    ).get(req.user.id, date, time)
    if (alreadyBooked) return res.status(409).json({ error: 'Ya tienes una reserva para ese horario' })

    const existing = db.prepare(
      `SELECT id FROM waitlist WHERE userId = ? AND classType = ? AND date = ? AND time = ? AND status = 'pending'`
    ).get(req.user.id, classType, date, time)
    if (existing) return res.status(409).json({ error: 'Ya estás en lista de espera para ese horario' })

    const user = db.prepare('SELECT name, surname, phone, email FROM users WHERE id = ?').get(req.user.id)
    const id = uid()
    const ts = now()
    db.prepare(
      `INSERT INTO waitlist (id, userId, userName, userPhone, userEmail, classType, date, time, status, notes, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`
    ).run(
      id,
      req.user.id,
      `${user.name} ${user.surname || ''}`.trim(),
      user.phone || '',
      user.email || '',
      classType,
      date,
      time,
      notes || '',
      ts,
      ts,
    )

    const waitlist = db.prepare('SELECT * FROM waitlist WHERE id = ?').get(id)
    res.json({ waitlist })
  } catch (err) {
    console.error('Waitlist join error:', err)
    res.status(500).json({ error: 'Error interno del servidor' })
  }
})

app.put('/api/bookings/:id/cancel', authMiddleware, (req, res) => {
  const b = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id)
  if (!b) return res.status(404).json({ error: 'Reserva no encontrada' })
  if (b.userId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'No tienes permiso' })
  }

  if (req.user.role !== 'admin') {
    const { cancelWindowHours } = getPolicySettings()
    const startMs = new Date(`${b.date}T${b.time}:00`).getTime()
    const hoursUntilClass = (startMs - Date.now()) / (1000 * 60 * 60)
    if (hoursUntilClass < cancelWindowHours) {
      return res.status(409).json({ error: `Cancelación permitida hasta ${cancelWindowHours} horas antes de la clase` })
    }
  }

  db.prepare(`UPDATE bookings SET status = 'cancelled', updatedAt = ? WHERE id = ?`).run(now(), req.params.id)
  promoteWaitlistForSlot(b.date, b.time, b.classType)
  const updated = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id)
  res.json({ booking: fixTrial(updated) })
})

app.put('/api/bookings/:id/reschedule', authMiddleware, (req, res) => {
  try {
    const { date, time } = req.body
    if (!date || !time) return res.status(400).json({ error: 'Fecha y hora requeridos' })

    const b = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id)
    if (!b) return res.status(404).json({ error: 'Reserva no encontrada' })
    if (b.userId !== req.user.id) return res.status(403).json({ error: 'No tienes permiso' })
    if (!['pending', 'approved'].includes(b.status)) {
      return res.status(409).json({ error: 'Solo reservas activas se pueden reagendar' })
    }

    if (isBlockedSlot(date, time, b.classType)) {
      return res.status(409).json({ error: 'Este horario está bloqueado por el estudio' })
    }

    const duplicate = db.prepare(
      `SELECT id FROM bookings WHERE userId = ? AND date = ? AND time = ? AND status != 'cancelled' AND id != ?`
    ).get(req.user.id, date, time, req.params.id)
    if (duplicate) return res.status(409).json({ error: 'Ya tienes una reserva en ese horario' })

    const slotSchedule = getScheduleForSlot(date, time, b.classType)
    const max = slotSchedule ? Number(slotSchedule.maxSpots) : defaultCapacity(b.classType)
    const occupied = db.prepare(
      `SELECT COUNT(*) as c FROM bookings WHERE date = ? AND time = ? AND classType = ? AND status != 'cancelled' AND id != ?`
    ).get(date, time, b.classType, req.params.id).c
    if (occupied >= max) return res.status(409).json({ error: 'Este horario está lleno' })

    const nextPrice = getBookingPrice({ classType: b.classType, date, time, isTrial: !!b.isTrial })
    db.prepare(
      `UPDATE bookings
       SET date = ?, time = ?, status = 'pending', priceAtBooking = ?, reminder24Sent = 0, reminder2Sent = 0, updatedAt = ?
       WHERE id = ?`
    ).run(date, time, nextPrice, now(), req.params.id)

    const updated = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id)
    res.json({ booking: fixTrial(updated) })
  } catch (err) {
    console.error('Reschedule self error:', err)
    res.status(500).json({ error: 'Error interno del servidor' })
  }
})

app.get('/api/waitlist/my', authMiddleware, (req, res) => {
  const rows = db.prepare(
    `SELECT * FROM waitlist WHERE userId = ? ORDER BY createdAt DESC`
  ).all(req.user.id)

  const waitlist = rows.map((row) => {
    if (row.status !== 'pending') return { ...row, position: null }

    const ahead = db.prepare(
      `SELECT COUNT(*) as c
       FROM waitlist
       WHERE status = 'pending'
         AND classType = ?
         AND date = ?
         AND time = ?
         AND createdAt < ?`
    ).get(row.classType, row.date, row.time, row.createdAt).c

    return { ...row, position: ahead + 1 }
  })

  res.json({ waitlist })
})

app.get('/api/notifications', authMiddleware, (req, res) => {
  const limit = Math.max(1, Math.min(100, Number(req.query.limit || 20)))
  const bookingRows = db.prepare(
    `SELECT id, classType, date, time, status, updatedAt, createdAt
     FROM bookings
     WHERE userId = ?
     ORDER BY updatedAt DESC
     LIMIT ?`
  ).all(req.user.id, limit)

  const waitlistRows = db.prepare(
    `SELECT id, classType, date, time, status, updatedAt, createdAt
     FROM waitlist
     WHERE userId = ?
     ORDER BY updatedAt DESC
     LIMIT ?`
  ).all(req.user.id, limit)

  const bookingNotifications = bookingRows.map((item) => {
    let title = 'Reserva actualizada'
    if (item.status === 'approved') title = 'Reserva confirmada'
    if (item.status === 'pending') title = 'Reserva pendiente'
    if (item.status === 'completed') title = 'Clase completada'
    if (item.status === 'cancelled') title = 'Reserva cancelada'

    return {
      id: `bk_${item.id}`,
      type: 'booking',
      title,
      classType: item.classType,
      date: item.date,
      time: item.time,
      status: item.status,
      createdAt: item.updatedAt || item.createdAt,
    }
  })

  const waitlistNotifications = waitlistRows.map((item) => {
    let title = 'Lista de espera activa'
    if (item.status === 'promoted') title = 'Se liberó un cupo para ti'
    if (item.status === 'cancelled') title = 'Lista de espera cancelada'

    return {
      id: `wl_${item.id}`,
      type: 'waitlist',
      title,
      classType: item.classType,
      date: item.date,
      time: item.time,
      status: item.status,
      createdAt: item.updatedAt || item.createdAt,
    }
  })

  const notifications = [...bookingNotifications, ...waitlistNotifications]
    .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))
    .slice(0, limit)

  res.json({ notifications })
})

// ═══════════════════════════════════════════════════════
// ADMIN ROUTES
// ═══════════════════════════════════════════════════════

// ─── ADMIN STATS ──────────────────────────────────────
app.get('/api/admin/stats', authMiddleware, adminMiddleware, (req, res) => {
  const today = new Date().toISOString().split('T')[0]
  const monthStart = new Date()
  monthStart.setDate(1)
  const monthStartStr = monthStart.toISOString().split('T')[0]
  const monthEndStr = new Date().toISOString().split('T')[0]

  const total = db.prepare('SELECT COUNT(*) as c FROM bookings').get().c
  const totalUsers = db.prepare(`SELECT COUNT(*) as c FROM users WHERE role != 'admin'`).get().c
  const totalSchedules = db.prepare(`SELECT COUNT(*) as c FROM schedules WHERE isActive = 1`).get().c
  const pending = db.prepare(`SELECT COUNT(*) as c FROM bookings WHERE status = 'pending'`).get().c
  const approved = db.prepare(`SELECT COUNT(*) as c FROM bookings WHERE status = 'approved'`).get().c
  const cancelled = db.prepare(`SELECT COUNT(*) as c FROM bookings WHERE status = 'cancelled'`).get().c
  const completed = db.prepare(`SELECT COUNT(*) as c FROM bookings WHERE status = 'completed'`).get().c
  const noShow = db.prepare(`SELECT COUNT(*) as c FROM bookings WHERE isNoShow = 1`).get().c
  const upcoming = db.prepare(`SELECT COUNT(*) as c FROM bookings WHERE date >= ? AND status != 'cancelled'`).get(today).c
  const weekBookings = db.prepare(`SELECT COUNT(*) as c FROM bookings WHERE date >= date('now','-7 days')`).get().c
  const monthCompleted = db.prepare(`SELECT COUNT(*) as c FROM bookings WHERE status = 'completed' AND date >= date('now','-30 days')`).get().c
  const waitlistPending = db.prepare(`SELECT COUNT(*) as c FROM waitlist WHERE status = 'pending'`).get().c
  const finance = getFinanceSummary(monthStartStr, monthEndStr)

  const todayBookings = db.prepare(
    `SELECT * FROM bookings WHERE date = ? AND status != 'cancelled' ORDER BY time ASC`
  ).all(today).map(fixTrial)

  res.json({
    total,
    totalUsers,
    totalSchedules,
    pending,
    approved,
    cancelled,
    completed,
    noShow,
    upcoming,
    weekBookings,
    monthCompleted,
    waitlistPending,
    finance,
    todayBookings,
  })
})

// ─── ADMIN BOOKINGS ───────────────────────────────────
app.get('/api/admin/bookings', authMiddleware, adminMiddleware, (req, res) => {
  const { status, search, date, classType } = req.query
  let query = 'SELECT * FROM bookings'
  const params = []
  const conds = []

  if (status && status !== 'all') { conds.push('status = ?'); params.push(status) }
  if (date) { conds.push('date = ?'); params.push(date) }
  if (classType && classType !== 'all') { conds.push('classType = ?'); params.push(classType) }
  if (search) {
    conds.push('(userName LIKE ? OR userEmail LIKE ? OR userPhone LIKE ?)')
    const q = `%${search}%`
    params.push(q, q, q)
  }

  if (conds.length) query += ' WHERE ' + conds.join(' AND ')
  query += ' ORDER BY date DESC, time ASC'

  const rows = db.prepare(query).all(...params)
  res.json({ bookings: rows.map(fixTrial) })
})

app.put('/api/admin/bookings/:id/status', authMiddleware, adminMiddleware, (req, res) => {
  const { status, adminNotes } = req.body
  if (!['pending', 'approved', 'cancelled', 'completed', 'no-show'].includes(status)) {
    return res.status(400).json({ error: 'Estado inválido' })
  }
  const b = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id)
  if (!b) return res.status(404).json({ error: 'Reserva no encontrada' })

  const safeStatus = status === 'no-show' ? 'completed' : status
  const noShowFlag = status === 'no-show' ? 1 : 0
  const ts = now()
  if (adminNotes !== undefined) {
    db.prepare('UPDATE bookings SET status = ?, isNoShow = ?, adminNotes = ?, updatedAt = ? WHERE id = ?').run(safeStatus, noShowFlag, adminNotes, ts, req.params.id)
  } else {
    db.prepare('UPDATE bookings SET status = ?, isNoShow = ?, updatedAt = ? WHERE id = ?').run(safeStatus, noShowFlag, ts, req.params.id)
  }

  if (status === 'cancelled') {
    promoteWaitlistForSlot(b.date, b.time, b.classType)
  }

  const updated = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id)
  res.json({ booking: fixTrial(updated) })
})

app.put('/api/admin/bookings/:id/reschedule', authMiddleware, adminMiddleware, (req, res) => {
  const { date, time } = req.body
  if (!date || !time) return res.status(400).json({ error: 'Fecha y hora requeridos' })
  const b = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id)
  if (!b) return res.status(404).json({ error: 'Reserva no encontrada' })

  db.prepare(
    `UPDATE bookings SET date = ?, time = ?, status = 'pending', updatedAt = ? WHERE id = ?`
  ).run(date, time, now(), req.params.id)

  const updated = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id)
  res.json({ booking: fixTrial(updated) })
})

// Bulk approve all pending
app.post('/api/admin/bookings/approve-all', authMiddleware, adminMiddleware, (req, res) => {
  const result = db.prepare(
    `UPDATE bookings SET status = 'approved', updatedAt = ? WHERE status = 'pending'`
  ).run(now())
  res.json({ count: result.changes })
})

app.get('/api/admin/finance', authMiddleware, adminMiddleware, (req, res) => {
  const { from, to } = req.query
  const today = new Date().toISOString().split('T')[0]
  const fromDate = from || new Date(new Date().setDate(new Date().getDate() - 29)).toISOString().split('T')[0]
  const toDate = to || today
  const summary = getFinanceSummary(fromDate, toDate)
  res.json({ fromDate, toDate, ...summary })
})

app.get('/api/admin/settings', authMiddleware, adminMiddleware, (_req, res) => {
  res.json({ settings: getPolicySettings() })
})

app.put('/api/admin/settings', authMiddleware, adminMiddleware, (req, res) => {
  const { cancelWindowHours, noShowGraceMinutes } = req.body
  const ts = now()

  if (cancelWindowHours !== undefined) {
    const safe = Number(cancelWindowHours)
    if (!Number.isFinite(safe) || safe < 0 || safe > 72) {
      return res.status(400).json({ error: 'cancelWindowHours debe ser entre 0 y 72' })
    }
    db.prepare(`INSERT INTO settings (key, value, updatedAt) VALUES ('cancelWindowHours', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt`).run(String(Math.round(safe)), ts)
  }

  if (noShowGraceMinutes !== undefined) {
    const safe = Number(noShowGraceMinutes)
    if (!Number.isFinite(safe) || safe < 0 || safe > 180) {
      return res.status(400).json({ error: 'noShowGraceMinutes debe ser entre 0 y 180' })
    }
    db.prepare(`INSERT INTO settings (key, value, updatedAt) VALUES ('noShowGraceMinutes', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt`).run(String(Math.round(safe)), ts)
  }

  res.json({ settings: getPolicySettings() })
})

app.get('/api/admin/blocks', authMiddleware, adminMiddleware, (req, res) => {
  const { active } = req.query
  let query = 'SELECT * FROM schedule_blocks'
  if (active === 'true') query += ' WHERE isActive = 1'
  if (active === 'false') query += ' WHERE isActive = 0'
  query += ' ORDER BY date ASC, time ASC'
  const blocks = db.prepare(query).all().map((item) => ({ ...item, isActive: !!item.isActive }))
  res.json({ blocks })
})

app.post('/api/admin/blocks', authMiddleware, adminMiddleware, (req, res) => {
  const { date, time, classType, reason, isActive } = req.body
  if (!date) return res.status(400).json({ error: 'date requerido' })
  const id = uid()
  const ts = now()
  db.prepare(
    `INSERT INTO schedule_blocks (id, date, time, classType, reason, isActive, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, date, time || null, classType || null, reason || '', isActive === false ? 0 : 1, ts, ts)
  const block = db.prepare('SELECT * FROM schedule_blocks WHERE id = ?').get(id)
  res.json({ block: { ...block, isActive: !!block.isActive } })
})

app.delete('/api/admin/blocks/:id', authMiddleware, adminMiddleware, (req, res) => {
  const result = db.prepare('DELETE FROM schedule_blocks WHERE id = ?').run(req.params.id)
  if (!result.changes) return res.status(404).json({ error: 'Bloqueo no encontrado' })
  res.json({ ok: true })
})

app.get('/api/admin/waitlist', authMiddleware, adminMiddleware, (req, res) => {
  const { status = 'pending', date } = req.query
  const conds = []
  const params = []
  if (status !== 'all') {
    conds.push('status = ?')
    params.push(status)
  }
  if (date) {
    conds.push('date = ?')
    params.push(date)
  }
  let query = 'SELECT * FROM waitlist'
  if (conds.length) query += ` WHERE ${conds.join(' AND ')}`
  query += ' ORDER BY date ASC, time ASC, createdAt ASC'
  const waitlist = db.prepare(query).all(...params)
  res.json({ waitlist })
})

app.post('/api/admin/waitlist/:id/promote', authMiddleware, adminMiddleware, (req, res) => {
  const item = db.prepare('SELECT * FROM waitlist WHERE id = ?').get(req.params.id)
  if (!item) return res.status(404).json({ error: 'Entrada de lista no encontrada' })
  if (item.status !== 'pending') return res.status(409).json({ error: 'Esta entrada no está pendiente' })

  const activeCount = db.prepare(
    `SELECT COUNT(*) as c FROM bookings
     WHERE date = ? AND time = ? AND classType = ? AND status != 'cancelled'`
  ).get(item.date, item.time, item.classType).c
  const schedule = getScheduleForSlot(item.date, item.time, item.classType)
  const max = schedule ? Number(schedule.maxSpots) : defaultCapacity(item.classType)
  if (activeCount >= max) return res.status(409).json({ error: 'Horario sin cupos para promover' })

  const promoted = promoteWaitlistForSlot(item.date, item.time, item.classType)
  if (!promoted) return res.status(409).json({ error: 'No se pudo promover esta entrada' })
  res.json({ booking: fixTrial(promoted) })
})

app.put('/api/admin/waitlist/:id/cancel', authMiddleware, adminMiddleware, (req, res) => {
  const result = db.prepare(`UPDATE waitlist SET status = 'cancelled', updatedAt = ? WHERE id = ? AND status = 'pending'`).run(now(), req.params.id)
  if (!result.changes) return res.status(404).json({ error: 'Entrada pendiente no encontrada' })
  res.json({ ok: true })
})

app.get('/api/admin/reminders/pending', authMiddleware, adminMiddleware, (_req, res) => {
  const rows = db.prepare(
    `SELECT * FROM bookings
     WHERE status IN ('approved','pending')
       AND date >= date('now')
       AND (userPhone IS NOT NULL AND userPhone != '')
     ORDER BY date ASC, time ASC`
  ).all().map(fixTrial)
  res.json({ reminders: rows })
})

app.get('/api/admin/reminders/config', authMiddleware, adminMiddleware, (_req, res) => {
  res.json({
    autoEnabled: REMINDER_AUTO_ENABLED,
    providerReady: canSendWhatsAppReminders(),
    from: TWILIO_WHATSAPP_FROM,
  })
})

app.post('/api/admin/reminders/run', authMiddleware, adminMiddleware, async (_req, res) => {
  try {
    const result = await processAutomaticReminders()
    res.json(result)
  } catch (err) {
    console.error('Run reminders error:', err)
    res.status(500).json({ error: 'No se pudo ejecutar recordatorios automáticos' })
  }
})

// ─── ADMIN SCHEDULES ─────────────────────────────────
app.get('/api/admin/schedules', authMiddleware, adminMiddleware, (req, res) => {
  const { classType, active } = req.query
  let query = 'SELECT * FROM schedules'
  const params = []
  const conds = []

  if (classType && classType !== 'all') {
    conds.push('classType = ?')
    params.push(classType)
  }
  if (active === 'true') conds.push('isActive = 1')
  if (active === 'false') conds.push('isActive = 0')
  if (conds.length) query += ' WHERE ' + conds.join(' AND ')

  query += " ORDER BY COALESCE(specificDate, '9999-12-31') ASC, dayOfWeek ASC, time ASC, classType ASC"
  const schedules = db.prepare(query).all(...params).map(normalizeSchedule)
  res.json({ schedules })
})

app.post('/api/admin/schedules', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const { classType, dayOfWeek, specificDate, time, maxSpots, price, isActive } = req.body
    if (!classType || !time) {
      return res.status(400).json({ error: 'classType y time requeridos' })
    }
    if (specificDate === undefined && (dayOfWeek === undefined || dayOfWeek === null)) {
      return res.status(400).json({ error: 'Debes indicar specificDate o dayOfWeek' })
    }

    const safeDay = specificDate ? null : Number(dayOfWeek)
    if (safeDay !== null && (Number.isNaN(safeDay) || safeDay < 0 || safeDay > 6)) {
      return res.status(400).json({ error: 'dayOfWeek debe estar entre 0 y 6' })
    }

    const safeMax = Number(maxSpots || defaultCapacity(classType))
    if (Number.isNaN(safeMax) || safeMax < 1) {
      return res.status(400).json({ error: 'maxSpots inválido' })
    }

    const safePrice = Number(price || 0)
    if (Number.isNaN(safePrice) || safePrice < 0) {
      return res.status(400).json({ error: 'price inválido' })
    }

    const id = uid()
    const ts = now()
    db.prepare(
      `INSERT INTO schedules (id, classType, dayOfWeek, specificDate, time, maxSpots, price, isActive, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      classType,
      safeDay,
      specificDate || null,
      time,
      safeMax,
      safePrice,
      isActive === false ? 0 : 1,
      ts,
      ts,
    )

    const schedule = db.prepare('SELECT * FROM schedules WHERE id = ?').get(id)
    res.json({ schedule: normalizeSchedule(schedule) })
  } catch (err) {
    console.error('Create schedule error:', err)
    res.status(500).json({ error: 'Error interno del servidor' })
  }
})

app.put('/api/admin/schedules/:id', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const current = db.prepare('SELECT * FROM schedules WHERE id = ?').get(req.params.id)
    if (!current) return res.status(404).json({ error: 'Horario no encontrado' })

    const {
      classType = current.classType,
      dayOfWeek,
      specificDate,
      time = current.time,
      maxSpots,
      price,
      isActive,
    } = req.body

    let nextSpecificDate = specificDate === undefined ? current.specificDate : (specificDate || null)
    let nextDayOfWeek = dayOfWeek === undefined ? current.dayOfWeek : Number(dayOfWeek)

    if (nextSpecificDate) nextDayOfWeek = null
    if (!nextSpecificDate && (nextDayOfWeek === null || Number.isNaN(nextDayOfWeek) || nextDayOfWeek < 0 || nextDayOfWeek > 6)) {
      return res.status(400).json({ error: 'dayOfWeek debe estar entre 0 y 6 si no hay specificDate' })
    }

    const safeMax = maxSpots === undefined ? Number(current.maxSpots) : Number(maxSpots)
    if (Number.isNaN(safeMax) || safeMax < 1) {
      return res.status(400).json({ error: 'maxSpots inválido' })
    }

    const safePrice = price === undefined ? Number(current.price) : Number(price)
    if (Number.isNaN(safePrice) || safePrice < 0) {
      return res.status(400).json({ error: 'price inválido' })
    }

    db.prepare(
      `UPDATE schedules
       SET classType = ?, dayOfWeek = ?, specificDate = ?, time = ?, maxSpots = ?, price = ?, isActive = ?, updatedAt = ?
       WHERE id = ?`
    ).run(
      classType,
      nextDayOfWeek,
      nextSpecificDate,
      time,
      safeMax,
      safePrice,
      isActive === undefined ? current.isActive : (isActive ? 1 : 0),
      now(),
      req.params.id,
    )

    const schedule = db.prepare('SELECT * FROM schedules WHERE id = ?').get(req.params.id)
    res.json({ schedule: normalizeSchedule(schedule) })
  } catch (err) {
    console.error('Update schedule error:', err)
    res.status(500).json({ error: 'Error interno del servidor' })
  }
})

app.delete('/api/admin/schedules/:id', authMiddleware, adminMiddleware, (req, res) => {
  const result = db.prepare('DELETE FROM schedules WHERE id = ?').run(req.params.id)
  if (!result.changes) return res.status(404).json({ error: 'Horario no encontrado' })
  res.json({ ok: true })
})

// ─── ADMIN USERS ──────────────────────────────────────
app.get('/api/admin/users', authMiddleware, adminMiddleware, (req, res) => {
  const { search } = req.query
  let query = `SELECT id, name, surname, email, phone, role, createdAt, updatedAt FROM users WHERE role != 'admin'`
  const params = []
  if (search) {
    query += ` AND (name LIKE ? OR surname LIKE ? OR email LIKE ? OR phone LIKE ?)`
    const q = `%${search}%`
    params.push(q, q, q, q)
  }
  query += ' ORDER BY createdAt DESC'
  res.json({ users: db.prepare(query).all(...params) })
})

// ─── HEALTH ───────────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({ status: 'ok', time: now() }))

// ─── PASS VERIFICATION ───────────────────────────────
app.get('/api/pass/:id', (req, res) => {
  const b = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id)
  if (!b) return res.status(404).json({ error: 'Pase no encontrado' })
  const user = db.prepare('SELECT name, surname FROM users WHERE id = ?').get(b.userId)
  res.json({
    valid: b.status === 'approved',
    booking: {
      id: b.id,
      code: b.id.toUpperCase().slice(-8),
      status: b.status,
      classType: b.classType,
      date: b.date,
      time: b.time,
      userName: user ? `${user.name} ${user.surname || ''}`.trim() : b.userName,
    },
  })
})

// ─── APPLE WALLET .PKPASS ─────────────────────────────
const classTypeNames = CLASS_TYPE_NAMES

const TINY_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64')

function createPassIcon() {
  return TINY_PNG
}

app.get('/api/pass/:id/wallet', (req, res) => {
  try {
    const b = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id)
    if (!b) return res.status(404).json({ error: 'Reserva no encontrada' })
    if (b.status !== 'approved') return res.status(400).json({ error: 'Solo reservas aprobadas pueden generar pase' })

    const user = db.prepare('SELECT name, surname, email FROM users WHERE id = ?').get(b.userId)
    const userName = user ? `${user.name} ${user.surname || ''}`.trim() : b.userName
    const passCode = b.id.toUpperCase().slice(-8)
    const timeLabel = b.time === '07:00' ? '7:00 AM' : '6:00 PM'
    const endTimeLabel = b.time === '07:00' ? '8:15 AM' : '7:15 PM'
    const dateObj = new Date(b.date + 'T12:00:00')
    const dateLabel = dateObj.toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

    const passJson = {
      formatVersion: 1,
      passTypeIdentifier: 'pass.com.pilatesbyriven.booking',
      serialNumber: b.id,
      teamIdentifier: 'PILATESBR',
      organizationName: 'Pilates by Riven',
      description: `Clase de ${classTypeNames[b.classType] || b.classType}`,
      logoText: 'Pilates by Riven',
      foregroundColor: 'rgb(255, 255, 255)',
      backgroundColor: 'rgb(193, 156, 128)',
      labelColor: 'rgb(255, 255, 255)',
      barcode: {
        message: `https://pilatesbyriven.com/pass/${b.id}`,
        format: 'PKBarcodeFormatQR',
        messageEncoding: 'iso-8859-1',
      },
      barcodes: [{
        message: `https://pilatesbyriven.com/pass/${b.id}`,
        format: 'PKBarcodeFormatQR',
        messageEncoding: 'iso-8859-1',
      }],
      eventTicket: {
        headerFields: [
          { key: 'status', label: 'ESTADO', value: 'CONFIRMADA' },
        ],
        primaryFields: [
          { key: 'class', label: 'CLASE', value: classTypeNames[b.classType] || b.classType },
        ],
        secondaryFields: [
          { key: 'date', label: 'FECHA', value: dateLabel },
          { key: 'time', label: 'HORARIO', value: `${timeLabel} - ${endTimeLabel}` },
        ],
        auxiliaryFields: [
          { key: 'name', label: 'CLIENTE', value: userName },
          { key: 'code', label: 'CÓDIGO', value: passCode },
        ],
        backFields: [
          { key: 'info', label: 'Información', value: 'Pilates by Riven\nCosta Rica\n\nMuestra este pase en la entrada del estudio.' },
          { key: 'contact', label: 'Contacto', value: 'WhatsApp: +506 8543 8378\nInstagram: @pilatesbyriven' },
        ],
      },
    }

    const passJsonStr = JSON.stringify(passJson)
    const iconData = createPassIcon()

    const manifest = {
      'pass.json': createHash('sha1').update(passJsonStr).digest('hex'),
      'icon.png': createHash('sha1').update(iconData).digest('hex'),
      'icon@2x.png': createHash('sha1').update(iconData).digest('hex'),
      'logo.png': createHash('sha1').update(iconData).digest('hex'),
      'logo@2x.png': createHash('sha1').update(iconData).digest('hex'),
    }
    const manifestStr = JSON.stringify(manifest)

    res.setHeader('Content-Type', 'application/vnd.apple.pkpass')
    res.setHeader('Content-Disposition', `attachment; filename="pilates-${b.date}.pkpass"`)

    const archive = archiver('zip', { zlib: { level: 9 } })
    archive.pipe(res)
    archive.append(passJsonStr, { name: 'pass.json' })
    archive.append(manifestStr, { name: 'manifest.json' })
    archive.append(iconData, { name: 'icon.png' })
    archive.append(iconData, { name: 'icon@2x.png' })
    archive.append(iconData, { name: 'logo.png' })
    archive.append(iconData, { name: 'logo@2x.png' })
    archive.finalize()
  } catch (err) {
    console.error('Pass generation error:', err)
    res.status(500).json({ error: 'Error generando el pase' })
  }
})

// ─── SERVE FRONTEND IN PRODUCTION ─────────────────────
if (process.env.NODE_ENV === 'production') {
  const distPath = join(__dirname, '..', 'dist')
  app.use(express.static(distPath))
  app.get('*', (_req, res) => res.sendFile(join(distPath, 'index.html')))
}

if (REMINDER_AUTO_ENABLED) {
  setTimeout(() => {
    processAutomaticReminders().catch((err) => console.error('Initial reminder run error:', err))
  }, 8000)

  setInterval(() => {
    processAutomaticReminders().catch((err) => console.error('Scheduled reminder run error:', err))
  }, 5 * 60 * 1000)
}

// ─── START ────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Pilates by Riven API running on port ${PORT}`)
})
