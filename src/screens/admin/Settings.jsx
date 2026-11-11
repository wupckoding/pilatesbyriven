import React, { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { parseMoney } from '../../lib/format'
import { Button, Card, ErrorState, Field, Input, PageHeader, SectionTitle, Skeleton } from '../../ui'
import { useToast } from '../../ui/Toast'
import AccountActions from '../Account'

const NUMBERS = ['cancelWindowHours', 'renewalNoticeDays', 'holdDays', 'monthlyPackagesGoal']
const TOGGLES = ['absentConsumesCredit', 'lateCancelConsumesCredit', 'intakeRequired']
const TEXTS = ['sinpeNumber', 'sinpeName']
const MONEY = ['savingsGoalMonthCents', 'savingsGoalTotalCents']

const toForm = (s) => ({
  ...Object.fromEntries(NUMBERS.map((k) => [k, String(s[k])])),
  ...Object.fromEntries(TOGGLES.map((k) => [k, !!s[k]])),
  ...Object.fromEntries(MONEY.map((k) => [k, String(s[k] / 100)])),
  ...Object.fromEntries(TEXTS.map((k) => [k, s[k] || ''])),
})

const Toggle = ({ checked, onChange, title, text }) => (
  <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line bg-canvas/60 p-4">
    <input type="checkbox" checked={checked} onChange={onChange} className="mt-0.5 h-5 w-5 accent-[#8A6548]" />
    <span>
      <span className="block text-sm font-semibold text-ink">{title}</span>
      <span className="block text-[13px] text-ink-3">{text}</span>
    </span>
  </label>
)

function Policies() {
  const toast = useToast()
  const qc = useQueryClient()
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['settings'], queryFn: () => api.get('/admin/settings') })
  const [form, setForm] = useState(null)
  useEffect(() => { if (data && !form) setForm(toForm(data.settings)) }, [data, form])

  const save = useMutation({
    mutationFn: () => {
      const body = {}
      for (const k of NUMBERS) body[k] = Number(form[k])
      for (const k of TOGGLES) body[k] = form[k]
      for (const k of TEXTS) body[k] = form[k].trim()
      for (const k of MONEY) {
        const cents = parseMoney(form[k])
        if (cents === null) throw new Error('Revisa las metas de ahorro: escribe un monto válido')
        body[k] = cents
      }
      return api.put('/admin/settings', body)
    },
    onSuccess: async (res) => {
      qc.setQueryData(['settings'], res)
      setForm(toForm(res.settings))
      await Promise.all(['dashboard', 'caja', 'packages', 'package', 'client'].map((key) => qc.invalidateQueries({ queryKey: [key] })))
      toast.success('Reglas guardadas')
    },
    onError: toast.error,
  })

  if (isLoading || !form) return isError ? <ErrorState error={error} onRetry={refetch} /> : <Skeleton className="h-72" />
  const dirty = JSON.stringify(form) !== JSON.stringify(toForm(data.settings))
  const num = (key, props) => <Input type="number" inputMode="numeric" value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} {...props} />

  return (
    <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); save.mutate() }}>
      <section>
        <SectionTitle>Cancelaciones y créditos</SectionTitle>
        <Card className="space-y-4 p-5 sm:p-6">
          <Field label="Aviso mínimo para cancelar (horas)" hint="Con menos aviso, una reserva confirmada queda como cancelación tardía." className="max-w-sm">
            {num('cancelWindowHours', { min: 0, max: 72 })}
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Toggle checked={form.absentConsumesCredit} onChange={(e) => setForm({ ...form, absentConsumesCredit: e.target.checked })} title="La ausencia cuenta como clase tomada" text="Si lo desactivas, una ausencia devuelve el crédito al paquete." />
            <Toggle checked={form.lateCancelConsumesCredit} onChange={(e) => setForm({ ...form, lateCancelConsumesCredit: e.target.checked })} title="La cancelación tardía cuenta como clase tomada" text="Cancelar con aviso siempre devuelve el crédito." />
          </div>
        </Card>
      </section>

      <section>
        <SectionTitle>Renovaciones</SectionTitle>
        <Card className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
          <Field label="Retener el cupo sin pago (días)" hint="Fecha límite sugerida al crear una renovación.">{num('holdDays', { min: 0, max: 60 })}</Field>
          <Field label="Avisar antes del vencimiento (días)" hint="Define qué paquetes aparecen en «Por vencer».">{num('renewalNoticeDays', { min: 0, max: 30 })}</Field>
        </Card>
      </section>

      <section>
        <SectionTitle>Admisión y pagos de clientas</SectionTitle>
        <Card className="space-y-4 p-5 sm:p-6">
          <Toggle checked={form.intakeRequired} onChange={(e) => setForm({ ...form, intakeRequired: e.target.checked })} title="Exigir el formulario de admisión antes de reservar o comprar" text="Lo que la clienta responda no bloquea la reserva: solo se exige haber pasado por el paso." />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="SINPE Móvil del estudio" hint="Lo ven las clientas al pagar.">
              <Input inputMode="tel" value={form.sinpeNumber} onChange={(e) => setForm({ ...form, sinpeNumber: e.target.value })} placeholder="8888 8888" maxLength={30} />
            </Field>
            <Field label="A nombre de">
              <Input value={form.sinpeName} onChange={(e) => setForm({ ...form, sinpeName: e.target.value })} maxLength={120} />
            </Field>
          </div>
        </Card>
      </section>

      <section>
        <SectionTitle>Metas</SectionTitle>
        <Card className="grid gap-4 p-5 sm:grid-cols-3 sm:p-6">
          <Field label="Paquetes pagados al mes">{num('monthlyPackagesGoal', { min: 0, max: 1000 })}</Field>
          <Field label="Ahorro mensual (US$)"><Input inputMode="decimal" value={form.savingsGoalMonthCents} onChange={(e) => setForm({ ...form, savingsGoalMonthCents: e.target.value })} /></Field>
          <Field label="Meta Lindora (US$)"><Input inputMode="decimal" value={form.savingsGoalTotalCents} onChange={(e) => setForm({ ...form, savingsGoalTotalCents: e.target.value })} /></Field>
        </Card>
      </section>

      <Button type="submit" loading={save.isPending} disabled={!dirty}>Guardar reglas</Button>
    </form>
  )
}

export default function Settings() {
  const { isAdmin } = useAuth()
  return (
    <div className="max-w-4xl space-y-8">
      <PageHeader eyebrow={isAdmin ? 'Ajustes' : 'Cuenta'} title={isAdmin ? 'Reglas y cuenta' : 'Mi cuenta'} />
      {isAdmin && <Policies />}
      <section>
        <SectionTitle>Mi cuenta</SectionTitle>
        <AccountActions />
      </section>
    </div>
  )
}
