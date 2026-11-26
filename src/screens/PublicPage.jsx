import React from 'react'
import { AuthLayout, PrivacyNotice } from './AuthScreen'

const EMAIL = 'contacto@pilatesbyriven.com'

/**
 * Páginas públicas, sin iniciar sesión. La App Store pide una dirección para el aviso de privacidad
 * y otra de soporte: https://app.pilatesbyriven.com/privacidad y /soporte.
 */
export default function PublicPage({ page }) {
  return (
    <AuthLayout>
      {page === 'privacidad' ? (
        <>
          <h1 className="display text-[38px] text-ink">Aviso de privacidad</h1>
          <div className="mt-6"><PrivacyNotice /></div>
        </>
      ) : (
        <>
          <h1 className="display text-[38px] text-ink">Soporte</h1>
          <div className="mt-6 space-y-5 text-[15px] leading-relaxed text-ink-2">
            <p>
              ¿Necesitas ayuda con tu cuenta, tus reservas o tus paquetes? Escríbenos a{' '}
              <a className="font-semibold text-clay-deep underline underline-offset-2" href={`mailto:${EMAIL}`}>{EMAIL}</a>{' '}
              o por WhatsApp al estudio.
            </p>
            <div>
              <h2 className="font-semibold text-ink">Olvidé mi contraseña</h2>
              <p className="mt-1">Escríbenos desde el correo de tu cuenta y te ayudamos a recuperarla.</p>
            </div>
            <div>
              <h2 className="font-semibold text-ink">Eliminar mi cuenta</h2>
              <p className="mt-1">
                En el app, entra a <span className="font-semibold text-ink">Perfil › Eliminar mi cuenta</span>. Tus reservas futuras
                se cancelan y ya no podrás entrar. Si no puedes entrar al app, escríbenos y la eliminamos por ti.
              </p>
            </div>
          </div>
        </>
      )}
      <a href="/" className="mt-10 text-center text-sm font-semibold text-clay-deep">Ir a Pilates by Riven</a>
    </AuthLayout>
  )
}
