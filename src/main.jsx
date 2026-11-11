import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { LanguageProvider } from './i18n/LanguageContext'
import './index.css'

// Força reload automático e verifica atualizações enquanto o app estiver aberto.
if ('serviceWorker' in navigator) {
  let hasReloadedForUpdate = false

  const requestServiceWorkerUpdate = async () => {
    try {
      const registration = await navigator.serviceWorker.getRegistration()
      if (registration) {
        await registration.update()
      }
    } catch {}
  }

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hasReloadedForUpdate) return
    hasReloadedForUpdate = true
    window.location.reload()
  })

  window.addEventListener('load', requestServiceWorkerUpdate)
  window.addEventListener('focus', requestServiceWorkerUpdate)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      requestServiceWorkerUpdate()
    }
  })

  window.setInterval(requestServiceWorkerUpdate, 60000)
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </React.StrictMode>
)
