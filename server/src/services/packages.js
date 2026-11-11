import { HttpError } from '../lib/http.js'
import { audit } from '../lib/audit.js'
import { todayCR } from '../lib/time.js'
import { getSettings } from './settings.js'

/**
 * Créditos de un paquete (siempre calculados, nunca guardados):
 *   usados     = clases tomadas (asistió / repuso) + ausencias y cancelaciones tardías si la regla las cobra
 *   reservados = reservas vivas aún sin asistencia
 *   disponibles = total − usados − reservados
 * Así un crédito no puede usarse dos veces y una cancelación con aviso lo devuelve sola.
 */
export function packageSelect({ absentConsumesCredit, lateCancelConsumesCredit }) {
  const absent = absentConsumesCredit ? 'true' : 'false'
  const late = lateCancelConsumesCredit ? 'true' : 'false'
  return `
    select p.id, p.client_id, p.product_id, p.name, p.kind, p.price_cents, p.currency, p.sessions_total,
           p.starts_on, p.expires_on, p.hold_until, p.group_id, p.created_at, p.activated_at,
           p.exception_reason, p.cancel_reason, p.extension_reason, p.status as stored_status,
           case when p.status = 'active' and p.expires_on < $1::date then 'expired' else p.status end as status,
           c.full_name, c.student_number, c.whatsapp,
           g.name as group_name,
           coalesce(pay.paid, 0)::int as paid_cents,
           coalesce(pay.to_verify, 0)::int as to_verify_cents,
           greatest(p.price_cents - coalesce(pay.paid, 0), 0)::int as balance_cents,
           coalesce(bk.used, 0)::int as used,
           coalesce(bk.reserved, 0)::int as reserved,
           greatest(p.sessions_total - coalesce(bk.used, 0) - coalesce(bk.reserved, 0), 0)::int as available
      from client_packages p
      join clients c on c.id = p.client_id
      left join class_groups g on g.id = p.group_id
      left join lateral (
        select sum(case when y.status = 'verified' and y.kind = 'payment' then y.applied_cents
                        when y.status = 'verified' and y.kind = 'refund' then -y.applied_cents else 0 end) as paid,
               sum(case when y.status = 'to_verify' and y.kind = 'payment' then y.applied_cents else 0 end) as to_verify
          from payments y where y.package_id = p.id
      ) pay on true
      left join lateral (
        select count(*) filter (where b.attendance in ('attended','made_up')
                                   or (b.attendance = 'absent' and ${absent})
                                   or (b.attendance = 'cancelled_late' and ${late})) as used,
               -- Si el estudio cancela la clase, el crédito vuelve solo (se puede reponer en otra fecha).
               count(*) filter (where b.status in ('pending','confirmed') and b.attendance is null and s.status = 'scheduled') as reserved
          from bookings b join class_sessions s on s.id = b.session_id where b.package_id = p.id
      ) bk on true`
}

/** Paquetes con saldo y créditos. `where` usa $2 en adelante ($1 es la fecha de hoy). */
export async function listPackages(q, where = '', params = [], tail = 'order by p.created_at desc') {
  const settings = await getSettings(q)
  return q.query(`${packageSelect(settings)} ${where} ${tail}`, [todayCR(), ...params])
}

export async function getPackage(q, id) {
  return (await listPackages(q, 'where p.id = $2', [id]))[0] || null
}

/**
 * Activa el paquete cuando lo cobrado y verificado cubre el precio. Es idempotente:
 * repetir la verificación o registrar otro pago no vuelve a confirmar nada.
 */
export async function settlePackage(t, packageId, actor) {
  const locked = await t.one('select id, status from client_packages where id = $1 for update', [packageId])
  if (!locked || locked.status !== 'pending_payment') return false
  const pkg = await getPackage(t, packageId)
  if (pkg.paidCents < pkg.priceCents) return false
  await activate(t, pkg, actor)
  return true
}

export async function activate(t, pkg, actor, exceptionReason = '') {
  await t.run(
    `update client_packages set status = 'active', activated_at = now(), activated_by = $2,
            exception_reason = $3, hold_until = null, updated_at = now() where id = $1`,
    [pkg.id, actor?.id || null, exceptionReason])
  // Las clases retenidas quedan confirmadas junto con el paquete.
  await t.run(
    `update bookings set status = 'confirmed', updated_at = now() where package_id = $1 and status = 'pending'`, [pkg.id])
  await t.run(
    `update clients set status = 'active', updated_at = now()
      where id = $1 and status in ('interested','trial_scheduled','inactive') and $2 = 'package'`,
    [pkg.clientId, pkg.kind])
  await audit(t, actor?.id, 'package.activate', 'package', pkg.id, { exceptionReason: exceptionReason || undefined })
}

/**
 * Elige y BLOQUEA el paquete que cubrirá una reserva en `localDate`.
 * El bloqueo de fila evita que dos reservas simultáneas gasten el mismo último crédito.
 */
export async function claimPackageCredit(t, { clientId, localDate, packageId = null }) {
  const candidates = await t.query(
    `select id from client_packages
      where client_id = $1 and ($3::uuid is null or id = $3)
        and status in ('active','pending_payment')
        and starts_on <= $2::date and expires_on >= $2::date
      order by expires_on, created_at
      for update`,
    [clientId, localDate, packageId])
  for (const candidate of candidates) {
    const pkg = await getPackage(t, candidate.id)
    // Un paquete sin pagar solo cubre reservas pedidas expresamente para él (la renovación).
    if (pkg.storedStatus === 'pending_payment' && packageId !== pkg.id) continue
    if (pkg.available > 0) return pkg
  }
  if (packageId) throw new HttpError(409, 'El paquete no tiene créditos disponibles para esa fecha', 'NO_CREDIT')
  return null
}
