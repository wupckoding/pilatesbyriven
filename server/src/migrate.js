import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { config } from './config.js'
import { pool } from './db.js'

const dir = join(config.root, 'migrations')

export async function migrate({ log = console.log } = {}) {
  const client = await pool.connect()
  try {
    // Evita que dos procesos migren a la vez.
    await client.query('select pg_advisory_lock(727001)')
    await client.query(`create table if not exists schema_migrations (
      name text primary key, applied_at timestamptz not null default now())`)
    const done = new Set((await client.query('select name from schema_migrations')).rows.map((r) => r.name))
    const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
    for (const file of files) {
      if (done.has(file)) continue
      const sql = readFileSync(join(dir, file), 'utf8')
      await client.query('BEGIN')
      try {
        await client.query(sql)
        await client.query('insert into schema_migrations (name) values ($1)', [file])
        await client.query('COMMIT')
        log(`migración aplicada: ${file}`)
      } catch (err) {
        await client.query('ROLLBACK')
        throw new Error(`Falló la migración ${file}: ${err.message}`)
      }
    }
  } finally {
    await client.query('select pg_advisory_unlock(727001)').catch(() => {})
    client.release()
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  migrate().then(() => pool.end()).catch((err) => { console.error(err.message); process.exit(1) })
}
