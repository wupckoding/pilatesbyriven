import { db } from '../db.js'
import { addDays, todayCR } from '../lib/time.js'

export const DEFAULT_HORIZON_WEEKS = 8

/**
 * Crea las sesiones con fecha concreta de cada grupo activo. Es idempotente:
 * (group_id, original_date) es único, así que repetirla no duplica ni revive sesiones movidas.
 */
export async function generateSessions(q = db, { from = todayCR(), weeks = DEFAULT_HORIZON_WEEKS } = {}) {
  const to = addDays(from, weeks * 7)
  return q.run(
    `insert into class_sessions
       (group_id, original_date, local_date, local_time, starts_at, name, modality, kind,
        duration_min, capacity, instructor_id, open_booking)
     select g.id, d::date, d::date, g.start_time,
            (d::date + g.start_time) at time zone 'America/Costa_Rica',
            g.name, g.modality, g.kind, g.duration_min, g.capacity, g.instructor_id, g.open_booking
       from class_groups g
      cross join generate_series($1::date, $2::date, interval '1 day') d
      where g.is_active
        and extract(dow from d) = g.weekday
        and d::date >= g.starts_on
        and (g.ends_on is null or d::date <= g.ends_on)
     on conflict (group_id, original_date) do nothing`,
    [from, to],
  )
}

/** Sesiones de un rango con ocupación. `where`/`params` permiten filtros extra ($1 y $2 son el rango). */
export const SESSION_SELECT = `
  select s.id, s.group_id, s.local_date, s.local_time, s.starts_at, s.name, s.modality, s.kind,
         s.duration_min, s.capacity, s.instructor_id, s.open_booking, s.status, s.cancel_reason, s.is_override,
         u.full_name as instructor_name,
         coalesce(o.taken, 0)::int as taken,
         coalesce(o.waitlisted, 0)::int as waitlisted,
         exists (
           select 1 from schedule_blocks k
            where s.local_date between k.starts_on and k.ends_on
              and (k.start_time is null or s.local_time >= k.start_time)
              and (k.end_time is null or s.local_time < k.end_time)
         ) as blocked
    from class_sessions s
    left join users u on u.id = s.instructor_id
    left join lateral (
      select count(*) filter (where b.status in ('pending','confirmed')) as taken,
             count(*) filter (where b.status = 'waitlisted') as waitlisted
        from bookings b where b.session_id = s.id
    ) o on true`
