import React, { useEffect, useRef, useState } from 'react'
import { MailCheck } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { Button, Field, Input } from '../ui'
import { useToast } from '../ui/Toast'
import { AuthLayout } from './AuthScreen'

const WAIT = 60

/** Paso obligatorio tras crear la cuenta: escribir el código de 6 dígitos que llegó al correo. */
export default function VerifyEmail() {
  const { user, verifyEmail, resendCode, logout } = useAuth()
  const toast = useToast()
  const [code, setCode] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [resending, setResending] = useState(false)
  const [wait, setWait] = useState(WAIT)
  const submitted = useRef('')
  const inputRef = useRef(null)
  const [shake, setShake] = useState(0)

  useEffect(() => {
    if (wait <= 0) return undefined
    const id = setTimeout(() => setWait((w) => w - 1), 1000)
    return () => clearTimeout(id)
  }, [wait])

  const submit = async (value = code) => {
    if (busy || value.length !== 6) return
    setBusy(true)
    setError(null)
    submitted.current = value
    try {
      await verifyEmail(value)
      toast.success('Correo confirmado')
    } catch (err) {
      setError(err)
      setBusy(false)
      setCode('')
      setShake((n) => n + 1)
      inputRef.current?.focus()
    }
  }

  const onChange = (e) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 6)
    setCode(value)
    if (value) setError(null)
    // Al completar los 6 dígitos se envía solo (una vez por código escrito).
    if (value.length === 6 && value !== submitted.current) submit(value)
  }

  const resend = async () => {
    if (resending || wait > 0) return
    setResending(true)
    setError(null)
    try {
      await resendCode()
      setCode('')
      submitted.current = ''
      setWait(WAIT)
      toast.success('Te enviamos un código nuevo')
    } catch (err) {
      if (err.data?.retryAfter) setWait(err.data.retryAfter)
      setError(err)
    } finally {
      setResending(false)
    }
  }

  return (
    <AuthLayout>
      <span className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-full bg-clay-soft text-clay-deep">
        <MailCheck className="h-6 w-6" aria-hidden="true" />
      </span>
      <h1 className="display text-[38px] text-ink">Confirma tu correo</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
        Enviamos un código de 6 dígitos a <span className="font-semibold text-ink [overflow-wrap:anywhere]">{user.email}</span>.
        Escríbelo aquí para activar tu cuenta.
      </p>

      <form onSubmit={(e) => { e.preventDefault(); submit() }} className="mt-7 space-y-4" noValidate>
        <Field label="Código de verificación" htmlFor="verify-code" error={error?.message}>
          <Input
            key={shake}
            ref={inputRef}
            id="verify-code"
            value={code}
            onChange={onChange}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            placeholder="······"
            autoFocus
            aria-invalid={error ? true : undefined}
            className={`text-center font-semibold tracking-[0.5em] !text-[24px] ${shake ? 'shake' : ''}`}
          />
        </Field>
        <Button type="submit" size="lg" block loading={busy} disabled={code.length !== 6}>Confirmar</Button>
      </form>

      <div className="mt-6 space-y-1 text-center text-sm text-ink-3">
        <p>¿No llegó? Revisa la carpeta de spam o promociones.</p>
        <button
          type="button"
          onClick={resend}
          disabled={wait > 0 || resending}
          className="inline-flex min-h-[44px] items-center font-semibold text-clay-deep underline underline-offset-2 disabled:text-ink-3 disabled:no-underline"
        >
          {wait > 0 ? `Enviar otro código en ${wait} s` : 'Enviar otro código'}
        </button>
      </div>

      <button type="button" onClick={logout} className="mx-auto mt-2 inline-flex min-h-[44px] items-center text-sm font-medium text-ink-3 hover:text-ink">
        Usar otro correo
      </button>
    </AuthLayout>
  )
}
