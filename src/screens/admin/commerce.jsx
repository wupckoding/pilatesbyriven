// Piezas compartidas de paquetes y pagos: vender / renovar, registrar pago y detalle del paquete.
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, CircleDollarSign, MessageCircle, Search } from 'lucide-react'
import { api } from '../../lib/api'
import {
  ATTENDANCE, BOOKING_STATUS, METHOD, PACKAGE_STATUS, PAYMENT_STATUS, PRODUCT_KIND, addDays, capitalize, firstName,
  fmtDate, fmtMoney, fmtTime, newKey, parseMoney, todayCR, waLink,
} from '../../lib/format'
import { Avatar, Badge, Button, Card, ErrorState, Field, Input, Select, SkeletonList, Textarea, cx } from '../../ui'
import Sheet from '../../ui/Sheet'
import { useToast } from '../../ui/Toast'

const MONEY_KEYS = ['packages', 'package', 'payments', 'caja', 'dashboard', 'client', 'clients', 'agenda', 'session', 'expenses', 'transfers', 'admin-bookings']
export const useRefreshMoney = () => {
  const qc = useQueryClient()
  return () => Promise.all(MONEY_KEYS.map((key) => qc.invalidateQueries({ queryKey: [key] })))
}

const shortDate = (ymd) => fmtDate(ymd, { day: 'numeric', month: 'short' }).replace('.', '')
const ErrorNote = ({ error }) => (error && !error.data?.field
  ? <p className="rounded-2xl bg-terracotta-soft px-4 py-3 text-sm font-medium text-terracotta" role="alert">{error.message}</p>
  : null)

/** Créditos del paquete: una barra por clase (tomadas, reservadas, disponibles). */
export function Credits({ pkg, dark = false }) {
  const bars = Array.from({ length: Math.min(pkg.sessionsTotal, 12) }, (_, i) => (i < pkg.used ? 'used' : i < pkg.used + pkg.reserved ? 'reserved' : 'free'))
  const colors = dark
    ? { used: 'bg-white/30', reserved: 'bg-clay', free: 'bg-white' }
    : { used: 'bg-ink/25', reserved: 'bg-clay', free: 'bg-sage' }
  return (
    <div>
      <div className="flex gap-1" role="img" aria-label={`${pkg.used} tomadas, ${pkg.reserved} reservadas, ${pkg.available} disponibles de ${pkg.sessionsTotal}`}>
        {bars.map((state, i) => <span key={i} className={cx('h-1.5 flex-1 rounded-full', colors[state])} />)}
      </div>
      <p className={cx('tnum mt-2 text-[13px]', dark ? 'text-white/70' : 'text-ink-3')}>
        {pkg.used} {pkg.used === 1 ? 'tomada' : 'tomadas'} · {pkg.reserved} {pkg.reserved === 1 ? 'reservada' : 'reservadas'} ·{' '}
        <strong className={cx('font-semibold', dark ? 'text-white' : 'text-ink')}>{pkg.available} {pkg.available === 1 ? 'disponible' : 'disponibles'}</strong>
      </p>
    </div>
  )
}

