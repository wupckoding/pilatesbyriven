import React, { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, PackageOpen, Pencil, Plus, Receipt, Search } from 'lucide-react'
import { api } from '../../lib/api'
import { METHOD, PAYMENT_STATUS, PRODUCT_KIND, addDays, fmtDate, fmtMoney, monthRange, parseMoney, todayCR, weekStart } from '../../lib/format'
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, Field, IconButton, Input, PageHeader, Segmented, Select, SkeletonList, cx } from '../../ui'
import Sheet from '../../ui/Sheet'
import { useToast } from '../../ui/Toast'
import { PackageRow, PackageSheet, SellPackageSheet, useRefreshMoney } from './commerce'

const TABS = [
  { value: 'due', label: 'Por cobrar', empty: 'No hay saldos por cobrar.' },
  { value: 'active', label: 'Activos', empty: 'No hay paquetes activos.' },
  { value: 'expiring', label: 'Por vencer', empty: 'Ningún paquete vence en los próximos días.' },
  { value: 'expired', label: 'Vencidos', empty: 'No hay paquetes vencidos.' },
  { value: 'payments', label: 'Pagos' },
  { value: 'catalog', label: 'Catálogo' },
]

// ─── Períodos compartidos con Caja ───────────────────────
export const PERIODS = [
  { value: 'today', label: 'Hoy' },
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mes' },
  { value: 'range', label: 'Rango' },
]
export const periodRange = (period, custom) => {
  const today = todayCR()
  if (period === 'today') return { from: today, to: today }
  if (period === 'week') { const from = weekStart(today); return { from, to: addDays(from, 6) } }
  if (period === 'range' && custom.from && custom.to && custom.to >= custom.from) return custom
  return monthRange(today)
}

export function PeriodPicker({ period, setPeriod, custom, setCustom }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Segmented label="Período" options={PERIODS} value={period} onChange={setPeriod} />
      {period === 'range' && (
        <div className="flex items-center gap-2">
          <Input type="date" aria-label="Desde" className="!w-auto !py-2" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} />
          <span className="text-ink-3">a</span>
          <Input type="date" aria-label="Hasta" className="!w-auto !py-2" value={custom.to} min={custom.from} onChange={(e) => setCustom({ ...custom, to: e.target.value })} />
        </div>
      )}
    </div>
  )
}

// ─── Paquetes ────────────────────────────────────────────
function PackageList({ view, onOpen }) {
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['packages', view], queryFn: () => api.get('/admin/packages', { view }) })
  if (isLoading) return <SkeletonList count={4} className="h-[72px]" />
  if (isError) return <ErrorState error={error} onRetry={refetch} />
  if (!data.packages.length) return <EmptyState icon={PackageOpen} title="Nada por aquí" text={TABS.find((t) => t.value === view).empty} />
  const totals = data.packages.reduce((acc, p) => ({ ...acc, [p.currency]: (acc[p.currency] || 0) + p.balanceCents }), {})
  return (
    <div className="space-y-3">
      <p className="tnum text-[13px] text-ink-3">
        {data.packages.length} {data.packages.length === 1 ? 'paquete' : 'paquetes'}
        {view === 'due' && Object.entries(totals).filter(([, v]) => v > 0).map(([cur, v]) => ` · ${fmtMoney(v, cur)} por cobrar`)}
        {view === 'expiring' && ` · vencen en ${data.renewalNoticeDays} días o menos`}
      </p>
      <Card className="divide-y divide-line overflow-hidden">
        {data.packages.map((p) => <PackageRow key={p.id} pkg={p} onOpen={() => onOpen(p.id)} />)}
      </Card>
    </div>
  )
}

