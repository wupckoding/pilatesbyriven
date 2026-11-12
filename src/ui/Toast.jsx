import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CircleAlert, CircleCheck } from 'lucide-react'

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [items, setItems] = useState([])
  const nextId = useRef(1)

  const push = useCallback((type, message) => {
    const id = nextId.current++
    setItems([{ id, type, message }])
    setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), type === 'error' ? 5000 : 2600)
  }, [])

  const toast = useMemo(() => ({
    success: (message) => push('success', message),
    error: (errOrMessage) => push('error', typeof errOrMessage === 'string' ? errOrMessage : errOrMessage?.message || 'Ocurrió un error'),
  }), [push])

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+88px)] lg:pb-8" aria-live="polite">
        <AnimatePresence>
          {items.map((t) => (
            <motion.div
              key={t.id}
              role={t.type === 'error' ? 'alert' : 'status'}
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.97 }}
              transition={{ duration: 0.18 }}
              className="pointer-events-auto flex max-w-md items-center gap-2.5 rounded-2xl bg-espresso px-4 py-3 text-sm font-medium text-white shadow-lift"
            >
              {t.type === 'error'
                ? <CircleAlert className="h-4 w-4 shrink-0 text-[#F0A894]" aria-hidden="true" />
                : <CircleCheck className="h-4 w-4 shrink-0 text-clay" aria-hidden="true" />}
              <span>{t.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
