import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ArrowRight, Download, PiggyBank, Plus, Receipt, Trash2 } from 'lucide-react'
import { api } from '../../lib/api'
import { EXPENSE_CATEGORIES, capitalize, fmtDate, fmtMoney, parseMoney, todayCR } from '../../lib/format'
import { Button, Card, EmptyState, ErrorState, Field, IconButton, Input, PageHeader, SectionTitle, Select, Skeleton, cx } from '../../ui'
import Sheet from '../../ui/Sheet'
import { useToast } from '../../ui/Toast'
import { PackageRow, PackageSheet, useRefreshMoney } from './commerce'
import { PeriodPicker, periodRange } from './Packages'

const pct = (value, goal) => (goal > 0 ? Math.min(100, Math.round((value / goal) * 100)) : 0)

function Progress({ value, goal, tone = 'clay' }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-white/15" role="img" aria-label={`${pct(value, goal)} % de la meta`}>
      <div className={cx('h-full rounded-full transition-all duration-500', tone === 'clay' ? 'bg-clay' : 'bg-white')} style={{ width: `${pct(value, goal)}%` }} />
    </div>
  )
}

/** Alta de gasto o de transferencia al fondo. */
function EntrySheet({ kind, onClose }) {
  const toast = useToast()
  const refresh = useRefreshMoney()
  const today = todayCR()
  const isExpense = kind === 'expenses'
  const [form, setForm] = useState({ date: today, amount: '', currency: 'USD', category: EXPENSE_CATEGORIES[0], note: '' })
  const [error, setError] = useState(null)
  const set = (key) => (e) => { setForm((f) => ({ ...f, [key]: e.target.value })); setError(null) }
  const fieldError = (name) => (error?.data?.field === name ? error.message : undefined)
  const save = useMutation({
    mutationFn: () => {
      const amountCents = parseMoney(form.amount)
      if (!amountCents) throw Object.assign(new Error('Escribe un monto válido'), { data: { field: 'amountCents' } })
      return api.post(`/admin/${kind}`, { date: form.date, amountCents, currency: form.currency, note: form.note.trim(), ...(isExpense ? { category: form.category } : {}) })
    },
    onSuccess: async () => { await refresh(); toast.success(isExpense ? 'Gasto registrado' : 'Transferencia registrada'); onClose() },
    onError: setError,
  })
  return (
    <Sheet
      open
      onClose={onClose}
      size="sm"
      title={isExpense ? 'Registrar gasto' : 'Transferencia al fondo'}
      subtitle={isExpense ? 'Gastos del estudio en el período.' : 'Dinero que realmente pasaste al fondo de Lindora. No cuenta como gasto.'}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button loading={save.isPending} onClick={() => save.mutate()}>Guardar</Button></>}
    >
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate() }}>
        <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-3">
          <Field label="Monto" error={fieldError('amountCents')}><Input autoFocus inputMode="decimal" value={form.amount} onChange={set('amount')} placeholder="0.00" /></Field>
          <Field label="Moneda"><Select value={form.currency} onChange={set('currency')}><option value="USD">USD</option><option value="CRC">CRC ₡</option></Select></Field>
        </div>
        <Field label="Fecha" error={fieldError('date')}><Input type="date" max={today} value={form.date} onChange={set('date')} /></Field>
        {isExpense && (
          <Field label="Categoría" error={fieldError('category')}>
            <Select value={form.category} onChange={set('category')}>{EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</Select>
          </Field>
        )}
        <Field label="Nota" optional><Input value={form.note} onChange={set('note')} maxLength={300} /></Field>
        {error && !error.data?.field && <p className="rounded-2xl bg-terracotta-soft px-4 py-3 text-sm font-medium text-terracotta" role="alert">{error.message}</p>}
        <button type="submit" hidden />
      </form>
    </Sheet>
  )
}

