import pg from 'pg'
import { config } from './config.js'

// date y time llegan como texto ("2026-11-11", "18:00:00"): nunca pasan por la zona horaria del servidor.
pg.types.setTypeParser(1082, (v) => v)
pg.types.setTypeParser(1083, (v) => v.slice(0, 5))
pg.types.setTypeParser(20, (v) => Number(v)) // bigint / count(*)

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 })

const toCamel = (key) => key.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
export const camel = (row) => {
  if (!row) return row
  const out = {}
  for (const key of Object.keys(row)) out[toCamel(key)] = row[key]
  return out
}

const wrap = (client) => ({
  async query(text, params) {
    const res = await client.query(text, params)
    return res.rows.map(camel)
  },
  async one(text, params) {
    const res = await client.query(text, params)
    return camel(res.rows[0]) || null
  },
  async run(text, params) {
    const res = await client.query(text, params)
    return res.rowCount
  },
})

export const db = wrap(pool)

/** Ejecuta fn dentro de una transacción; hace rollback si lanza. */
export async function tx(fn) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(wrap(client))
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}