// ─── Buscar clienta ──────────────────────────────────────
function ClientPicker({ onPick }) {
  const [search, setSearch] = useState('')
  const term = search.trim()
  const results = useQuery({
    queryKey: ['clients', { search: term, limit: 8 }],
    queryFn: () => api.get('/admin/clients', { search: term, limit: 8 }),
    enabled: term.length >= 2,
  })
  return (
    <div>
      <Field label="Clienta">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden="true" />
          <Input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nombre, WhatsApp o ID" className="pl-11" />
        </div>
      </Field>
      {term.length >= 2 && (
        <ul className="mt-2 divide-y divide-line rounded-2xl border border-line bg-surface">
          {results.isLoading && <li className="px-4 py-3 text-sm text-ink-3">Buscando…</li>}
          {results.data?.clients.length === 0 && <li className="px-4 py-3 text-sm text-ink-3">Sin resultados.</li>}
          {results.data?.clients.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => onPick(c)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-clay-soft/40">
                <Avatar name={c.fullName} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">{c.fullName}</span>
                  <span className="tnum block text-xs text-ink-3">{c.studentCode}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── Vender o renovar ────────────────────────────────────
/**
 * Paso 1 de la renovación: producto, ciclo, grupo fijo y fechas reales.
 * Las fechas se revisan aquí antes de comunicarlas; el cupo se retiene hasta la fecha límite.
 */
export function SellPackageSheet({ client: initialClient, onClose, onCreated }) {
  const toast = useToast()
  const refresh = useRefreshMoney()
  const today = todayCR()
  const [client, setClient] = useState(initialClient || null)
  const [form, setForm] = useState({ productId: '', startsOn: today, groupId: initialClient?.homeGroupId || '', price: '', holdUntil: '' })
  const [picked, setPicked] = useState([])
  const [error, setError] = useState(null)
  const touchedDates = useRef(false)

  const products = useQuery({ queryKey: ['products'], queryFn: () => api.get('/admin/products') })
  const groups = useQuery({ queryKey: ['groups'], queryFn: () => api.get('/admin/groups') })
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api.get('/admin/settings') })
  const active = (products.data?.products || []).filter((p) => p.isActive)
  const product = active.find((p) => p.id === form.productId)
  const expiresOn = product ? addDays(form.startsOn, product.validityDays - 1) : null

  // Valores iniciales: paquete mensual y retención según la regla del estudio.
  useEffect(() => {
    if (!form.productId && active.length) {
      const first = active.find((p) => p.kind === 'package') || active[0]
      setForm((f) => ({ ...f, productId: first.id }))
    }
  }, [active, form.productId])
  useEffect(() => {
    if (settings.data && !form.holdUntil) setForm((f) => ({ ...f, holdUntil: addDays(today, settings.data.settings.holdDays) }))
  }, [settings.data, form.holdUntil, today])

  const upcoming = useQuery({
    queryKey: ['group-upcoming', form.groupId, form.startsOn, expiresOn],
    queryFn: () => api.get(`/admin/groups/${form.groupId}/upcoming`, { from: form.startsOn, to: expiresOn }),
    enabled: !!form.groupId && !!expiresOn,
  })
  const sessions = upcoming.data?.sessions || []

  // Propone las primeras fechas con cupo; un mes con cinco ocurrencias sigue incluyendo las del paquete.
  useEffect(() => {
    if (!product || touchedDates.current) return
    setPicked(sessions.filter((s) => s.taken < s.capacity).slice(0, product.sessionsCount).map((s) => s.id))
  }, [upcoming.data, product]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }))
    setError(null)
    if (['productId', 'startsOn', 'groupId'].includes(key)) touchedDates.current = false
  }
  const toggle = (id) => {
    touchedDates.current = true
    setPicked((list) => (list.includes(id) ? list.filter((x) => x !== id) : list.length < product.sessionsCount ? [...list, id] : list))
  }
  const fieldError = (name) => (error?.data?.field === name ? error.message : undefined)

  const customPrice = form.price.trim() ? parseMoney(form.price) : undefined
  const create = useMutation({
    mutationFn: () => {
      if (customPrice === null) throw Object.assign(new Error('Precio inválido'), { data: { field: 'priceCents' } })
      return api.post('/admin/packages', {
        clientId: client.id, productId: form.productId, startsOn: form.startsOn,
        groupId: form.groupId || null, sessionIds: picked, holdUntil: form.holdUntil || null,
        ...(customPrice !== undefined ? { priceCents: customPrice } : {}),
      })
    },
    onSuccess: async ({ package: pkg }) => {
      await refresh()
      toast.success(picked.length ? 'Paquete creado y cupos retenidos' : 'Paquete creado')
      onClose()
      onCreated?.(pkg)
    },
    onError: async (err) => {
      setError(err)
      if (err.code === 'SESSION_FULL') { touchedDates.current = true; upcoming.refetch() }
    },
  })

  return (
    <Sheet
      open
      onClose={onClose}
      size="lg"
      title={client ? `Paquete para ${firstName(client.fullName)}` : 'Vender paquete'}
      subtitle="El paquete queda por cobrar y los cupos se retienen hasta la fecha límite."
      footer={client && (
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button loading={create.isPending} disabled={!product} onClick={() => create.mutate()}>Crear paquete</Button>
        </>
      )}
    >
      {!client ? <ClientPicker onPick={(c) => { setClient(c); setForm((f) => ({ ...f, groupId: '' })) }} /> : (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); create.mutate() }}>
          {!initialClient && (
            <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3">
              <Avatar name={client.fullName} size="sm" />
              <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{client.fullName}</p>
              <button type="button" className="text-[13px] font-semibold text-clay-deep" onClick={() => setClient(null)}>Cambiar</button>
            </div>
          )}
          <Field label="Producto">
            <Select value={form.productId} onChange={set('productId')}>
              {active.map((p) => <option key={p.id} value={p.id}>{p.name} · {fmtMoney(p.priceCents, p.currency)}</option>)}
            </Select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Inicio del ciclo" hint={expiresOn ? `Vence el ${fmtDate(expiresOn, { day: 'numeric', month: 'long' })}.` : undefined}>
              <Input type="date" value={form.startsOn} onChange={set('startsOn')} />
            </Field>
            <Field label="Precio acordado" optional hint={product ? `Catálogo: ${fmtMoney(product.priceCents, product.currency)}` : undefined} error={fieldError('priceCents')}>
              <Input inputMode="decimal" value={form.price} onChange={set('price')} placeholder={product ? String(product.priceCents / 100) : ''} />
            </Field>
            <Field label="Grupo fijo" optional>
              <Select value={form.groupId} onChange={set('groupId')}>
                <option value="">Sin grupo: asignar clases después</option>
                {groups.data?.groups.filter((g) => g.isActive).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </Select>
            </Field>
            <Field label="Retener cupos hasta" hint="Después de esta fecha la app te avisa.">
              <Input type="date" min={today} value={form.holdUntil} onChange={set('holdUntil')} />
            </Field>
          </div>

          {form.groupId && product && (
            <div>
              <div className="mb-1.5 flex items-baseline justify-between">
                <p className="text-[13px] font-semibold text-ink-2">Fechas del ciclo</p>
                <p className="tnum text-[13px] text-ink-3">{picked.length} de {product.sessionsCount}</p>
              </div>
              {upcoming.isLoading && <SkeletonList count={2} className="h-12" />}
              {upcoming.data && sessions.length === 0 && (
                <p className="rounded-2xl border border-dashed border-line px-4 py-4 text-sm text-ink-3">Este grupo no tiene clases en la vigencia del paquete.</p>
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                {sessions.map((s) => {
                  const on = picked.includes(s.id)
                  const full = s.taken >= s.capacity
                  const locked = !on && (full || picked.length >= product.sessionsCount)
                  return (
                    <button
                      key={s.id}
                      type="button"
                      disabled={locked}
                      aria-pressed={on}
                      onClick={() => toggle(s.id)}
                      className={cx(
                        'flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors',
                        on ? 'border-ink bg-ink text-surface' : 'border-line bg-surface text-ink hover:border-clay',
                        locked && 'cursor-not-allowed opacity-45 hover:border-line',
                      )}
                    >
                      <span className={cx('flex h-5 w-5 shrink-0 items-center justify-center rounded-full border', on ? 'border-transparent bg-clay text-espresso' : 'border-line')}>
                        {on && <Check className="h-3 w-3" aria-hidden="true" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">{capitalize(fmtDate(s.localDate, { weekday: 'short', day: 'numeric', month: 'short' }))}</span>
                        <span className={cx('tnum block text-xs', on ? 'text-white/70' : 'text-ink-3')}>{fmtTime(s.localTime)} · {full ? 'Llena' : `${s.taken} de ${s.capacity}`}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
              {sessions.length > product.sessionsCount && (
                <p className="mt-2 text-[13px] text-ink-3">Hay más fechas que clases incluidas: la que sobra puede servir para reposiciones.</p>
              )}
            </div>
          )}
          <ErrorNote error={error} />
          <button type="submit" hidden />
        </form>
      )}
    </Sheet>
  )
}

// ─── Registrar pago ──────────────────────────────────────
/** Paso 2: registrar o dejar por verificar un pago. La misma clave evita cobros duplicados por doble toque. */
export function PaymentSheet({ clientId, clientName, pkg, onClose }) {
  const toast = useToast()
  const refresh = useRefreshMoney()
  const today = todayCR()
  const key = useRef(newKey())
  const [form, setForm] = useState({
    amount: pkg ? String(pkg.balanceCents / 100) : '', currency: pkg?.currency || 'USD', method: 'sinpe',
    reference: '', receivedOn: today, verified: 'yes', fxRate: '', note: '',
  })
  const [error, setError] = useState(null)
  const set = (name) => (e) => { setForm((f) => ({ ...f, [name]: e.target.value })); setError(null); setOverOk(false) }
  const fieldError = (name) => (error?.data?.field === name ? error.message : undefined)

  const amountCents = parseMoney(form.amount)
  const otherCurrency = pkg && form.currency !== pkg.currency
  const fx = Number(form.fxRate)
  const applied = !otherCurrency ? amountCents : (amountCents && fx > 0 ? Math.round(pkg.currency === 'USD' ? amountCents / fx : amountCents * fx) : null)
  const remaining = pkg && applied !== null ? pkg.balanceCents - applied : null
  const over = remaining !== null && remaining < 0 ? -remaining : 0
  const [overOk, setOverOk] = useState(false)

  const save = useMutation({
    mutationFn: () => {
      if (!amountCents) throw Object.assign(new Error('Escribe un monto válido'), { data: { field: 'amountCents' } })
      if (over > 0 && !overOk) {
        setOverOk(true)
        throw new Error(`Este pago supera el saldo en ${fmtMoney(over, pkg.currency)}. Si es correcto, toca "Guardar de todos modos".`)
      }
      return api.post('/admin/payments', {
        clientId, packageId: pkg?.id || null, amountCents, currency: form.currency, method: form.method,
        reference: form.reference.trim(), receivedOn: form.receivedOn, verified: form.verified === 'yes',
        fxRate: otherCurrency ? (fx > 0 ? fx : null) : null, note: form.note.trim(), idempotencyKey: key.current,
      })
    },
    onSuccess: async ({ package: updated }) => {
      await refresh()
      toast.success(updated?.status === 'active' && pkg?.status === 'pending_payment' ? 'Pago registrado: paquete activo y clases confirmadas' : form.verified === 'yes' ? 'Pago registrado' : 'Pago guardado por verificar')
      onClose()
    },
    onError: setError,
  })

  return (
    <Sheet
      open
      onClose={onClose}
      title="Registrar pago"
      subtitle={[clientName, pkg && `${pkg.name} · saldo ${fmtMoney(pkg.balanceCents, pkg.currency)}`].filter(Boolean).join(' · ')}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>{over > 0 && overOk ? 'Guardar de todos modos' : 'Guardar pago'}</Button>
        </>
      )}
    >
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate() }}>
        <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-3">
          <Field label="Monto recibido" error={fieldError('amountCents')}>
            <Input inputMode="decimal" value={form.amount} onChange={set('amount')} placeholder="0.00" autoFocus />
          </Field>
          <Field label="Moneda">
            <Select value={form.currency} onChange={set('currency')}>
              <option value="USD">USD</option>
              <option value="CRC">CRC ₡</option>
            </Select>
          </Field>
        </div>
        {otherCurrency && (
          <Field label="Tipo de cambio (colones por dólar)" hint={applied ? `Se aplican ${fmtMoney(applied, pkg.currency)} al paquete.` : 'Se guarda para poder explicar el total.'} error={fieldError('fxRate')}>
            <Input inputMode="decimal" value={form.fxRate} onChange={set('fxRate')} placeholder="510" />
          </Field>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Medio de pago">
            <Select value={form.method} onChange={set('method')}>
              {Object.entries(METHOD).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
          </Field>
          <Field label="Fecha en que entró el dinero" error={fieldError('receivedOn')}>
            <Input type="date" max={today} value={form.receivedOn} onChange={set('receivedOn')} />
          </Field>
          <Field label="Referencia" optional>
            <Input value={form.reference} onChange={set('reference')} placeholder="N.º de SINPE o comprobante" maxLength={120} />
          </Field>
          <Field label="Estado">
            <Select value={form.verified} onChange={set('verified')}>
              <option value="yes">Verificado: ya lo confirmé</option>
              <option value="no">Por verificar</option>
            </Select>
          </Field>
        </div>
        <Field label="Nota" optional>
          <Input value={form.note} onChange={set('note')} maxLength={500} />
        </Field>
        {pkg && remaining !== null && amountCents > 0 && (
          <p className={cx('rounded-2xl px-4 py-3 text-sm font-medium', remaining === 0 ? 'bg-sage-soft text-sage' : 'bg-honey-soft text-honey')}>
            {over > 0
              ? `Ojo: el monto supera el saldo (${fmtMoney(pkg.balanceCents, pkg.currency)}) por ${fmtMoney(over, pkg.currency)}.`
              : remaining <= 0
              ? (form.verified === 'yes' ? 'Con este pago el paquete queda cubierto y sus clases se confirman.' : 'Al verificarlo, el paquete quedará cubierto.')
              : `Pago parcial: quedará un saldo de ${fmtMoney(remaining, pkg.currency)}.`}
          </p>
        )}
        <ErrorNote error={error} />
        <button type="submit" hidden />
      </form>
    </Sheet>
  )
}

/**
 * Corregir un pago mal registrado. Fecha, medio, referencia y nota siempre; el monto solo mientras
 * no esté verificado. Anular lo deja en el historial, pero fuera de saldos y de Caja.
 */
export function PaymentFixSheet({ payment: y, onClose }) {
  const toast = useToast()
  const refresh = useRefreshMoney()
  const today = todayCR()
  const refund = y.kind === 'refund'
  const amountEditable = !refund && y.status !== 'verified'
  const [form, setForm] = useState({
    amount: String(y.amountCents / 100), currency: y.currency, fxRate: y.fxRate ? String(Number(y.fxRate)) : '',
    method: y.method, reference: y.reference || '', receivedOn: y.receivedOn || today, note: y.note || '',
  })
  const [voiding, setVoiding] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState(null)
  const set = (name) => (e) => { setForm((f) => ({ ...f, [name]: e.target.value })); setError(null) }
  const fieldError = (name) => (error?.data?.field === name ? error.message : undefined)
  const otherCurrency = y.packageId && y.packageCurrency && form.currency !== y.packageCurrency

  const save = useMutation({
    mutationFn: () => {
      const body = { method: form.method, reference: form.reference.trim(), receivedOn: form.receivedOn, note: form.note.trim() }
      if (amountEditable) {
        const amountCents = parseMoney(form.amount)
        if (!amountCents) throw Object.assign(new Error('Escribe un monto válido'), { data: { field: 'amountCents' } })
        const fx = Number(form.fxRate)
        Object.assign(body, { amountCents, currency: form.currency, fxRate: otherCurrency ? (fx > 0 ? fx : null) : null })
      }
      return api.patch(`/admin/payments/${y.id}`, body)
    },
    onSuccess: async () => { await refresh(); toast.success('Pago corregido'); onClose() },
    onError: setError,
  })
  const voidIt = useMutation({
    mutationFn: () => api.post(`/admin/payments/${y.id}/void`, { reason }),
    onSuccess: async () => { await refresh(); toast.success(refund ? 'Reembolso anulado' : 'Pago anulado'); onClose() },
  })

  return (
    <Sheet
      open
      onClose={onClose}
      title={refund ? 'Corregir reembolso' : 'Corregir pago'}
      subtitle={[y.fullName, y.packageName].filter(Boolean).join(' · ')}
      footer={!voiding && (
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>Guardar cambios</Button>
        </>
      )}
    >
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate() }}>
        {amountEditable ? (
          <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-3">
            <Field label="Monto" error={fieldError('amountCents')}>
              <Input inputMode="decimal" value={form.amount} onChange={set('amount')} />
            </Field>
            <Field label="Moneda">
              <Select value={form.currency} onChange={set('currency')}>
                <option value="USD">USD</option>
                <option value="CRC">CRC ₡</option>
              </Select>
            </Field>
          </div>
        ) : (
          <div className="rounded-2xl bg-sunken px-4 py-3">
            <p className="display tnum text-2xl text-ink">{fmtMoney(refund ? -y.amountCents : y.amountCents, y.currency)}</p>
            <p className="mt-0.5 text-[13px] text-ink-3">
              {refund ? 'El monto de un reembolso no se edita: si está mal, anúlalo y regístralo de nuevo.' : 'Ya está verificado: si el monto está mal, anúlalo y regístralo de nuevo.'}
            </p>
          </div>
        )}
        {amountEditable && otherCurrency && (
          <Field label="Tipo de cambio (colones por dólar)" error={fieldError('fxRate')}>
            <Input inputMode="decimal" value={form.fxRate} onChange={set('fxRate')} placeholder="510" />
          </Field>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Medio de pago">
            <Select value={form.method} onChange={set('method')}>
              {Object.entries(METHOD).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
          </Field>
          <Field label={refund ? 'Fecha del reembolso' : 'Fecha en que entró el dinero'} error={fieldError('receivedOn')}>
            <Input type="date" max={today} value={form.receivedOn} onChange={set('receivedOn')} />
          </Field>
        </div>
        <Field label="Referencia" optional>
          <Input value={form.reference} onChange={set('reference')} placeholder="N.º de SINPE o comprobante" maxLength={120} />
        </Field>
        <Field label={refund ? 'Motivo' : 'Nota'} optional={!refund}>
          <Input value={form.note} onChange={set('note')} maxLength={500} />
        </Field>
        <ErrorNote error={error} />
        <button type="submit" hidden />
      </form>

      <div className="mt-6 border-t border-line pt-4">
        {voiding ? (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-ink">{refund ? 'Anular este reembolso' : 'Anular este pago'}</p>
            <p className="text-[13px] text-ink-3">Queda en el historial con el motivo, pero deja de contar en el saldo del paquete, en Caja y en los totales.</p>
            <Field label="Motivo" error={voidIt.error?.data?.field === 'reason' ? voidIt.error.message : undefined}>
              <Input value={reason} onChange={(e) => { setReason(e.target.value); voidIt.reset() }} maxLength={300} placeholder="Registrado dos veces, monto equivocado…" autoFocus />
            </Field>
            <ErrorNote error={voidIt.error} />
            <div className="flex gap-2">
              <Button size="sm" variant="danger" loading={voidIt.isPending} onClick={() => voidIt.mutate()}>{refund ? 'Anular reembolso' : 'Anular pago'}</Button>
              <Button size="sm" variant="ghost" onClick={() => setVoiding(false)}>Volver</Button>
            </div>
          </div>
        ) : (
          <Button variant="ghost" className="!text-terracotta" onClick={() => setVoiding(true)}>{refund ? 'Anular reembolso' : 'Anular pago'}</Button>
        )}
      </div>
    </Sheet>
  )
}

// ─── Detalle del paquete ─────────────────────────────────
function PromptAction({ title, label, type = 'text', needReason = true, confirm, variant = 'primary', onSubmit, onClose, busy, error, hint }) {
  const [value, setValue] = useState('')
  const [reason, setReason] = useState('')
  return (
    <div className="space-y-3 rounded-3xl border border-line bg-surface p-4">
      <p className="text-sm font-semibold text-ink">{title}</p>
      {hint && <p className="text-[13px] text-ink-3">{hint}</p>}
      {label && <Field label={label} error={error?.data?.field && error.data.field !== 'reason' ? error.message : undefined}><Input type={type} inputMode={type === 'text' ? 'decimal' : undefined} value={value} onChange={(e) => setValue(e.target.value)} /></Field>}
      {needReason && <Field label="Motivo" error={error?.data?.field === 'reason' ? error.message : undefined}><Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} /></Field>}
      <ErrorNote error={error} />
      <div className="flex gap-2">
        <Button size="sm" variant={variant} loading={busy} onClick={() => onSubmit({ value, reason: reason.trim() })}>{confirm}</Button>
        <Button size="sm" variant="ghost" onClick={onClose}>Volver</Button>
      </div>
    </div>
  )
}

/** Enlace de BAC Compra Click asociado a mano a la orden; la clienta lo ve en su pantalla de pago. */
function PaymentLink({ pkg, onSaved }) {
  const [value, setValue] = useState(pkg.paymentLink || '')
  const save = useMutation({ mutationFn: () => api.put(`/admin/packages/${pkg.id}/payment-link`, { paymentLink: value.trim() }), onSuccess: onSaved })
  return (
    <div className="rounded-3xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-ink">Pago con tarjeta (Compra Click)</p>
        {pkg.reference && <p className="tnum text-[13px] text-ink-3">Referencia {pkg.reference}</p>}
      </div>
      <p className="mt-1 text-[13px] text-ink-3">Pega aquí el enlace de pago creado en BAC para esta orden. Volver del enlace no confirma el cobro: verifícalo en BAC y registra el pago.</p>
      <div className="mt-3 flex gap-2">
        <Input aria-label="Enlace de Compra Click" inputMode="url" value={value} onChange={(e) => { setValue(e.target.value); save.reset() }} placeholder="https://…" className="!py-2" />
        <Button size="sm" variant="secondary" loading={save.isPending} disabled={value.trim() === (pkg.paymentLink || '')} onClick={() => save.mutate()}>Guardar</Button>
      </div>
      {save.error && <p className="mt-1.5 text-[13px] font-medium text-terracotta" role="alert">{save.error.message}</p>}
    </div>
  )
}

const DEFAULT_REMINDER = (pkg) => `Hola ${firstName(pkg.fullName)}, te escribo de Pilates by Riven. Tu ${pkg.name.toLowerCase()} tiene un saldo pendiente de ${fmtMoney(pkg.balanceCents, pkg.currency)}${pkg.holdUntil ? `. Te guardo el cupo hasta el ${fmtDate(pkg.holdUntil, { day: 'numeric', month: 'long' })}` : ''}. ¡Gracias!`

export function PackageSheet({ packageId, onClose }) {
  const toast = useToast()
  const refresh = useRefreshMoney()
  const today = todayCR()
  const [mode, setMode] = useState(null) // pay | reminder | extend_hold | cancel | extend_validity | activate_exception | refund:<id> | reject:<id>
  const [message, setMessage] = useState('')
  const refundKey = useRef(newKey())
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['package', packageId],
    queryFn: () => api.get(`/admin/packages/${packageId}`),
    enabled: !!packageId,
  })
  const pkg = data?.package
  const done = async (text) => { await refresh(); setMode(null); refundKey.current = newKey(); if (text) toast.success(text) }

  const act = useMutation({ mutationFn: (body) => api.patch(`/admin/packages/${packageId}`, body), onSuccess: () => done('Paquete actualizado'), onError: (err) => { if (!mode) toast.error(err) } })
  const verify = useMutation({ mutationFn: (id) => api.post(`/admin/payments/${id}/verify`), onSuccess: () => done('Pago verificado'), onError: toast.error })
  const reject = useMutation({ mutationFn: ({ id, reason }) => api.post(`/admin/payments/${id}/reject`, { reason }), onSuccess: () => done('Pago rechazado') })
  const refund = useMutation({
    mutationFn: ({ id, amountCents, reason }) => api.post(`/admin/payments/${id}/refund`, { amountCents, reason, refundedOn: today, idempotencyKey: refundKey.current }),
    onSuccess: () => done('Reembolso registrado'),
  })
  useEffect(() => { act.reset(); reject.reset(); refund.reset() }, [mode]) // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => { setMode(null); onClose() }
  const status = pkg && PACKAGE_STATUS[pkg.status]
  const holdExpired = pkg?.status === 'pending_payment' && pkg.holdUntil && pkg.holdUntil < today
  const [targetKind, targetId] = (mode || '').split(':')
  const target = data?.payments.find((y) => y.id === targetId)

  return (
    <>
      <Sheet
        open={!!packageId && mode !== 'pay' && targetKind !== 'fix'}
        onClose={close}
        size="lg"
        title={pkg ? pkg.name : 'Paquete'}
        subtitle={pkg && `${pkg.fullName} · ${pkg.studentCode}`}
      >
        {isLoading && <SkeletonList count={3} className="h-16" />}
        {isError && <ErrorState error={error} onRetry={refetch} />}
        {pkg && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={status.tone}>{status.label}</Badge>
              {pkg.balanceCents > 0 && pkg.status !== 'cancelled' && <Badge tone="honey">Saldo {fmtMoney(pkg.balanceCents, pkg.currency)}</Badge>}
              {pkg.groupName && <Badge>{pkg.groupName}</Badge>}
              {holdExpired && <Badge tone="terracotta">Retención vencida</Badge>}
              <Link to={`/clientas/${pkg.clientId}`} onClick={close} className="ml-auto text-[13px] font-semibold text-clay-deep hover:underline">Ver ficha</Link>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Card className="p-4"><p className="eyebrow">Precio acordado</p><p className="display tnum mt-2 text-[28px] text-ink">{fmtMoney(pkg.priceCents, pkg.currency)}</p></Card>
              <Card className="p-4"><p className="eyebrow">Verificado</p><p className="display tnum mt-2 text-[28px] text-ink">{fmtMoney(pkg.paidCents, pkg.currency)}</p>{pkg.toVerifyCents > 0 && <p className="tnum text-xs text-honey">+ {fmtMoney(pkg.toVerifyCents, pkg.currency)} por verificar</p>}</Card>
              <Card className="p-4"><p className="eyebrow">Vigencia</p><p className="mt-2 text-sm font-semibold text-ink">{shortDate(pkg.startsOn)} – {shortDate(pkg.expiresOn)}</p>{pkg.holdUntil && <p className={cx('text-xs', holdExpired ? 'font-semibold text-terracotta' : 'text-ink-3')}>Cupo retenido hasta {shortDate(pkg.holdUntil)}</p>}</Card>
            </div>

            <Card className="p-4"><Credits pkg={pkg} /></Card>

            {pkg.status !== 'cancelled' && pkg.balanceCents > 0 && <PaymentLink pkg={pkg} onSaved={() => done('Enlace guardado')} />}

            {(pkg.exceptionReason || pkg.extensionReason || pkg.cancelReason) && (
              <div className="space-y-1 rounded-2xl bg-sunken px-4 py-3 text-[13px] text-ink-2">
                {pkg.exceptionReason && <p><strong className="font-semibold">Activado por excepción:</strong> {pkg.exceptionReason}</p>}
                {pkg.extensionReason && <p><strong className="font-semibold">Prórroga:</strong> {pkg.extensionReason}</p>}
                {pkg.cancelReason && <p><strong className="font-semibold">Cancelado:</strong> {pkg.cancelReason}</p>}
              </div>
            )}

            {/* Acciones */}
            {pkg.status !== 'cancelled' && !mode && (
              <div className="flex flex-wrap gap-2">
                {pkg.balanceCents > 0 && <Button icon={CircleDollarSign} onClick={() => setMode('pay')}>Registrar pago</Button>}
                {pkg.balanceCents > 0 && pkg.whatsapp && <Button variant="whatsapp" icon={MessageCircle} onClick={() => { setMessage(DEFAULT_REMINDER(pkg)); setMode('reminder') }}>Recordar por WhatsApp</Button>}
                {pkg.status === 'pending_payment' && <Button variant="secondary" onClick={() => setMode('extend_hold')}>Extender retención</Button>}
                {pkg.status === 'pending_payment' && pkg.reserved > 0 && <Button variant="secondary" loading={act.isPending} onClick={() => act.mutate({ action: 'release_hold' })}>Liberar cupos</Button>}
                {pkg.status === 'pending_payment' && <Button variant="secondary" onClick={() => setMode('activate_exception')}>Activar sin pago</Button>}
                {pkg.status !== 'pending_payment' && <Button variant="secondary" onClick={() => setMode('extend_validity')}>Prórroga</Button>}
                <Button variant="ghost" className="!text-terracotta" onClick={() => setMode('cancel')}>Cancelar paquete</Button>
              </div>
            )}
            {mode === 'reminder' && (
              <div className="space-y-3 rounded-3xl border border-line bg-surface p-4">
                <Field label="Mensaje" hint="Puedes editarlo. Tú lo revisas y lo envías desde WhatsApp."><Textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} /></Field>
                <div className="flex gap-2">
                  <Button size="sm" variant="whatsapp" icon={MessageCircle} href={waLink(pkg.whatsapp, message)} onClick={() => setMode(null)}>Abrir WhatsApp</Button>
                  <Button size="sm" variant="ghost" onClick={() => setMode(null)}>Volver</Button>
                </div>
              </div>
            )}
            {mode === 'extend_hold' && <PromptAction title="Extender la retención del cupo" label="Nueva fecha límite" type="date" needReason={false} confirm="Extender" busy={act.isPending} error={act.error} onClose={() => setMode(null)} onSubmit={({ value }) => act.mutate({ action: 'extend_hold', holdUntil: value })} />}
            {mode === 'extend_validity' && <PromptAction title="Prórroga de vigencia" label="Nuevo vencimiento" type="date" confirm="Guardar prórroga" busy={act.isPending} error={act.error} onClose={() => setMode(null)} onSubmit={({ value, reason }) => act.mutate({ action: 'extend_validity', expiresOn: value, reason })} />}
            {mode === 'activate_exception' && <PromptAction title="Activar sin pago completo" hint="Las clases quedan confirmadas y el saldo sigue por cobrar. Queda registrado quién lo autorizó." confirm="Activar" busy={act.isPending} error={act.error} onClose={() => setMode(null)} onSubmit={({ reason }) => act.mutate({ action: 'activate_exception', reason })} />}
            {mode === 'cancel' && <PromptAction title="Cancelar el paquete" hint="Se liberan sus clases futuras. Los cobros ya recibidos quedan visibles para reasignarlos o reembolsarlos." confirm="Cancelar paquete" variant="danger" busy={act.isPending} error={act.error} onClose={() => setMode(null)} onSubmit={({ reason }) => act.mutate({ action: 'cancel', reason })} />}

            {/* Clases */}
            <section>
              <p className="eyebrow mb-2">Clases del paquete · {data.bookings.length}</p>
              {data.bookings.length === 0
                ? <p className="rounded-2xl border border-dashed border-line px-4 py-4 text-sm text-ink-3">Sin clases asignadas. Agrégalas desde la agenda: se cubrirán con este paquete.</p>
                : (
                  <Card className="divide-y divide-line">
                    {data.bookings.map((b) => {
                      const state = b.sessionStatus === 'cancelled' ? { label: 'Clase cancelada', tone: 'terracotta' } : b.attendance ? ATTENDANCE[b.attendance] : (pkg.status === 'pending_payment' && b.status === 'pending') ? { label: 'Cupo retenido', tone: 'honey' } : BOOKING_STATUS[b.status]
                      return (
                        <div key={b.id} className="flex items-center justify-between gap-3 px-4 py-3">
                          <p className="tnum min-w-0 truncate text-sm text-ink">{capitalize(fmtDate(b.localDate, { weekday: 'short', day: 'numeric', month: 'short' }))} · {fmtTime(b.localTime)}</p>
                          <Badge tone={state.tone}>{state.label}</Badge>
                        </div>
                      )
                    })}
                  </Card>
                )}
            </section>

            {/* Pagos */}
            <section>
              <p className="eyebrow mb-2">Pagos y ajustes · {data.payments.length}</p>
              {data.payments.length === 0
                ? <p className="rounded-2xl border border-dashed border-line px-4 py-4 text-sm text-ink-3">Aún no hay pagos registrados.</p>
                : (
                  <Card className="divide-y divide-line">
                    {data.payments.map((y) => (
                      <div key={y.id} className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <p className={cx('display tnum text-xl', y.status === 'voided' ? 'text-ink-3 line-through' : y.kind === 'refund' ? 'text-terracotta' : 'text-ink')}>{fmtMoney(y.kind === 'refund' ? -y.amountCents : y.amountCents, y.currency)}</p>
                          <Badge tone={y.status === 'voided' ? PAYMENT_STATUS.voided.tone : y.kind === 'refund' ? 'terracotta' : PAYMENT_STATUS[y.status].tone}>{y.status === 'voided' ? (y.kind === 'refund' ? 'Reembolso anulado' : 'Anulado') : y.kind === 'refund' ? 'Reembolso' : PAYMENT_STATUS[y.status].label}</Badge>
                          <p className="tnum ml-auto text-[13px] text-ink-3">{METHOD[y.method]} · {y.receivedOn && shortDate(y.receivedOn)}</p>
                          {y.hasProof && <button type="button" className="text-[13px] font-semibold text-clay-deep hover:underline" onClick={() => api.openFile(`/admin/payments/${y.id}/proof`).catch(toast.error)}>Ver comprobante</button>}
                        </div>
                        {(y.reference || y.note || y.rejectReason || y.voidReason || y.fxRate) && (
                          <p className="mt-1 text-[13px] text-ink-3">
                            {[y.reference && `Ref. ${y.reference}`, y.fxRate && `TC ₡${Number(y.fxRate)} → ${fmtMoney(y.appliedCents, pkg.currency)}`, y.note, y.rejectReason && `Rechazado: ${y.rejectReason}`, y.voidReason && `Anulado: ${y.voidReason}`].filter(Boolean).join(' · ')}
                          </p>
                        )}
                        {!mode && y.kind === 'payment' && y.status === 'to_verify' && (
                          <div className="mt-2 flex gap-2">
                            <Button size="sm" loading={verify.isPending && verify.variables === y.id} onClick={() => verify.mutate(y.id)}>Verificar</Button>
                            <Button size="sm" variant="ghost" onClick={() => setMode(`reject:${y.id}`)}>Rechazar</Button>
                          </div>
                        )}
                        {!mode && !['rejected', 'voided'].includes(y.status) && (
                          <div className="mt-1 flex flex-wrap gap-x-4">
                            {y.kind === 'payment' && y.status === 'verified' && y.refundedCents < y.amountCents && (
                              <button type="button" className="inline-flex min-h-[36px] items-center text-[13px] font-semibold text-clay-deep hover:underline" onClick={() => setMode(`refund:${y.id}`)}>Reembolsar</button>
                            )}
                            <button type="button" className="inline-flex min-h-[36px] items-center text-[13px] font-semibold text-clay-deep hover:underline" onClick={() => setMode(`fix:${y.id}`)}>Corregir o anular</button>
                          </div>
                        )}
                      </div>
                    ))}
                  </Card>
                )}
              {targetKind === 'reject' && target && <div className="mt-3"><PromptAction title={`Rechazar el pago de ${fmtMoney(target.amountCents, target.currency)}`} confirm="Rechazar pago" variant="danger" busy={reject.isPending} error={reject.error} onClose={() => setMode(null)} onSubmit={({ reason }) => reject.mutate({ id: target.id, reason })} /></div>}
              {targetKind === 'refund' && target && (
                <div className="mt-3">
                  <PromptAction
                    title={`Reembolsar parte o todo de ${fmtMoney(target.amountCents, target.currency)}`}
                    hint="Se crea un registro ligado al pago original; el historial no se borra."
                    label={`Monto a reembolsar (${target.currency})`}
                    confirm="Registrar reembolso"
                    variant="danger"
                    busy={refund.isPending}
                    error={refund.error}
                    onClose={() => setMode(null)}
                    onSubmit={({ value, reason }) => {
                      const amountCents = parseMoney(value)
                      if (!amountCents) return toast.error('Escribe un monto válido')
                      return refund.mutate({ id: target.id, amountCents, reason })
                    }}
                  />
                </div>
              )}
            </section>
          </div>
        )}
      </Sheet>
      {targetKind === 'fix' && target && <PaymentFixSheet payment={target} onClose={() => setMode(null)} />}
      {mode === 'pay' && pkg && <PaymentSheet clientId={pkg.clientId} clientName={pkg.fullName} pkg={pkg} onClose={() => setMode(null)} />}
    </>
  )
}