function Ledger({ kind, range, title, empty, icon }) {
  const toast = useToast()
  const refresh = useRefreshMoney()
  const [adding, setAdding] = useState(false)
  const [confirming, setConfirming] = useState(null)
  const isExpense = kind === 'expenses'
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: [kind, range], queryFn: () => api.get(`/admin/${kind}`, range) })
  const remove = useMutation({
    mutationFn: (id) => api.delete(`/admin/${kind}/${id}`),
    onSuccess: async () => { await refresh(); setConfirming(null); toast.success('Registro eliminado') },
    onError: toast.error,
  })
  const exportCsv = useMutation({ mutationFn: () => api.download(`/admin/export/${kind}.csv`, range, isExpense ? 'gastos.csv' : 'transferencias-lindora.csv'), onError: toast.error })
  const items = data?.items || []

  return (
    <section>
      <SectionTitle
        action={(
          <div className="flex items-center gap-1">
            {items.length > 0 && <IconButton icon={Download} label={`Exportar ${title.toLowerCase()} a CSV`} onClick={() => exportCsv.mutate()} />}
            <Button size="sm" variant="secondary" icon={Plus} onClick={() => setAdding(true)}>{isExpense ? 'Gasto' : 'Transferencia'}</Button>
          </div>
        )}
      >
        {title}
      </SectionTitle>
      {isLoading && <Skeleton className="h-24" />}
      {isError && <ErrorState error={error} onRetry={refetch} />}
      {data && items.length === 0 && <EmptyState icon={icon} title={empty} className="py-8" />}
      {items.length > 0 && (
        <Card className="divide-y divide-line overflow-hidden">
          {items.map((x) => (
            <div key={x.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{isExpense ? x.category : 'Fondo Lindora'}</p>
                <p className="truncate text-[13px] text-ink-3">{capitalize(fmtDate(x.date, { day: 'numeric', month: 'short' }))}{x.note ? ` · ${x.note}` : ''}</p>
              </div>
              <p className="display tnum text-xl text-ink">{fmtMoney(x.amountCents, x.currency)}</p>
              {confirming === x.id
                ? <Button size="sm" variant="danger" loading={remove.isPending} onClick={() => remove.mutate(x.id)}>Eliminar</Button>
                : <IconButton icon={Trash2} label="Eliminar registro" onClick={() => setConfirming(x.id)} />}
            </div>
          ))}
        </Card>
      )}
      {adding && <EntrySheet kind={kind} onClose={() => setAdding(false)} />}
    </section>
  )
}

function CurrencyCard({ currency, t }) {
  const rows = [
    ['Cobros confirmados', t.collected, 'text-ink'],
    ['Reembolsos', -t.refunds, t.refunds ? 'text-terracotta' : 'text-ink-3'],
    ['Gastos', -t.expenses, t.expenses ? 'text-terracotta' : 'text-ink-3'],
  ]
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-baseline justify-between">
        <p className="eyebrow">{currency === 'USD' ? 'Dólares' : 'Colones'}</p>
        <p className="text-[11px] font-semibold uppercase tracking-label text-ink-3">Disponible</p>
      </div>
      <p className={cx('display tnum mt-2 text-right text-[44px]', t.available < 0 ? 'text-terracotta' : 'text-ink')}>{fmtMoney(t.available, currency)}</p>
      <dl className="mt-4 divide-y divide-line border-t border-line">
        {rows.map(([label, value, color]) => (
          <div key={label} className="flex items-center justify-between py-2.5">
            <dt className="text-sm text-ink-2">{label}</dt>
            <dd className={cx('tnum text-sm font-semibold', color)}>{fmtMoney(value, currency)}</dd>
          </div>
        ))}
      </dl>
      {(t.receivable > 0 || t.toVerify > 0) && (
        <p className="tnum mt-3 text-[13px] text-ink-3">
          {[t.receivable > 0 && `${fmtMoney(t.receivable, currency)} por cobrar`, t.toVerify > 0 && `${fmtMoney(t.toVerify, currency)} por verificar`].filter(Boolean).join(' · ')}
        </p>
      )}
    </Card>
  )
}

