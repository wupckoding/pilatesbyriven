import React, { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

const SCRIPT = 'https://accounts.google.com/gsi/client'
let scriptPromise

function loadScript() {
  if (window.google?.accounts?.id) return Promise.resolve()
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const el = document.createElement('script')
      el.src = SCRIPT
      el.async = true
      el.onload = resolve
      el.onerror = () => { scriptPromise = null; reject(new Error('google')) }
      document.head.appendChild(el)
    })
  }
  return scriptPromise
}

/**
 * Botón oficial "Continuar con Google". Solo aparece si el servidor tiene configurado el acceso con Google
 * y el script de Google logra cargar; si no, la pantalla queda igual que sin él.
 */
export default function GoogleButton({ onCredential }) {
  const { data } = useQuery({ queryKey: ['auth-config'], queryFn: () => api.get('/auth/config'), staleTime: Infinity, retry: false })
  const clientId = data?.googleClientId
  const holder = useRef(null)
  const callback = useRef(onCredential)
  callback.current = onCredential
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!clientId) return undefined
    let cancelled = false
    loadScript().then(() => {
      if (cancelled || !holder.current) return
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => response?.credential && callback.current(response.credential),
        ux_mode: 'popup',
        auto_select: false,
      })
      const width = Math.min(400, Math.max(240, Math.floor(holder.current.getBoundingClientRect().width)))
      window.google.accounts.id.renderButton(holder.current, {
        type: 'standard', theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with', logo_alignment: 'center', locale: 'es', width,
      })
      setReady(true)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [clientId])

  if (!clientId) return null
  return (
    <div className={ready ? 'mt-6' : 'hidden'}>
      <div className="mb-6 flex items-center gap-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-3" aria-hidden="true">
        <span className="h-px flex-1 bg-line" />o<span className="h-px flex-1 bg-line" />
      </div>
      {/* Google dibuja aquí su propio botón (no se puede restilizar por sus normas de marca). */}
      <div ref={holder} className="flex min-h-[44px] justify-center" />
    </div>
  )
}
