import React, { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { IconButton, cx } from './index'

/**
 * Panel modal: hoja inferior en celular, diálogo centrado en pantallas grandes.
 * Cierra con Esc o tocando fuera, bloquea el scroll de fondo y devuelve el foco al cerrar.
 */
export default function Sheet({ open, onClose, title, subtitle, children, footer, size = 'md' }) {
  const panelRef = useRef(null)
  const titleId = React.useId()

  useEffect(() => {
    if (!open) return undefined
    const previous = document.activeElement
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose() }
      if (e.key !== 'Tab' || !panelRef.current) return
      const items = panelRef.current.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusTimer = setTimeout(() => {
      if (panelRef.current && !panelRef.current.contains(document.activeElement)) panelRef.current.focus()
    }, 50)
    return () => {
      clearTimeout(focusTimer)
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      if (previous instanceof HTMLElement) previous.focus()
    }
  }, [open, onClose])

  const widths = { sm: 'sm:max-w-md', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl' }

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
          <motion.div
            className="absolute inset-0 bg-espresso/45 backdrop-blur-[2px]"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className={cx(
              'relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[28px] bg-canvas shadow-sheet outline-none',
              'sm:max-h-[86dvh] sm:rounded-[28px]', widths[size],
            )}
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 38 }}
          >
            <div className="flex items-start justify-between gap-4 px-5 pb-3 pt-5 sm:px-7 sm:pt-6">
              <div className="min-w-0">
                <h2 id={titleId} className="display text-[28px] text-ink">{title}</h2>
                {subtitle && <p className="mt-1 text-sm text-ink-2">{subtitle}</p>}
              </div>
              <IconButton icon={X} label="Cerrar" onClick={onClose} className="-mr-2 -mt-1" />
            </div>
            <div className="scroll-area flex-1 px-5 pb-5 sm:px-7">{children}</div>
            {footer && (
              <div className="pb-safe border-t border-line bg-surface/80 backdrop-blur">
                <div className="flex flex-wrap items-center justify-end gap-2 px-5 py-4 sm:px-7">{footer}</div>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