/** Fila de paquete para listas (Paquetes, ficha de clienta, Caja). */
export function PackageRow({ pkg, onOpen, showClient = true }) {
  const status = PACKAGE_STATUS[pkg.status]
  const holdExpired = pkg.status === 'pending_payment' && pkg.holdUntil && pkg.holdUntil < todayCR()
  return (
    <button type="button" onClick={onOpen} className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 text-left transition-colors hover:bg-clay-soft/30 sm:px-5">
      {showClient && <Avatar name={pkg.fullName} />}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold text-ink">{showClient ? pkg.fullName : pkg.name}</span>
        <span className="tnum block truncate text-[13px] text-ink-3">
          {showClient ? `${pkg.name} · ` : ''}{shortDate(pkg.startsOn)} – {shortDate(pkg.expiresOn)}{pkg.groupName ? ` · ${pkg.groupName}` : ''}
        </span>
      </span>
      <span className="hidden w-64 shrink-0 lg:block"><Credits pkg={pkg} /></span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span className="flex gap-1.5">
          {holdExpired && <Badge tone="terracotta">Retención vencida</Badge>}
          <Badge tone={status.tone}>{status.label}</Badge>
        </span>
        <span className="tnum text-[13px] text-ink-2">
          {pkg.balanceCents > 0 && pkg.status !== 'cancelled'
            ? <>Saldo <strong className="font-semibold text-ink">{fmtMoney(pkg.balanceCents, pkg.currency)}</strong></>
            : <>{PRODUCT_KIND[pkg.kind]} · {fmtMoney(pkg.priceCents, pkg.currency)}</>}
        </span>
      </span>
    </button>
  )
}