// ─── Pagos ───────────────────────────────────────────────
function PaymentsList({ onOpenPackage }) {
  const toast = useToast()
  const refresh = useRefreshMoney()
  const [period, setPeriod] = useState('month')
  const [custom, setCustom] = useState({ from: '', to: '' })
  const [status, setStatus] = useState('all')
  const [method, setMethod] = useState('all')
  const [search, setSearch] = useState('')
  const [term, setTerm] = useState('')
  useEffect(() => { const t = setTimeout(() => setTerm(search.trim()), 250); return () => clearTimeout(t) }, [search])

  // "Por verificar" se revisa completo, sin importar el período.
  const range = status === 'to_verify' ? {} : periodRange(period, custom)
  const filters = { ...range, status, method, search: term }
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['payments', filters],
    queryFn: () => api.get('/admin/payments', filters),
    placeholderData: (prev) => prev,
  })
  const verify = useMutation({ mutationFn: (id) => api.post(`/admin/payments/${id}/verify`), onSuccess: async () => { await refresh(); toast.success('Pago verificado') }, onError: toast.error })
  const exportCsv = useMutation({ mutationFn: () => api.download('/admin/export/payments.csv', filters, 'pagos.csv'), onError: toast.error })

  const rows = data?.payments || []
  const totals = rows.filter((y) => y.status === 'verified').reduce((acc, y) => ({ ...acc, [y.currency]: (acc[y.currency] || 0) + (y.kind === 'refund' ? -y.amountCents : y.amountCents) }), {})

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {status !== 'to_verify' && <PeriodPicker period={period} setPeriod={setPeriod} custom={custom} setCustom={setCustom} />}
        <Select aria-label="Estado" className="!w-auto !py-2" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">Todos los estados</option>
          {Object.entries(PAYMENT_STATUS).filter(([v]) => v !== 'pending').map(([value, s]) => <option key={value} value={value}>{s.label}</option>)}
        </Select>
        <Select aria-label="Medio de pago" className="!w-auto !py-2" value={method} onChange={(e) => setMethod(e.target.value)}>
          <option value="all">Todos los medios</option>
          {Object.entries(METHOD).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select>
        <div className="relative min-w-[200px] flex-1 lg:max-w-xs">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden="true" />
          <Input type="search" aria-label="Buscar pagos" className="!py-2 pl-11" placeholder="Clienta o referencia" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Button variant="secondary" size="sm" icon={Download} loading={exportCsv.isPending} disabled={!rows.length} onClick={() => exportCsv.mutate()} className="ml-auto">Exportar CSV</Button>
      </div>

      {isLoading && <SkeletonList count={4} className="h-16" />}
      {isError && <ErrorState error={error} onRetry={refetch} />}
      {data && rows.length === 0 && <EmptyState icon={Receipt} title="Sin pagos" text="No hay pagos con estos filtros." />}
      {rows.length > 0 && (
        <>
          <p className="tnum text-[13px] text-ink-3">
            {rows.length} {rows.length === 1 ? 'registro' : 'registros'}
            {Object.entries(totals).map(([cur, v]) => ` · ${fmtMoney(v, cur)} verificados`)}
          </p>
          <Card className="overflow-hidden">
            <div className={cx('hidden border-b border-line bg-sunken/50 px-5 py-3 lg:grid', COLS)} aria-hidden="true">
              {['Clienta', 'Fecha', 'Medio y referencia', 'Paquete', 'Monto', ''].map((h, i) => <p key={h} className={cx('eyebrow', i === 4 && 'text-right')}>{h}</p>)}
            </div>
            <div className="divide-y divide-line">
              {rows.map((y) => {
                const refund = y.kind === 'refund'
                const state = refund ? { label: 'Reembolso', tone: 'terracotta' } : PAYMENT_STATUS[y.status]
                return (
                  <div key={y.id} className={cx('flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 sm:px-5 lg:grid', COLS)}>
                    <div className="flex min-w-0 basis-full items-center gap-3 lg:basis-auto">
                      <Avatar name={y.fullName} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink">{y.fullName}</p>
                        <p className="tnum truncate text-xs text-ink-3 lg:hidden">{y.receivedOn && fmtDate(y.receivedOn, { day: 'numeric', month: 'short' })} · {METHOD[y.method]}{y.reference ? ` · ${y.reference}` : ''}</p>
                      </div>
                    </div>
                    <p className="tnum hidden text-sm text-ink-2 lg:block">{y.receivedOn ? fmtDate(y.receivedOn, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</p>
                    <p className="hidden truncate text-sm text-ink-2 lg:block">{METHOD[y.method]}{y.reference ? ` · ${y.reference}` : ''}</p>
                    <p className="hidden truncate text-sm lg:block">
                      {y.packageId
                        ? <button type="button" className="font-medium text-clay-deep hover:underline" onClick={() => onOpenPackage(y.packageId)}>{y.packageName}</button>
                        : <span className="text-ink-3">Sin paquete</span>}
                    </p>
                    <div className="flex-1 pl-11 lg:pl-0 lg:text-right">
                      <p className={cx('display tnum text-xl', refund ? 'text-terracotta' : 'text-ink')}>{fmtMoney(refund ? -y.amountCents : y.amountCents, y.currency)}</p>
                      {y.refundedCents > 0 && <p className="tnum text-xs text-terracotta">Reembolsado {fmtMoney(y.refundedCents, y.currency)}</p>}
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      {y.status === 'to_verify' && !refund
                        ? <Button size="sm" loading={verify.isPending && verify.variables === y.id} onClick={() => verify.mutate(y.id)}>Verificar</Button>
                        : <Badge tone={state.tone}>{state.label}</Badge>}
                      {y.packageId && <button type="button" className="text-[13px] font-semibold text-clay-deep lg:hidden" onClick={() => onOpenPackage(y.packageId)}>Ver</button>}
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
const COLS = 'lg:grid-cols-[minmax(0,1.6fr)_120px_minmax(0,1.3fr)_minmax(0,1.3fr)_130px_120px] lg:items-center lg:gap-4'

// ─── Catálogo ────────────────────────────────────────────
function ProductForm({ product, onClose }) {
  const toast = useToast()
  const qc = useQueryClient()
  const [form, setForm] = useState(product
    ? { name: product.name, kind: product.kind, sessionsCount: product.sessionsCount, price: String(product.priceCents / 100), currency: product.currency, validityDays: product.validityDays, isActive: product.isActive }
    : { name: '', kind: 'package', sessionsCount: 4, price: '', currency: 'USD', validityDays: 30, isActive: true })
  const [error, setError] = useState(null)
  const set = (key) => (e) => { setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })); setError(null) }
  const fieldError = (name) => (error?.data?.field === name ? error.message : undefined)
  const save = useMutation({
    mutationFn: () => {
      const priceCents = parseMoney(form.price)
      if (priceCents === null) throw Object.assign(new Error('Precio inválido'), { data: { field: 'priceCents' } })
      const body = { name: form.name.trim(), kind: form.kind, sessionsCount: Number(form.sessionsCount), priceCents, currency: form.currency, validityDays: Number(form.validityDays), isActive: form.isActive }
      return product ? api.patch(`/admin/products/${product.id}`, body) : api.post('/admin/products', body)
    },
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['products'] }); toast.success(product ? 'Producto actualizado' : 'Producto creado'); onClose() },
    onError: setError,
  })
  return (
    <Sheet
      open
      onClose={onClose}
      title={product ? 'Editar producto' : 'Nuevo producto'}
      subtitle="Los cambios aplican solo a ventas futuras: cada paquete vendido conserva su precio y vigencia."
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button loading={save.isPending} onClick={() => save.mutate()}>{product ? 'Guardar cambios' : 'Crear'}</Button></>}
    >
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate() }}>
        <Field label="Nombre" error={fieldError('name')}><Input value={form.name} onChange={set('name')} maxLength={80} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tipo">
            <Select value={form.kind} onChange={set('kind')}>{Object.entries(PRODUCT_KIND).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
          </Field>
          <Field label="Clases incluidas" error={fieldError('sessionsCount')}><Input type="number" inputMode="numeric" min={1} max={100} value={form.sessionsCount} onChange={set('sessionsCount')} /></Field>
          <Field label="Precio" error={fieldError('priceCents')}><Input inputMode="decimal" value={form.price} onChange={set('price')} placeholder="80" /></Field>
          <Field label="Moneda"><Select value={form.currency} onChange={set('currency')}><option value="USD">USD</option><option value="CRC">CRC ₡</option></Select></Field>
          <Field label="Vigencia (días)" error={fieldError('validityDays')}><Input type="number" inputMode="numeric" min={1} max={730} value={form.validityDays} onChange={set('validityDays')} /></Field>
        </div>
        <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-line bg-surface p-4">
          <input type="checkbox" checked={form.isActive} onChange={set('isActive')} className="h-5 w-5 accent-[#8A6548]" />
          <span className="text-sm font-semibold text-ink">Disponible para vender</span>
        </label>
        {error && !error.data?.field && <p className="rounded-2xl bg-terracotta-soft px-4 py-3 text-sm font-medium text-terracotta" role="alert">{error.message}</p>}
        <button type="submit" hidden />
      </form>
    </Sheet>
  )
}

function Catalog() {
  const [editing, setEditing] = useState(null) // producto | 'new'
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['products'], queryFn: () => api.get('/admin/products') })
  if (isLoading) return <SkeletonList count={3} className="h-28" />
  if (isError) return <ErrorState error={error} onRetry={refetch} />
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {data.products.map((p) => (
          <Card key={p.id} className={cx('p-5', !p.isActive && 'opacity-60')}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="eyebrow">{PRODUCT_KIND[p.kind]}</p>
                <p className="mt-1 truncate text-[15px] font-semibold text-ink">{p.name}</p>
              </div>
              <IconButton icon={Pencil} label={`Editar ${p.name}`} onClick={() => setEditing(p)} className="-mr-2 -mt-2" />
            </div>
            <p className="display tnum mt-3 text-[36px] text-ink">{fmtMoney(p.priceCents, p.currency)}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge tone="clay">{p.sessionsCount} {p.sessionsCount === 1 ? 'clase' : 'clases'}</Badge>
              <Badge>Vigencia {p.validityDays} días</Badge>
              {!p.isActive && <Badge tone="terracotta">No disponible</Badge>}
            </div>
          </Card>
        ))}
        <button type="button" onClick={() => setEditing('new')} className="flex min-h-[150px] flex-col items-center justify-center gap-2 rounded-3xl border border-dashed border-line text-sm font-semibold text-ink-2 transition-colors hover:border-clay hover:bg-clay-soft/30">
          <Plus className="h-5 w-5" aria-hidden="true" /> Nuevo producto
        </button>
      </div>
      {editing && <ProductForm key={editing.id || 'new'} product={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

export default function Packages() {
  const [params, setParams] = useSearchParams()
  const tab = TABS.some((t) => t.value === params.get('vista')) ? params.get('vista') : 'due'
  const [openPackage, setOpenPackage] = useState(null)
  const [selling, setSelling] = useState(false)

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Paquetes y pagos"
        title="Cupos, renovaciones y cobros"
        actions={<Button icon={Plus} onClick={() => setSelling(true)}>Vender paquete</Button>}
      />
      <Segmented label="Sección" options={TABS} value={tab} onChange={(next) => setParams({ vista: next }, { replace: true })} />
      {tab === 'payments' ? <PaymentsList onOpenPackage={setOpenPackage} />
        : tab === 'catalog' ? <Catalog />
          : <PackageList key={tab} view={tab} onOpen={setOpenPackage} />}

      <PackageSheet packageId={openPackage} onClose={() => setOpenPackage(null)} />
      {selling && <SellPackageSheet onClose={() => setSelling(false)} onCreated={(pkg) => setOpenPackage(pkg.id)} />}
    </div>
  )
}
