import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { Button, Field, Input, Logo, Segmented } from '../ui'
import Sheet from '../ui/Sheet'
import GoogleButton from './GoogleButton'
import NativeSignIn from './NativeSignIn'
import { isNative } from '../lib/native'

const MODES = [
  { value: 'login', label: 'Iniciar sesión' },
  { value: 'register', label: 'Crear cuenta' },
]

export function PrivacyNotice() {
  return (
    <div className="space-y-4 text-sm leading-relaxed text-ink-2">
      <p className="rounded-2xl bg-honey-soft px-4 py-3 font-medium text-honey">
        Borrador: el texto definitivo está pendiente de revisión legal antes de publicar.
      </p>
      <p>
        Pilates by Riven usa tus datos de contacto (nombre, correo y WhatsApp) para gestionar tu cuenta,
        tus reservas y la comunicación sobre tus clases.
      </p>
      <p>
        Solo tú y el personal autorizado del estudio pueden ver tu información. No la compartimos con terceros
        para fines comerciales.
      </p>
      <p>
        Puedes consultar, corregir o eliminar tu cuenta y tus datos desde tu perfil en cualquier momento,
        conforme a la Ley 8968 de Costa Rica.
      </p>
    </div>
  )
}

/** Marco común de las pantallas de acceso: panel de marca en computadora, logo arriba en el celular. */
export function AuthLayout({ children }) {
  return (
    <div className="flex h-full bg-canvas">
      <div className="grain relative hidden w-[46%] flex-col justify-between overflow-hidden bg-espresso p-14 text-white lg:flex">
        <Logo tone="white" size="md" className="page-in items-start" />
        <div className="stagger-in">
          <p className="display text-[64px] leading-[0.98]">
            Tu práctica,<br /><em className="text-clay">a tu ritmo.</em>
          </p>
          <p className="mt-6 max-w-sm text-[15px] leading-relaxed text-white/70">
            Reserva tus clases, consulta tu agenda y lleva el control de tu paquete desde un solo lugar.
          </p>
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/50">Strength · Control · Elegance</p>
      </div>

      <div className="scroll-area pt-safe pb-safe flex flex-1 flex-col">
        <div className="stagger-in mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center px-6 py-10">
          <div className="mb-10 flex flex-col items-center lg:hidden">
            <Logo size="lg" />
            <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.3em] text-ink-3">Strength · Control · Elegance</p>
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}

export function PrivacyCheck({ checked, onChange, onOpen, error }) {
  return (
    <div>
      <label className="flex cursor-pointer items-start gap-3 text-sm leading-snug text-ink-2">
        <input
          type="checkbox"
          checked={checked}
          onChange={onChange}
          className="mt-0.5 h-5 w-5 shrink-0 rounded-md border-line accent-[#8A6548]"
        />
        <span>
          Acepto el{' '}
          <button type="button" onClick={onOpen} className="font-semibold text-clay-deep underline underline-offset-2">
            aviso de privacidad
          </button>
          .
        </span>
      </label>
      {error && <p className="mt-1.5 text-[13px] font-medium text-terracotta" role="alert">{error}</p>}
    </div>
  )
}

/** Primera vez con Google o Apple: faltan el WhatsApp y aceptar el aviso de privacidad. */
function SocialDetails({ pending, onCancel, onOpenPrivacy }) {
  const navigate = useNavigate()
  const [whatsapp, setWhatsapp] = useState('')
  const [accept, setAccept] = useState(false)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const fieldError = (name) => (error?.data?.field === name ? error.message : undefined)

  const submit = async (e) => {
    e.preventDefault()
    if (busy) return
    if (!accept) return setError({ message: 'Debes aceptar el aviso de privacidad', data: { field: 'acceptPrivacy' } })
    setBusy(true)
    setError(null)
    try {
      await pending.retry({ whatsapp, acceptPrivacy: true })
      navigate('/admision', { replace: true })
    } catch (err) {
      setError(err)
      setBusy(false)
    }
  }

  return (
    <>
      <h1 className="display text-[38px] text-ink">Un último paso</h1>
      <p className="mt-2 text-[15px] text-ink-2">
        {pending.email
          ? <>Vas a crear tu cuenta con <span className="font-semibold text-ink">{pending.email}</span>. Solo nos falta tu WhatsApp.</>
          : 'Solo nos falta tu WhatsApp para crear tu cuenta.'}
      </p>
      <form onSubmit={submit} className="mt-7 space-y-4" noValidate>
        <Field label="WhatsApp" hint="Si no es de Costa Rica, incluye el código de país (+1, +34…)." error={fieldError('whatsapp')}>
          <Input type="tel" value={whatsapp} onChange={(e) => { setWhatsapp(e.target.value); setError(null) }} autoComplete="tel" inputMode="tel" placeholder="8888 7777" autoFocus required />
        </Field>
        <PrivacyCheck checked={accept} onChange={(e) => { setAccept(e.target.checked); setError(null) }} onOpen={onOpenPrivacy} error={fieldError('acceptPrivacy')} />
        {error && !error.data?.field && (
          <p className="rounded-2xl bg-terracotta-soft px-4 py-3 text-sm font-medium text-terracotta" role="alert">{error.message}</p>
        )}
        <Button type="submit" size="lg" block loading={busy} className="!mt-6">Crear cuenta</Button>
        <Button type="button" variant="ghost" block disabled={busy} onClick={onCancel}>Usar otra cuenta</Button>
      </form>
    </>
  )
}

