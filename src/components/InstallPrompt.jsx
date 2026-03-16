import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FiDownload, FiX, FiSmartphone } from 'react-icons/fi'

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [showPrompt, setShowPrompt] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [showIOSHelp, setShowIOSHelp] = useState(false)

  useEffect(() => {
    // Check if iOS
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
    const standalone = window.matchMedia('(display-mode: standalone)').matches
    setIsIOS(ios)

    if (ios && !standalone) {
      // Show iOS install help after 30s
      const timer = setTimeout(() => setShowIOSHelp(true), 30000)
      return () => clearTimeout(timer)
    }

    // Android / Desktop PWA
    const handler = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setTimeout(() => setShowPrompt(true), 15000) // Show after 15s
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const result = await deferredPrompt.userChoice
    if (result.outcome === 'accepted') {
      setShowPrompt(false)
    }
    setDeferredPrompt(null)
  }

  return (
    <AnimatePresence>
      {/* Android / Desktop prompt */}
      {showPrompt && deferredPrompt && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          className="fixed bottom-6 left-6 right-6 md:left-auto md:right-6 md:w-96 z-50 glass rounded-2xl p-5"
        >
          <button
            onClick={() => setShowPrompt(false)}
            className="absolute top-3 right-3 p-1 rounded-full hover:bg-charcoal/10 transition"
          >
            <FiX size={16} />
          </button>
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blush to-rose flex items-center justify-center flex-shrink-0">
              <FiSmartphone className="text-white" size={20} />
            </div>
            <div>
              <h4 className="font-semibold text-sm mb-1">Instalar Pilates by Riven</h4>
              <p className="text-xs text-charcoal/60 mb-3">
                Añádelo a tu pantalla de inicio para acceso rápido — ¡funciona como una app!
              </p>
              <button onClick={handleInstall} className="btn-primary text-xs !py-2 !px-5 gap-1.5">
                <FiDownload size={14} /> Instalar App
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* iOS help prompt */}
      {showIOSHelp && isIOS && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          className="fixed bottom-6 left-6 right-6 z-50 glass rounded-2xl p-5"
        >
          <button
            onClick={() => setShowIOSHelp(false)}
            className="absolute top-3 right-3 p-1 rounded-full hover:bg-charcoal/10 transition"
          >
            <FiX size={16} />
          </button>
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blush to-rose flex items-center justify-center flex-shrink-0">
              <FiSmartphone className="text-white" size={20} />
            </div>
            <div>
              <h4 className="font-semibold text-sm mb-1">Añadir a Pantalla de Inicio</h4>
              <p className="text-xs text-charcoal/60 leading-relaxed">
                Toca el botón <strong>Compartir</strong> (ícono ↑) en la barra de Safari,
                luego toca <strong>"Añadir a pantalla de inicio"</strong> para instalar la app.
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
