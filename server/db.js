import Database from 'better-sqlite3'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dbPath = join(__dirname, 'pilates.db')

const db = new Database(dbPath)

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// ─── MIGRATIONS ─────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    surname TEXT NOT NULL DEFAULT '',
    email TEXT UNIQUE NOT NULL,
    phone TEXT DEFAULT '',
    password TEXT NOT NULL,
    role TEXT DEFAULT 'user' CHECK(role IN ('user','admin')),
    objective TEXT DEFAULT '',
    profileLevel TEXT DEFAULT 'beginner',
    restrictions TEXT DEFAULT '',
    provider TEXT DEFAULT NULL,
    createdAt TEXT NOT NULL,
    updatedAt TEXT DEFAULT NULL
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    userName TEXT NOT NULL DEFAULT '',
    userPhone TEXT DEFAULT '',
    userEmail TEXT DEFAULT '',
    classType TEXT NOT NULL CHECK(classType IN ('semi-grupal','duo','privada','mat')),
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    notes TEXT DEFAULT '',
    equipment TEXT DEFAULT 'reformer',
    isTrial INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','cancelled','completed')),
    adminNotes TEXT DEFAULT '',
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    FOREIGN KEY (userId) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS schedules (
    id TEXT PRIMARY KEY,
    classType TEXT NOT NULL CHECK(classType IN ('semi-grupal','duo','privada','mat')),
    dayOfWeek INTEGER DEFAULT NULL CHECK(dayOfWeek >= 0 AND dayOfWeek <= 6),
    specificDate TEXT DEFAULT NULL,
    time TEXT NOT NULL,
    maxSpots INTEGER NOT NULL DEFAULT 3,
    price REAL NOT NULL DEFAULT 0,
    isActive INTEGER NOT NULL DEFAULT 1,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS waitlist (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    userName TEXT NOT NULL DEFAULT '',
    userPhone TEXT DEFAULT '',
    userEmail TEXT DEFAULT '',
    classType TEXT NOT NULL CHECK(classType IN ('semi-grupal','duo','privada','mat')),
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','promoted','cancelled')),
    notes TEXT DEFAULT '',
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    FOREIGN KEY (userId) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS schedule_blocks (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    time TEXT DEFAULT NULL,
    classType TEXT DEFAULT NULL,
    reason TEXT DEFAULT '',
    isActive INTEGER NOT NULL DEFAULT 1,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS coupons (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    discountPercent REAL NOT NULL DEFAULT 0,
    isActive INTEGER NOT NULL DEFAULT 1,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_bookings_userId ON bookings(userId);
  CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(date);
  CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
  CREATE INDEX IF NOT EXISTS idx_bookings_date_time ON bookings(date, time);
  CREATE INDEX IF NOT EXISTS idx_schedules_day_time ON schedules(dayOfWeek, time);
  CREATE INDEX IF NOT EXISTS idx_schedules_specific_date ON schedules(specificDate, time);
  CREATE INDEX IF NOT EXISTS idx_schedules_active ON schedules(isActive);
  CREATE INDEX IF NOT EXISTS idx_waitlist_slot ON waitlist(date, time, classType, status);
  CREATE INDEX IF NOT EXISTS idx_waitlist_user ON waitlist(userId, status);
  CREATE INDEX IF NOT EXISTS idx_schedule_blocks_date ON schedule_blocks(date, isActive);
  CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);
`)

const tableHasColumn = (tableName, columnName) => {
  const cols = db.prepare(`PRAGMA table_info(${tableName})`).all()
  return cols.some((col) => col.name === columnName)
}

if (!tableHasColumn('bookings', 'priceAtBooking')) {
  db.exec('ALTER TABLE bookings ADD COLUMN priceAtBooking REAL DEFAULT 0')
}

if (!tableHasColumn('bookings', 'reminder24Sent')) {
  db.exec('ALTER TABLE bookings ADD COLUMN reminder24Sent INTEGER DEFAULT 0')
}

if (!tableHasColumn('bookings', 'reminder2Sent')) {
  db.exec('ALTER TABLE bookings ADD COLUMN reminder2Sent INTEGER DEFAULT 0')
}

if (!tableHasColumn('bookings', 'isNoShow')) {
  db.exec('ALTER TABLE bookings ADD COLUMN isNoShow INTEGER DEFAULT 0')
}

if (!tableHasColumn('bookings', 'couponCode')) {
  db.exec("ALTER TABLE bookings ADD COLUMN couponCode TEXT DEFAULT ''")
}

if (!tableHasColumn('bookings', 'discountPercent')) {
  db.exec('ALTER TABLE bookings ADD COLUMN discountPercent REAL DEFAULT 0')
}

if (!tableHasColumn('bookings', 'discountAmount')) {
  db.exec('ALTER TABLE bookings ADD COLUMN discountAmount REAL DEFAULT 0')
}

if (!tableHasColumn('users', 'objective')) {
  db.exec("ALTER TABLE users ADD COLUMN objective TEXT DEFAULT ''")
}

if (!tableHasColumn('users', 'profileLevel')) {
  db.exec("ALTER TABLE users ADD COLUMN profileLevel TEXT DEFAULT 'beginner'")
}

if (!tableHasColumn('users', 'restrictions')) {
  db.exec("ALTER TABLE users ADD COLUMN restrictions TEXT DEFAULT ''")
}

const defaultSettings = [
  { key: 'cancelWindowHours', value: '8' },
  { key: 'noShowGraceMinutes', value: '20' },
]

for (const setting of defaultSettings) {
  db.prepare(
    `INSERT OR IGNORE INTO settings (key, value, updatedAt) VALUES (?, ?, datetime('now'))`
  ).run(setting.key, setting.value)
}

export default db