export default function AuthScreen() {
  const { login, register, google, apple } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ fullName: '', email: '', whatsapp: '', password: '', acceptPrivacy: false })
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [privacyOpen, setPrivacyOpen] = useState(false)
  const [pending, setPending] = useState(null) // { email, retry(datos) } mientras faltan datos de Google o Apple

  // Entra con Google o Apple; si es la primera vez, pide los datos que faltan y reintenta con ellos.
  const social = (signIn) => async (credential) => {
    setError(null)
    try {
      await signIn(credential)
    } catch (err) {
      if (err.code === 'SIGNUP_DETAILS_REQUIRED') {
        setPending({
          email: err.data?.email,
          retry: (extra) => signIn(credential, extra),
        })
      } else setError(err)
    }
  }
  const onGoogle = social(google)
  const onApple = social(apple)

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
    setError(null)
  }
  const fieldError = (name) => (error?.data?.field === name ? error.message : undefined)
  const isRegister = mode === 'register'

  const submit = async (e) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      if (isRegister) {
        await register(form)
        // Recién registrada: el formulario de admisión es lo primero que ve.
        navigate('/admision', { replace: true })
      }
      else await login(form.email, form.password)
    } catch (err) {
      setError(err)
      setBusy(false)
    }
  }

  if (pending) {
    return (
      <AuthLayout>
        <SocialDetails pending={pending} onCancel={() => setPending(null)} onOpenPrivacy={() => setPrivacyOpen(true)} />
        <Sheet open={privacyOpen} onClose={() => setPrivacyOpen(false)} title="Aviso de privacidad" size="sm">
          <PrivacyNotice />
        </Sheet>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
          <h1 className="display text-[38px] text-ink">{isRegister ? 'Crea tu cuenta' : 'Bienvenida de vuelta'}</h1>
          <p className="mt-2 text-[15px] text-ink-2">
            {isRegister ? 'Regístrate para reservar tu primera clase.' : 'Ingresa para ver tus clases y reservas.'}
          </p>

          <Segmented
            className="mt-7 self-start"
            label="Acceso"
            options={MODES}
            value={mode}
            onChange={(next) => { setMode(next); setError(null) }}
          />

          <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
            {isRegister && (
              <Field label="Nombre completo" error={fieldError('fullName')}>
                <Input value={form.fullName} onChange={set('fullName')} autoComplete="name" maxLength={120} required />
              </Field>
            )}
            <Field label="Correo electrónico" error={fieldError('email')}>
              <Input type="email" value={form.email} onChange={set('email')} autoComplete="email" inputMode="email" autoCapitalize="none" required />
            </Field>
            {isRegister && (
              <Field label="WhatsApp" hint="Si no es de Costa Rica, incluye el código de país (+1, +34…)." error={fieldError('whatsapp')}>
                <Input type="tel" value={form.whatsapp} onChange={set('whatsapp')} autoComplete="tel" inputMode="tel" placeholder="8888 7777" required />
              </Field>
            )}
            <Field label="Contraseña" htmlFor="auth-password" hint={isRegister ? 'Mínimo 8 caracteres.' : undefined} error={fieldError('password')}>
              <div className="relative">
                <Input
                  id="auth-password"
                  aria-invalid={fieldError('password') ? true : undefined}
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={set('password')}
                  autoComplete={isRegister ? 'new-password' : 'current-password'}
                  className="pr-12"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  className="absolute right-1.5 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-ink-3 hover:text-ink"
                >
                  {showPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                </button>
              </div>
            </Field>

            {isRegister && (
              <div>
                <label className="flex cursor-pointer items-start gap-3 text-sm leading-snug text-ink-2">
                  <input
                    type="checkbox"
                    checked={form.acceptPrivacy}
                    onChange={set('acceptPrivacy')}
                    className="mt-0.5 h-5 w-5 shrink-0 rounded-md border-line accent-[#8A6548]"
                  />
                  <span>
                    Acepto el{' '}
                    <button type="button" onClick={() => setPrivacyOpen(true)} className="font-semibold text-clay-deep underline underline-offset-2">
                      aviso de privacidad
                    </button>
                    .
                  </span>
                </label>
                {fieldError('acceptPrivacy') && <p className="mt-1.5 text-[13px] font-medium text-terracotta" role="alert">{fieldError('acceptPrivacy')}</p>}
              </div>
            )}

            {error && !error.data?.field && (
              <p className="rounded-2xl bg-terracotta-soft px-4 py-3 text-sm font-medium text-terracotta" role="alert">{error.message}</p>
            )}

            <Button type="submit" size="lg" block loading={busy} className="!mt-6">
              {isRegister ? 'Crear cuenta' : 'Iniciar sesión'}
            </Button>
          </form>

          {isNative
            ? <NativeSignIn onApple={onApple} onGoogle={onGoogle} onError={setError} />
            : <GoogleButton onCredential={onGoogle} />}

          {!isRegister && (
            <p className="mt-6 text-center text-sm text-ink-3">
              ¿Olvidaste tu contraseña? Escríbenos por WhatsApp y te ayudamos.
            </p>
          )}

      <Sheet open={privacyOpen} onClose={() => setPrivacyOpen(false)} title="Aviso de privacidad" size="sm">
        <PrivacyNotice />
      </Sheet>
    </AuthLayout>
  )
}
