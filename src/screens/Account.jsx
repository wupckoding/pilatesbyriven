import React, { useState } from 'react'
import { KeyRound, LogOut, ShieldCheck, Trash2 } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { Button, Card, Field, Input } from '../ui'
import Sheet from '../ui/Sheet'
import { useToast } from '../ui/Toast'
import { PrivacyNotice } from './AuthScreen'

function ChangePassword({ onClose }) {
  const { changePassword, user } = useAuth()
  const hasPassword = user.hasPassword !== false
  const toast = useToast()
  const [form, setForm] = useState({ current: '', next: '' })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e?.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await changePassword(hasPassword ? form.current : undefined, form.next)
      toast.success(hasPassword ? 'Contraseña actualizada' : 'Contraseña creada')
      onClose()
    } catch (err) {
      setError(err)
      setBusy(false)
    }
  }
  const fieldError = (name) => (error?.data?.field === name ? error.message : undefined)
  return (
    <Sheet
      open
      onClose={onClose}
      size="sm"
      title={hasPassword ? 'Cambiar contraseña' : 'Crear contraseña'}
      subtitle={hasPassword ? 'Se cerrará la sesión en tus otros dispositivos.' : 'Entraste con Google. Con una contraseña también podrás entrar con tu correo.'}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button loading={busy} onClick={submit}>Guardar</Button></>}
    >
      <form onSubmit={submit} className="space-y-4">
        {hasPassword && (
          <Field label="Contraseña actual" error={fieldError('currentPassword')}>
            <Input type="password" autoComplete="current-password" value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} />
          </Field>
        )}
        <Field label="Nueva contraseña" hint="Mínimo 8 caracteres." error={fieldError('newPassword')}>
          <Input type="password" autoComplete="new-password" value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} />
        </Field>
        {error && !error.data?.field && <p className="rounded-2xl bg-terracotta-soft px-4 py-3 text-sm font-medium text-terracotta" role="alert">{error.message}</p>}
        <button type="submit" hidden />
      </form>
    </Sheet>
  )
}

function DeleteAccount({ onClose }) {
  const { deleteAccount, user } = useAuth()
  const hasPassword = user.hasPassword !== false
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e?.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await deleteAccount(hasPassword ? { password } : { confirm: password })
    } catch (err) {
      setError(err)
      setBusy(false)
    }
  }
  return (
    <Sheet
      open
      onClose={onClose}
      size="sm"
      title="Eliminar mi cuenta"
      footer={<><Button variant="ghost" onClick={onClose}>Conservar mi cuenta</Button><Button variant="danger" loading={busy} onClick={submit}>Eliminar definitivamente</Button></>}
    >
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm leading-relaxed text-ink-2">
          Se cancelarán tus reservas futuras y perderás el acceso a la app. Esta acción no se puede deshacer.
          El estudio conserva el registro de clases y pagos pasados que exige su contabilidad.
        </p>
        {hasPassword ? (
          <Field label="Escribe tu contraseña para confirmar" error={error?.message}>
            <Input type="password" autoComplete="current-password" value={password} onChange={(e) => { setPassword(e.target.value); setError(null) }} />
          </Field>
        ) : (
          <Field label="Escribe ELIMINAR para confirmar" error={error?.message}>
            <Input autoComplete="off" autoCapitalize="characters" value={password} onChange={(e) => { setPassword(e.target.value); setError(null) }} />
          </Field>
        )}
        <button type="submit" hidden />
      </form>
    </Sheet>
  )
}

const Item = ({ icon: Icon, label, hint, onClick, danger = false }) => (
  <button type="button" onClick={onClick} className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-clay-soft/30">
    <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${danger ? 'bg-terracotta-soft text-terracotta' : 'bg-clay-soft text-clay-deep'}`}>
      <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
    </span>
    <span className="min-w-0 flex-1">
      <span className={`block text-sm font-semibold ${danger ? 'text-terracotta' : 'text-ink'}`}>{label}</span>
      {hint && <span className="block text-[13px] text-ink-3">{hint}</span>}
    </span>
  </button>
)

/** Acciones de cuenta comunes a todos los roles: contraseña, privacidad, salir y eliminar cuenta. */
export default function AccountActions() {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(null)
  return (
    <>
      <Card className="divide-y divide-line overflow-hidden">
        <Item icon={KeyRound} label={user.hasPassword === false ? 'Crear contraseña' : 'Cambiar contraseña'} hint={user.email} onClick={() => setOpen('password')} />
        <Item icon={ShieldCheck} label="Aviso de privacidad" onClick={() => setOpen('privacy')} />
        <Item icon={LogOut} label="Cerrar sesión" onClick={logout} />
        {user.role === 'client' && <Item icon={Trash2} label="Eliminar mi cuenta" hint="Borra tu acceso y cancela tus reservas futuras." danger onClick={() => setOpen('delete')} />}
      </Card>
      {open === 'password' && <ChangePassword onClose={() => setOpen(null)} />}
      {open === 'delete' && <DeleteAccount onClose={() => setOpen(null)} />}
      <Sheet open={open === 'privacy'} onClose={() => setOpen(null)} title="Aviso de privacidad" size="sm"><PrivacyNotice /></Sheet>
    </>
  )
}
