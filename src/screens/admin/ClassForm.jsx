import React, { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { KIND, MODALITY, WEEKDAYS, fmtDate, todayCR } from '../../lib/format'
import { Button, Field, Input, Segmented, Select } from '../../ui'
import Sheet from '../../ui/Sheet'
import { useToast } from '../../ui/Toast'

const BLANK = { name: '', modality: 'reformer', kind: 'group', weekday: 2, startTime: '18:00', localDate: '', localTime: '18:00', durationMin: 60, capacity: 3, instructorId: '', openBooking: true, isActive: true }

const fromSession = (s) => ({
  ...BLANK,
  name: s.name, modality: s.modality, kind: s.kind, localDate: s.localDate, localTime: s.localTime,
  durationMin: s.durationMin, capacity: s.capacity, instructorId: s.instructorId || '', openBooking: s.openBooking,
})

/**
 * Formulario único: grupo recurrente (nuevo o edición), clase suelta nueva y edición de una clase.
 * Al editar una clase de un grupo se elige si el cambio es solo para ella o para ella y las siguientes.
 */
export default function ClassForm({ mode, group, session, hasBookings = false, onClose, onSaved }) {
  const toast = useToast()
  const qc = useQueryClient()
  const editingGroup = mode === 'group' && !!group
  const editingSession = mode === 'edit' && !!session
  const editing = editingGroup || editingSession
  const [form, setForm] = useState(() => (
    editingSession ? fromSession(session)
      : editingGroup ? { ...BLANK, ...group, instructorId: group.instructorId || '' }
        : { ...BLANK, localDate: todayCR() }))
  const [scope, setScope] = useState('one') // one | series (solo clases de un grupo)
  const [error, setError] = useState(null)
  const staff = useQuery({ queryKey: ['staff'], queryFn: () => api.get('/admin/staff') })
  const series = editingSession && session.groupId && scope === 'series'
  const dated = mode === 'session' || (editingSession && !series)

  const set = (key, cast = (v) => v) => (e) => {
    setForm((f) => ({ ...f, [key]: cast(e.target.type === 'checkbox' ? e.target.checked : e.target.value) }))
    setError(null)
  }
  const fieldError = (name) => (error?.data?.field === name ? error.message : undefined)

  const save = useMutation({
    mutationFn: async () => {
      const base = {
        name: form.name.trim(), modality: form.modality, durationMin: Number(form.durationMin), capacity: Number(form.capacity),
        instructorId: form.instructorId || null, openBooking: form.openBooking,
      }
      if (editingSession) {
        if (series) {
          const saved = await api.patch(`/admin/groups/${session.groupId}`, { ...base, startTime: form.localTime, effectiveFrom: session.localDate })
          // Una clase ya ajustada a mano no la toca la serie: se actualiza también para que quede igual.
          if (session.isOverride) await api.patch(`/admin/sessions/${session.id}`, { ...base, localTime: form.localTime })
          // Si cambió la hora, también hay que avisar a quienes reservaron esta clase.
          return { ...saved, series: true, affected: form.localTime !== session.localTime ? 1 : 0 }
        }
        return api.patch(`/admin/sessions/${session.id}`, { ...base, kind: form.kind, localDate: form.localDate, localTime: form.localTime })
      }
      if (mode === 'session') return api.post('/admin/sessions', { ...base, kind: form.kind, localDate: form.localDate, localTime: form.localTime })
      if (editingGroup) return api.patch(`/admin/groups/${group.id}`, { ...base, startTime: form.startTime, isActive: form.isActive })
      return api.post('/admin/groups', { ...base, kind: form.kind, weekday: Number(form.weekday), startTime: form.startTime })
    },
    onSuccess: async (data) => {
      await Promise.all(['agenda', 'groups', 'dashboard', 'session', 'admin-bookings'].map((key) => qc.invalidateQueries({ queryKey: [key] })))
      toast.success(
        editingSession ? (data.series ? 'Cambios aplicados a esta y las próximas clases' : 'Clase actualizada')
          : mode === 'session' ? 'Clase creada' : editingGroup ? 'Grupo actualizado' : 'Grupo creado con sus próximas clases')
      if (data.conflicts?.length) toast.error('Ojo: la instructora ya tiene otra clase a esa hora')
      onSaved?.(data, form)
      onClose()
    },
    onError: setError,
  })

  const title = editingSession ? 'Editar clase' : mode === 'session' ? 'Clase suelta' : editingGroup ? 'Editar grupo' : 'Nuevo grupo'
  const subtitle = editingSession
    ? (session.groupId ? 'Esta clase es parte de un grupo fijo.' : 'Clase con fecha única.')
    : mode === 'session'
      ? 'Una clase con fecha única: prueba, privada o reposición.'
      : editingGroup ? 'Los cambios aplican a las clases futuras. Lo ya ocurrido y los cambios puntuales se conservan.' : 'Se repite cada semana y genera sus clases automáticamente.'
  const timeKey = dated || editingSession ? 'localTime' : 'startTime'

  return (
    <Sheet
      open
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>{editing ? 'Guardar cambios' : 'Crear'}</Button>
        </>
      )}
    >
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate() }}>
        {editingSession && session.groupId && (
          <div className="space-y-2">
            <Segmented
              label="Aplicar a"
              value={scope}
              onChange={(v) => { setScope(v); setError(null) }}
              options={[{ value: 'one', label: 'Solo esta clase' }, { value: 'series', label: 'Esta y las siguientes' }]}
            />
            <p className="text-[13px] text-ink-3">
              {series
                ? `Cambia el grupo desde el ${fmtDate(session.localDate, { day: 'numeric', month: 'long' })}. Para cambiar de día, crea un grupo nuevo.`
                : 'Las demás clases del grupo siguen igual.'}
            </p>
          </div>
        )}
        <Field label="Nombre" error={fieldError('name')}>
          <Input value={form.name} onChange={set('name')} placeholder={mode === 'group' ? 'Martes 6:00 p. m.' : 'Clase de prueba · Valeria'} maxLength={80} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Modalidad" error={fieldError('modality')}>
            <Select value={form.modality} onChange={set('modality')}>
              {Object.entries(MODALITY).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
          </Field>
          <Field label="Tipo" error={fieldError('kind')} hint={editingSession && hasBookings && !series ? 'Con reservas no se cambia.' : undefined}>
            <Select value={form.kind} onChange={set('kind')} disabled={editingGroup || series || (editingSession && hasBookings)}>
              {Object.entries(KIND).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {dated ? (
            <Field label="Fecha" error={fieldError('localDate')}>
              <Input type="date" value={form.localDate} min={todayCR()} onChange={set('localDate')} />
            </Field>
          ) : (
            <Field label="Día" hint={editing ? 'Para cambiar de día, crea un grupo nuevo.' : undefined}>
              <Select value={series ? new Date(`${session.localDate}T12:00:00Z`).getUTCDay() : form.weekday} onChange={set('weekday')} disabled={editing}>
                {[1, 2, 3, 4, 5, 6, 0].map((d) => <option key={d} value={d}>{WEEKDAYS[d]}</option>)}
              </Select>
            </Field>
          )}
          <Field label="Hora" error={fieldError(timeKey) || fieldError('startTime')}>
            <Input type="time" value={form[timeKey]} onChange={set(timeKey)} step={300} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Duración (min)" error={fieldError('durationMin')}>
            <Input type="number" inputMode="numeric" min={15} max={240} step={5} value={form.durationMin} onChange={set('durationMin')} />
          </Field>
          <Field label="Capacidad" error={fieldError('capacity')}>
            <Input type="number" inputMode="numeric" min={1} max={50} value={form.capacity} onChange={set('capacity')} />
          </Field>
        </div>
        <Field label="Instructora" optional>
          <Select value={form.instructorId} onChange={set('instructorId')}>
            <option value="">Sin asignar</option>
            {staff.data?.staff.map((s) => <option key={s.id} value={s.id}>{s.fullName || s.email}</option>)}
          </Select>
        </Field>
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line bg-surface p-4">
          <input type="checkbox" checked={form.openBooking} onChange={set('openBooking')} className="mt-0.5 h-5 w-5 accent-[#8A6548]" />
          <span>
            <span className="block text-sm font-semibold text-ink">Reservable desde la app</span>
            <span className="block text-[13px] text-ink-3">Si lo desactivas, solo administración asigna los cupos.</span>
          </span>
        </label>
        {editingGroup && (
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line bg-surface p-4">
            <input type="checkbox" checked={form.isActive} onChange={set('isActive')} className="mt-0.5 h-5 w-5 accent-[#8A6548]" />
            <span>
              <span className="block text-sm font-semibold text-ink">Grupo activo</span>
              <span className="block text-[13px] text-ink-3">Al desactivarlo se quitan las clases futuras sin reservas; las que tienen reservas quedan para resolver.</span>
            </span>
          </label>
        )}
        {error && !error.data?.field && <p className="rounded-2xl bg-terracotta-soft px-4 py-3 text-sm font-medium text-terracotta" role="alert">{error.message}</p>}
        <button type="submit" hidden />
      </form>
    </Sheet>
  )
}
