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

app.use(cors())
app.use(express.json())

// ─── HELPERS ──────────────────────────────────────────
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
const now = () => new Date().toISOString()
const fixTrial = (r) => ({ ...r, isTrial: !!r.isTrial })

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
    const { name, surname, phone, email } = req.body
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
    }

    db.prepare(
      `UPDATE users SET name = ?, surname = ?, phone = ?, email = ?, updatedAt = ? WHERE id = ?`
    ).run(u.name, u.surname, u.phone, u.email, now(), req.user.id)

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
  if (!date || !time) return res.status(400).json({ error: 'date y time requeridos' })
  const row = db.prepare(
    `SELECT COUNT(*) as c FROM bookings WHERE date = ? AND time = ? AND status != 'cancelled'`
  ).get(date, time)
  const max = classType === 'duo' ? 2 : classType === 'privada' ? 1 : 3
  res.json({ spots: Math.max(0, max - row.c) })
})

// Bulk availability for a date range (avoids N+1 queries from frontend)
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

    // Duplicate check
    const dup = db.prepare(
      `SELECT id FROM bookings WHERE userId = ? AND date = ? AND time = ? AND status != 'cancelled'`
    ).get(req.user.id, date, time)
    if (dup) return res.status(409).json({ error: 'Ya tienes una reserva a esa hora' })

    // Capacity check
    const cnt = db.prepare(
      `SELECT COUNT(*) as c FROM bookings WHERE date = ? AND time = ? AND status != 'cancelled'`
    ).get(date, time)
    const max = classType === 'duo' ? 2 : classType === 'privada' ? 1 : 3
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

    db.prepare(
      `INSERT INTO bookings (id, userId, userName, userPhone, userEmail, classType, date, time, notes, equipment, isTrial, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
    ).run(
      id, req.user.id, `${user.name} ${user.surname || ''}`.trim(),
      user.phone || '', user.email || '', classType, date, time,
      notes || '', equipment || 'reformer', isTrial ? 1 : 0, ts, ts
    )

    const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id)
    res.json({ booking: fixTrial(booking) })
  } catch (err) {
    console.error('Create booking error:', err)
    res.status(500).json({ error: 'Error interno del servidor' })
  }
})

app.put('/api/bookings/:id/cancel', authMiddleware, (req, res) => {
  const b = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id)
  if (!b) return res.status(404).json({ error: 'Reserva no encontrada' })
  if (b.userId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'No tienes permiso' })
  }
  db.prepare(`UPDATE bookings SET status = 'cancelled', updatedAt = ? WHERE id = ?`).run(now(), req.params.id)
  const updated = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id)
  res.json({ booking: fixTrial(updated) })
})

// ═══════════════════════════════════════════════════════
// ADMIN ROUTES
// ═══════════════════════════════════════════════════════

app.get('/api/admin/stats', authMiddleware, adminMiddleware, (req, res) => {
  const today = new Date().toISOString().split('T')[0]
  const total = db.prepare('SELECT COUNT(*) as c FROM bookings').get().c
  const pending = db.prepare(`SELECT COUNT(*) as c FROM bookings WHERE status = 'pending'`).get().c
  const approved = db.prepare(`SELECT COUNT(*) as c FROM bookings WHERE status = 'approved'`).get().c
  const cancelled = db.prepare(`SELECT COUNT(*) as c FROM bookings WHERE status = 'cancelled'`).get().c
  const completed = db.prepare(`SELECT COUNT(*) as c FROM bookings WHERE status = 'completed'`).get().c
  const upcoming = db.prepare(`SELECT COUNT(*) as c FROM bookings WHERE date >= ? AND status != 'cancelled'`).get(today).c
  const todayBookings = db.prepare(
    `SELECT * FROM bookings WHERE date = ? AND status != 'cancelled' ORDER BY time ASC`
  ).all(today).map(fixTrial)

  res.json({ total, pending, approved, cancelled, completed, upcoming, todayBookings })
})

app.get('/api/admin/bookings', authMiddleware, adminMiddleware, (req, res) => {
  const { status, search, date } = req.query
  let query = 'SELECT * FROM bookings'
  const params = []
  const conds = []

  if (status && status !== 'all') { conds.push('status = ?'); params.push(status) }
  if (date) { conds.push('date = ?'); params.push(date) }
  if (search) {
    conds.push('(userName LIKE ? OR userEmail LIKE ? OR userPhone LIKE ?)')
    const q = `%${search}%`
    params.push(q, q, q)
  }

  if (conds.length) query += ' WHERE ' + conds.join(' AND ')
  query += ' ORDER BY createdAt DESC'

  const rows = db.prepare(query).all(...params)
  res.json({ bookings: rows.map(fixTrial) })
})

app.get('/api/admin/users', authMiddleware, adminMiddleware, (req, res) => {
  const { search } = req.query
  let query = `SELECT id, name, surname, email, phone, role, createdAt FROM users WHERE role != 'admin'`
  const params = []
  if (search) {
    query += ` AND (name LIKE ? OR surname LIKE ? OR email LIKE ? OR phone LIKE ?)`
    const q = `%${search}%`
    params.push(q, q, q, q)
  }
  query += ' ORDER BY createdAt DESC'
  res.json({ users: db.prepare(query).all(...params) })
})

app.put('/api/admin/bookings/:id/status', authMiddleware, adminMiddleware, (req, res) => {
  const { status, adminNotes } = req.body
  if (!['pending', 'approved', 'cancelled', 'completed'].includes(status)) {
    return res.status(400).json({ error: 'Estado inválido' })
  }
  const b = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id)
  if (!b) return res.status(404).json({ error: 'Reserva no encontrada' })

  const ts = now()
  if (adminNotes) {
    db.prepare('UPDATE bookings SET status = ?, adminNotes = ?, updatedAt = ? WHERE id = ?').run(status, adminNotes, ts, req.params.id)
  } else {
    db.prepare('UPDATE bookings SET status = ?, updatedAt = ? WHERE id = ?').run(status, ts, req.params.id)
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

// ─── DIGITAL PASS PAGE ───────────────────────────────
// Serves a beautiful standalone pass page that can be saved to home screen
const classTypeNames = { 'semi-grupal': 'Semi-grupal', 'duo': 'Dúo', 'privada': 'Privada', 'mat': 'MAT' }

app.get('/pass/:id', (req, res) => {
  const b = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id)
  if (!b) return res.status(404).send('<h1>Pase no encontrado</h1>')
  const user = db.prepare('SELECT name, surname FROM users WHERE id = ?').get(b.userId)
  const userName = user ? `${user.name} ${user.surname || ''}`.trim() : b.userName
  const passCode = b.id.toUpperCase().slice(-8)
  const timeLabel = b.time === '07:00' ? '7:00 AM' : '6:00 PM'
  const endTime = b.time === '07:00' ? '8:15 AM' : '7:15 PM'
  const dateObj = new Date(b.date + 'T12:00:00')
  const dayName = dateObj.toLocaleDateString('es-CR', { weekday: 'long' })
  const dateStr = dateObj.toLocaleDateString('es-CR', { day: 'numeric', month: 'long', year: 'numeric' })
  const className = classTypeNames[b.classType] || b.classType
  const isApproved = b.status === 'approved'
  const statusLabel = isApproved ? '✅ CONFIRMADA' : b.status === 'pending' ? '⏳ PENDIENTE' : '❌ ' + b.status.toUpperCase()
  const statusColor = isApproved ? '#34C759' : b.status === 'pending' ? '#FF9500' : '#FF3B30'
  const qrUrl = `https://pilatesbyriven.com/api/pass/${b.id}`

  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, user-scalable=no">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="Pilates Pass">
  <meta name="theme-color" content="#1A1A1A">
  <title>Pase - Pilates by Riven</title>
  <link rel="apple-touch-icon" href="/icons/icon-192.png">
  <script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif;
      background: #000; min-height: 100vh; min-height: 100dvh;
      display: flex; align-items: center; justify-content: center;
      padding: 20px; padding-top: env(safe-area-inset-top, 20px);
    }
    .pass {
      width: 100%; max-width: 380px; border-radius: 20px; overflow: hidden;
      box-shadow: 0 20px 60px rgba(0,0,0,0.5);
    }
    .pass-header {
      background: linear-gradient(135deg, #C19C80 0%, #A67D64 100%);
      padding: 24px 24px 16px; position: relative; overflow: hidden;
    }
    .pass-header::after {
      content: ''; position: absolute; top: -30px; right: -30px;
      width: 120px; height: 120px; border-radius: 50%;
      background: rgba(255,255,255,0.1);
    }
    .header-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; position: relative; z-index: 1; }
    .logo-area { display: flex; align-items: center; gap: 10px; }
    .logo-box {
      width: 36px; height: 36px; border-radius: 10px; background: rgba(255,255,255,0.2);
      display: flex; align-items: center; justify-content: center;
      font-weight: 800; font-size: 13px; color: white;
    }
    .brand-name { color: white; font-size: 14px; font-weight: 700; letter-spacing: 0.5px; }
    .brand-loc { color: rgba(255,255,255,0.6); font-size: 10px; }
    .status-badge {
      padding: 5px 14px; border-radius: 20px; font-size: 11px; font-weight: 700;
      background: rgba(255,255,255,0.2); color: white;
    }
    .notch {
      background: #fff; height: 18px; position: relative;
      display: flex; align-items: center;
    }
    .notch::before, .notch::after {
      content: ''; position: absolute; width: 22px; height: 22px;
      border-radius: 50%; background: #000; top: 50%; transform: translateY(-50%);
    }
    .notch::before { left: -11px; }
    .notch::after { right: -11px; }
    .notch-line {
      flex: 1; margin: 0 22px; border-top: 2px dashed rgba(0,0,0,0.08);
    }
    .pass-body { background: #fff; padding: 20px 24px 28px; }
    .class-label { color: #999; font-size: 9px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 4px; }
    .class-name { color: #1A1A1A; font-size: 26px; font-weight: 800; margin-bottom: 20px; }
    .details-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 24px; }
    .detail-box {
      background: #f5f3f0; border-radius: 12px; padding: 14px;
    }
    .detail-label { color: #999; font-size: 9px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 4px; }
    .detail-value { color: #1A1A1A; font-size: 15px; font-weight: 700; text-transform: capitalize; }
    .detail-sub { color: #999; font-size: 11px; margin-top: 2px; }
    .qr-section { text-align: center; padding: 16px 0 8px; }
    .qr-wrap {
      display: inline-block; padding: 16px; background: #fff;
      border-radius: 16px; border: 2px solid #f0ebe6;
      box-shadow: 0 2px 12px rgba(0,0,0,0.04);
    }
    .qr-hint { color: #bbb; font-size: 11px; margin-top: 10px; }
    .pass-footer {
      background: #f9f7f4; padding: 16px 24px; text-align: center;
      border-top: 1px solid #f0ebe6;
    }
    .footer-text { color: #C19C80; font-size: 11px; font-weight: 600; }
    .save-hint {
      text-align: center; margin-top: 20px; color: rgba(255,255,255,0.3);
      font-size: 12px; line-height: 1.6;
    }
    .save-hint strong { color: rgba(255,255,255,0.5); }
  </style>
</head>
<body>
  <div>
    <div class="pass">
      <div class="pass-header">
        <div class="header-top">
          <div class="logo-area">
            <div class="logo-box">PbR</div>
            <div>
              <div class="brand-name">PILATES BY RIVEN</div>
              <div class="brand-loc">Costa Rica</div>
            </div>
          </div>
          <div class="status-badge" style="color:${statusColor}">${statusLabel}</div>
        </div>
      </div>
      <div class="notch"><div class="notch-line"></div></div>
      <div class="pass-body">
        <div class="class-label">Clase</div>
        <div class="class-name">${className}</div>
        <div class="details-grid">
          <div class="detail-box">
            <div class="detail-label">Fecha</div>
            <div class="detail-value">${dayName}</div>
            <div class="detail-sub">${dateStr}</div>
          </div>
          <div class="detail-box">
            <div class="detail-label">Horario</div>
            <div class="detail-value">${timeLabel}</div>
            <div class="detail-sub">hasta ${endTime}</div>
          </div>
          <div class="detail-box">
            <div class="detail-label">Cliente</div>
            <div class="detail-value">${userName}</div>
          </div>
          <div class="detail-box">
            <div class="detail-label">Código</div>
            <div class="detail-value" style="font-family:monospace;letter-spacing:2px">${passCode}</div>
          </div>
        </div>
        <div class="qr-section">
          <div class="qr-wrap" id="qr"></div>
          <div class="qr-hint">Muestra este código en la entrada</div>
        </div>
      </div>
      <div class="pass-footer">
        <div class="footer-text">pilatesbyriven.com</div>
      </div>
    </div>
    <div class="save-hint">
      <strong>iPhone:</strong> Toca <span style="font-size:16px">⬆️</span> → "Agregar a Inicio"<br>
      <strong>Android:</strong> Toca ⋮ → Compartir → "Agregar a pantalla"
    </div>
  </div>
  <script>
    var qr = qrcode(0, 'M');
    qr.addData('${qrUrl}');
    qr.make();
    document.getElementById('qr').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0 });
  </script>
</body>
</html>`)
})

// ─── SERVE FRONTEND IN PRODUCTION ─────────────────────
if (process.env.NODE_ENV === 'production') {
  const distPath = join(__dirname, '..', 'dist')
  app.use(express.static(distPath))
  app.get('*', (_req, res) => res.sendFile(join(distPath, 'index.html')))
}

// ─── START ────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Pilates by Riven API running on port ${PORT}`)
})
