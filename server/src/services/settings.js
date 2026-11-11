import { db } from '../db.js'

// Valores por defecto tomados del documento de requisitos; todo es editable desde Ajustes.
export const SETTING_DEFAULTS = {
  cancelWindowHours: 8,
  renewalNoticeDays: 3,
  monthlyPackagesGoal: 30,
  savingsGoalMonthCents: 150000,   // US$1.500
  savingsGoalTotalCents: 1800000,  // US$18.000 (Lindora)
  studioWhatsapp: '+50685438378',
}

export async function getSettings(q = db) {
  const rows = await q.query('select key, value from settings')
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  return { ...SETTING_DEFAULTS, ...stored }
}

export async function saveSettings(q, patch) {
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in SETTING_DEFAULTS)) continue
    await q.run(
      `insert into settings (key, value) values ($1, $2::jsonb)
       on conflict (key) do update set value = excluded.value, updated_at = now()`,
      [key, JSON.stringify(value)])
  }
  return getSettings(q)
}
