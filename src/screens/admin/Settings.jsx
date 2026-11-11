import React, { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { Button, Card, ErrorState, Field, Input, PageHeader, SectionTitle, Skeleton } from '../../ui'
import { useToast } from '../../ui/Toast'
import AccountActions from '../Account'

function Policies() {
  const toast = useToast()
  const qc = useQueryClient()
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['settings'], queryFn: () => api.get('/admin/settings') })
  const [form, setForm] = useState(null)
  useEffect(() => { if (data && !form) setForm({ cancelWindowHours: data.settings.cancelWindowHours, renewalNoticeDays: data.settings.renewalNoticeDays }) }, [data, form])

  const save = useMutation({
    mutationFn: () => api.put('/admin/settings', { cancelWindowHours: Number(form.cancelWindowHours), renewalNoticeDays: Number(form.renewalNoticeDays) }),
    onSuccess: (res) => { qc.setQueryData(['settings'], res); toast.success('Reglas guardadas') },
    onError: toast.error,
  })

  if (isLoading || !form) return isError ? <ErrorState error={error} onRetry={refetch} /> : <Skeleton className="h-48" />
  const dirty = Number(form.cancelWindowHours) !== data.settings.cancelWindowHours || Number(form.renewalNoticeDays) !== data.settings.renewalNoticeDays

  return (
    <Card className="p-5 sm:p-6">
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate() }}>
        <Field label="Aviso mínimo para cancelar (horas)" hint="Con menos aviso, la cancelación queda marcada como tardía.">
          <Input type="number" inputMode="numeric" min={0} max={72} value={form.cancelWindowHours} onChange={(e) => setForm({ ...form, cancelWindowHours: e.target.value })} />
        </Field>
        <Field label="Aviso de renovación (días antes)" hint="Se usará en los avisos de renovación de paquetes.">
          <Input type="number" inputMode="numeric" min={0} max={30} value={form.renewalNoticeDays} onChange={(e) => setForm({ ...form, renewalNoticeDays: e.target.value })} />
        </Field>
        <div className="sm:col-span-2">
          <Button type="submit" loading={save.isPending} disabled={!dirty}>Guardar reglas</Button>
        </div>
      </form>
    </Card>
  )
}

export default function Settings() {
  const { isAdmin } = useAuth()
  return (
    <div className="max-w-3xl space-y-8">
      <PageHeader eyebrow={isAdmin ? 'Ajustes' : 'Cuenta'} title={isAdmin ? 'Reglas y cuenta' : 'Mi cuenta'} />
      {isAdmin && (
        <section>
          <SectionTitle>Reglas del estudio</SectionTitle>
          <Policies />
        </section>
      )}
      <section>
        <SectionTitle>Mi cuenta</SectionTitle>
        <AccountActions />
      </section>
    </div>
  )
}
