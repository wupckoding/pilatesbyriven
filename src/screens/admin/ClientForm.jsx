import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { TriangleAlert } from 'lucide-react'
import { api } from '../../lib/api'
import { CLIENT_STATUS, MODALITY, SOURCE, fmtPhone } from '../../lib/format'
import { Button, Field, Input, Select, Textarea } from '../../ui'
import Sheet from '../../ui/Sheet'
import { useToast } from '../../ui/Toast'

const BLANK = {
  fullName: '', whatsapp: '', email: '', status: 'interested', source: 'instagram', preferredModality: '',
  preferredDays: '', nextFollowupOn: '', homeGroupId: '', internalNotes: '', birthDate: '', emergencyName: '', emergencyPhone: '',
}

/** Alta y edición de la ficha. Antes de crear avisa de posibles duplicados por WhatsApp o correo. */
export default function ClientForm({ client, onClose, onSaved }) {
  const toast = useToast()
  const qc = useQueryClient()
  const editing = !!client
  const [form, setForm] = useState(() => {
    if (!client) return BLANK
    const filled = { ...BLANK }
    for (const key of Object.keys(BLANK)) filled[key] = client[key] ?? ''
    return filled
  })
  const [error, setError] = useState(null)
  const [duplicates, setDuplicates] = useState(null)
  const groups = useQuery({ queryKey: ['groups'], queryFn: () => api.get('/admin/groups') })

  const set = (key) => (e) => { setForm((f) => ({ ...f, [key]: e.target.value })); setError(null); setDuplicates(null) }
  const fieldError = (name) => (error?.data?.field === name ? error.message : undefined)

  const save = useMutation({
    mutationFn: (confirmDuplicate = false) => {
      const body = {
        fullName: form.fullName.trim(),
        whatsapp: form.whatsapp.trim() || null,
        email: form.email.trim() || null,
        status: form.status,
        source: form.source,
        preferredModality: form.preferredModality || null,
        preferredDays: form.preferredDays.trim(),
        nextFollowupOn: form.nextFollowupOn || null,
        homeGroupId: form.homeGroupId || null,
        internalNotes: form.internalNotes.trim(),
        birthDate: form.birthDate || null,
        emergencyName: form.emergencyName.trim(),
        emergencyPhone: form.emergencyPhone.trim(),
      }
      return editing
        ? api.patch(`/admin/clients/${client.id}`, body)
        : api.post('/admin/clients', { ...body, confirmDuplicate })
    },
    onSuccess: async ({ client: saved }) => {
      await Promise.all(['clients', 'client', 'dashboard'].map((key) => qc.invalidateQueries({ queryKey: [key] })))
      toast.success(editing ? 'Ficha actualizada' : `Ficha creada · ${saved.studentCode}`)
      onSaved?.(saved)
      onClose()
    },
    onError: (err) => {
      if (err.code === 'POSSIBLE_DUPLICATE') setDuplicates(err.data.duplicates)
      else setError(err)
    },
  })

  return (
    <Sheet
      open
      onClose={onClose}
      size="lg"
      title={editing ? 'Editar ficha' : 'Nueva clienta'}
      subtitle={editing ? client.studentCode : 'El ID de alumna se asigna automáticamente al guardar.'}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          {duplicates
            ? <Button variant="clay" loading={save.isPending} onClick={() => save.mutate(true)}>Crear de todos modos</Button>
            : <Button loading={save.isPending} onClick={() => save.mutate(false)}>{editing ? 'Guardar cambios' : 'Crear ficha'}</Button>}
        </>
      )}
    >
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(!!duplicates) }}>
        <Field label="Nombre completo" error={fieldError('fullName')}>
          <Input value={form.fullName} onChange={set('fullName')} autoComplete="off" maxLength={120} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="WhatsApp" hint="Sin código de país se asume Costa Rica (+506)." error={fieldError('whatsapp')}>
            <Input type="tel" inputMode="tel" value={form.whatsapp} onChange={set('whatsapp')} placeholder="8888 7777" autoComplete="off" />
          </Field>
          <Field label="Correo" optional error={fieldError('email')}>
            <Input type="email" inputMode="email" value={form.email} onChange={set('email')} autoComplete="off" autoCapitalize="none" />
          </Field>
        </div>

        {duplicates && (
          <div className="rounded-3xl border border-honey/30 bg-honey-soft p-4" role="alert">
            <p className="flex items-center gap-2 text-sm font-semibold text-honey">
              <TriangleAlert className="h-4 w-4" aria-hidden="true" /> Puede que esta clienta ya tenga ficha
            </p>
            <ul className="mt-3 space-y-2">
              {duplicates.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{d.fullName}</p>
                    <p className="tnum text-xs text-ink-3">{d.studentCode} · {fmtPhone(d.whatsapp) || d.email}</p>
                  </div>
                  <Link to={`/clientas/${d.id}`} onClick={onClose} className="shrink-0 text-[13px] font-semibold text-clay-deep hover:underline">Abrir ficha</Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Estado">
            <Select value={form.status} onChange={set('status')}>
              {Object.entries(CLIENT_STATUS).map(([value, s]) => <option key={value} value={value}>{s.label}</option>)}
            </Select>
          </Field>
          <Field label="Origen">
            <Select value={form.source} onChange={set('source')}>
              {Object.entries(SOURCE).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
          </Field>
          <Field label="Modalidad preferida" optional>
            <Select value={form.preferredModality} onChange={set('preferredModality')}>
              <option value="">Sin preferencia</option>
              {Object.entries(MODALITY).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
          </Field>
          <Field label="Grupo habitual" optional>
            <Select value={form.homeGroupId} onChange={set('homeGroupId')}>
              <option value="">Sin grupo</option>
              {groups.data?.groups.filter((g) => g.isActive || g.id === form.homeGroupId).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </Select>
          </Field>
          <Field label="Días preferidos" optional>
            <Input value={form.preferredDays} onChange={set('preferredDays')} placeholder="Martes y jueves por la tarde" maxLength={200} />
          </Field>
          <Field label="Próximo seguimiento" optional>
            <Input type="date" value={form.nextFollowupOn} onChange={set('nextFollowupOn')} />
          </Field>
          <Field label="Fecha de nacimiento" optional error={fieldError('birthDate')}>
            <Input type="date" value={form.birthDate} onChange={set('birthDate')} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Contacto de emergencia" optional>
            <Input value={form.emergencyName} onChange={set('emergencyName')} maxLength={120} />
          </Field>
          <Field label="Teléfono de emergencia" optional>
            <Input type="tel" inputMode="tel" value={form.emergencyPhone} onChange={set('emergencyPhone')} maxLength={40} />
          </Field>
        </div>
        <Field label="Notas operativas" hint="Solo las ve el personal autorizado. No escribas aquí información clínica." optional>
          <Textarea value={form.internalNotes} onChange={set('internalNotes')} rows={3} maxLength={4000} />
        </Field>
        {error && !error.data?.field && <p className="rounded-2xl bg-terracotta-soft px-4 py-3 text-sm font-medium text-terracotta" role="alert">{error.message}</p>}
        <button type="submit" hidden />
      </form>
    </Sheet>
  )
}
