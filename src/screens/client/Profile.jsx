import React, { useEffect, useState } from 'react'
import { useAuth } from '../../lib/auth'
import { fmtPhone } from '../../lib/format'
import { Avatar, Button, Card, Field, Input, SectionTitle } from '../../ui'
import { useToast } from '../../ui/Toast'
import AccountActions from '../Account'

export default function Profile() {
  const { user, client, updateProfile } = useAuth()
  const toast = useToast()
  const initial = {
    fullName: client?.fullName || user.fullName || '',
    whatsapp: fmtPhone(client?.whatsapp) || '',
    birthDate: client?.birthDate || '',
    emergencyName: client?.emergencyName || '',
    emergencyPhone: client?.emergencyPhone || '',
  }
  const [form, setForm] = useState(initial)
  // Tras guardar, el formulario toma los valores normalizados por el servidor.
  useEffect(() => { setForm(initial) }, [client]) // eslint-disable-line react-hooks/exhaustive-deps
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const dirty = Object.keys(initial).some((key) => form[key] !== initial[key])
  const set = (key) => (e) => { setForm((f) => ({ ...f, [key]: e.target.value })); setError(null) }
  const fieldError = (name) => (error?.data?.field === name ? error.message : undefined)

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await updateProfile({
        fullName: form.fullName.trim(),
        whatsapp: form.whatsapp.trim(),
        birthDate: form.birthDate || null,
        emergencyName: form.emergencyName.trim(),
        emergencyPhone: form.emergencyPhone.trim(),
      })
      toast.success('Datos actualizados')
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 lg:mx-0 lg:grid lg:max-w-none lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-start lg:gap-x-10 lg:gap-y-8 lg:space-y-0">
      <header className="flex items-center gap-4 lg:col-span-2">
        <Avatar name={user.fullName} size="lg" />
        <div className="min-w-0">
          <p className="eyebrow tnum mb-1">ID de alumna · {client?.studentCode}</p>
          <h1 className="display break-words text-[28px] text-ink sm:text-[34px]">{user.fullName}</h1>
          <p className="truncate text-sm text-ink-3">{user.email}</p>
        </div>
      </header>

      <section>
        <SectionTitle>Mis datos</SectionTitle>
        <Card className="p-5 sm:p-6">
          <form onSubmit={save} className="space-y-4">
            <Field label="Nombre completo" error={fieldError('fullName')}>
              <Input value={form.fullName} onChange={set('fullName')} autoComplete="name" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="WhatsApp" error={fieldError('whatsapp')}>
                <Input type="tel" inputMode="tel" value={form.whatsapp} onChange={set('whatsapp')} autoComplete="tel" />
              </Field>
              <Field label="Fecha de nacimiento" optional error={fieldError('birthDate')}>
                <Input type="date" value={form.birthDate} onChange={set('birthDate')} />
              </Field>
              <Field label="Contacto de emergencia" optional>
                <Input value={form.emergencyName} onChange={set('emergencyName')} maxLength={120} />
              </Field>
              <Field label="Teléfono de emergencia" optional>
                <Input type="tel" inputMode="tel" value={form.emergencyPhone} onChange={set('emergencyPhone')} maxLength={40} />
              </Field>
            </div>
            {error && !error.data?.field && <p className="rounded-2xl bg-terracotta-soft px-4 py-3 text-sm font-medium text-terracotta" role="alert">{error.message}</p>}
            <Button type="submit" loading={busy} disabled={!dirty}>Guardar cambios</Button>
          </form>
        </Card>
      </section>

      <section>
        <SectionTitle>Cuenta</SectionTitle>
        <AccountActions />
      </section>
    </div>
  )
}
