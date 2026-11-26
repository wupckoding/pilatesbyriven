import React, { useState } from 'react'
import { appleSignIn, googleSignIn, isCancel, nativeAppleAvailable, nativeGoogleAvailable } from '../lib/native'

function AppleLogo(props) {
  return (
    <svg viewBox="0 0 17 20" aria-hidden="true" {...props}>
      <path fill="currentColor" d="M14.06 10.62c-.02-2.2 1.8-3.26 1.88-3.31-1.03-1.5-2.62-1.7-3.18-1.73-1.35-.14-2.64.8-3.33.8-.69 0-1.74-.78-2.87-.76-1.47.02-2.83.86-3.59 2.18-1.53 2.66-.39 6.6 1.1 8.76.73 1.06 1.6 2.24 2.73 2.2 1.1-.04 1.51-.71 2.84-.71 1.32 0 1.7.71 2.86.69 1.18-.02 1.93-1.07 2.65-2.13.84-1.22 1.18-2.41 1.2-2.47-.03-.01-2.3-.88-2.32-3.5zM11.88 4.16c.6-.73 1.01-1.75.9-2.76-.87.04-1.92.58-2.54 1.31-.56.64-1.05 1.68-.92 2.67.97.08 1.96-.49 2.56-1.22z" />
    </svg>
  )
}

function GoogleLogo(props) {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true" {...props}>
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  )
}

const base = 'flex h-[52px] w-full items-center justify-center gap-2.5 rounded-full text-[16px] font-semibold transition active:scale-[0.98] disabled:opacity-60'

/**
 * Botones nativos del app de iPhone: "Continuar con Apple" (obligatorio para la App Store cuando hay Google)
 * y "Continuar con Google". onApple recibe { identityToken, authorizationCode, fullName }; onGoogle, el token.
 */
export default function NativeSignIn({ onApple, onGoogle, onError }) {
  const [busy, setBusy] = useState(null)
  if (!nativeAppleAvailable && !nativeGoogleAvailable) return null

  const run = (name, open, done) => async () => {
    if (busy) return
    setBusy(name)
    try {
      await done(await open())
    } catch (err) {
      if (!isCancel(err)) onError(err.status ? err : { message: `No pudimos abrir el acceso con ${name}. Inténtalo de nuevo` })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mt-6">
      <div className="mb-5 flex items-center gap-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-3" aria-hidden="true">
        <span className="h-px flex-1 bg-line" />o<span className="h-px flex-1 bg-line" />
      </div>
      <div className="space-y-3">
        {nativeAppleAvailable && (
          <button type="button" className={`${base} bg-black text-white`} disabled={Boolean(busy)} onClick={run('Apple', appleSignIn, onApple)}>
            <AppleLogo className="-mt-0.5 h-[19px] w-[17px]" />
            Continuar con Apple
          </button>
        )}
        {nativeGoogleAvailable && (
          <button type="button" className={`${base} border border-line bg-white text-ink`} disabled={Boolean(busy)} onClick={run('Google', googleSignIn, onGoogle)}>
            <GoogleLogo className="h-[18px] w-[18px]" />
            Continuar con Google
          </button>
        )}
      </div>
    </div>
  )
}