export default function Caja() {
  const [period, setPeriod] = useState('month')
  const [custom, setCustom] = useState({ from: '', to: '' })
  const [openPackage, setOpenPackage] = useState(null)
  const range = periodRange(period, custom)
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['caja', range], queryFn: () => api.get('/admin/caja', range), placeholderData: (prev) => prev })
  const rangeLabel = range.from === range.to
    ? capitalize(fmtDate(range.from))
    : `${fmtDate(range.from, { day: 'numeric', month: 'short' })} – ${fmtDate(range.to, { day: 'numeric', month: 'short', year: 'numeric' })}`
  const hasCRC = data && Object.values(data.totals.CRC).some((v) => v !== 0)

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Caja" title="Cobros, gastos y ahorro" subtitle={rangeLabel} />
      <PeriodPicker period={period} setPeriod={setPeriod} custom={custom} setCustom={setCustom} />

      {isLoading && <Skeleton className="h-64" />}
      {isError && <ErrorState error={error} onRetry={refetch} />}

      {data && (
        <>
          <div className={cx('grid gap-4', hasCRC ? 'lg:grid-cols-3' : 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]')}>
            <CurrencyCard currency="USD" t={data.totals.USD} />
            {hasCRC && <CurrencyCard currency="CRC" t={data.totals.CRC} />}

            {/* Fondo Lindora */}
            <section className="grain rounded-3xl bg-espresso p-5 text-white shadow-lift sm:p-6">
              <div className="flex items-center gap-2 text-white/60">
                <PiggyBank className="h-4 w-4" aria-hidden="true" />
                <p className="text-[11px] font-semibold uppercase tracking-label">Fondo Lindora</p>
              </div>
              <p className="display tnum mt-3 text-[44px]">{fmtMoney(data.savings.period, 'USD')}</p>
              <p className="text-sm text-white/70">transferidos en el período · meta mensual {fmtMoney(data.savings.goalMonth, 'USD')}</p>
              <div className="mt-3"><Progress value={data.savings.period} goal={data.savings.goalMonth} /></div>
              <p className="tnum mt-2 text-[13px] text-white/70">
                {data.savings.gapMonth > 0 ? <>Faltan <strong className="font-semibold text-white">{fmtMoney(data.savings.gapMonth, 'USD')}</strong> para la meta</> : 'Meta del mes alcanzada'}
              </p>
              <div className="mt-5 border-t border-white/10 pt-4">
                <div className="flex items-baseline justify-between">
                  <p className="text-sm text-white/70">Acumulado</p>
                  <p className="tnum text-sm"><strong className="display text-2xl font-light">{fmtMoney(data.savings.total, 'USD')}</strong> <span className="text-white/60">de {fmtMoney(data.savings.goalTotal, 'USD')}</span></p>
                </div>
                <div className="mt-2"><Progress value={data.savings.total} goal={data.savings.goalTotal} tone="white" /></div>
                <p className="tnum mt-2 text-[13px] text-white/70">Pendiente para Lindora: {fmtMoney(data.savings.gapTotal, 'USD')}</p>
              </div>
              {data.totals.CRC.savedAllTime > 0 && <p className="tnum mt-3 text-xs text-white/50">Además, {fmtMoney(data.totals.CRC.savedAllTime, 'CRC')} transferidos en colones (no se suman a la meta en dólares).</p>}
            </section>
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-ink-2">
            <p className="tnum"><strong className="font-semibold text-ink">{data.paymentsCount}</strong> {data.paymentsCount === 1 ? 'cobro confirmado' : 'cobros confirmados'} en el período</p>
            {data.toVerifyCount > 0 && <Link to="/paquetes?vista=payments" className="font-semibold text-honey hover:underline">{data.toVerifyCount} {data.toVerifyCount === 1 ? 'pago por verificar' : 'pagos por verificar'}</Link>}
            <Link to="/paquetes?vista=payments" className="inline-flex items-center gap-1 font-semibold text-clay-deep hover:underline">Ver el detalle de pagos <ArrowRight className="h-3.5 w-3.5" /></Link>
          </div>

          <div className="grid gap-8 lg:grid-cols-2">
            <Ledger kind="expenses" range={range} title="Gastos del período" empty="Sin gastos registrados" icon={Receipt} />
            <Ledger kind="transfers" range={range} title="Transferencias al fondo" empty="Sin transferencias en el período" icon={PiggyBank} />
          </div>

          <section>
            <SectionTitle>Saldos por cobrar · {data.receivables.length}</SectionTitle>
            {data.receivables.length === 0
              ? <p className="rounded-3xl border border-dashed border-line px-5 py-6 text-center text-sm text-ink-3">No hay saldos pendientes.</p>
              : <Card className="divide-y divide-line overflow-hidden">{data.receivables.map((p) => <PackageRow key={p.id} pkg={p} onOpen={() => setOpenPackage(p.id)} />)}</Card>}
          </section>
        </>
      )}
      <PackageSheet packageId={openPackage} onClose={() => setOpenPackage(null)} />
    </div>
  )
}
