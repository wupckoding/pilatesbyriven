import React, { useEffect, useRef } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { LETTERS, VIEWBOX } from './rivenLetters'

const EASE = [0.22, 1, 0.36, 1]
const SEEN_KEY = 'pbr_intro_seen'   // ya la vio alguna vez en este dispositivo → versión corta
const SESSION_KEY = 'pbr_intro'     // ya se mostró en esta apertura de la app

const read = (store, key) => { try { return store.getItem(key) } catch { return null } }
const write = (store, key) => { try { store.setItem(key, '1') } catch { /* modo privado */ } }

/** La apertura se muestra una vez cada vez que se abre la app (no en cada recarga interna). */
export const shouldShowIntro = () => read(window.sessionStorage, SESSION_KEY) !== '1'

/**
 * Apertura de marca: "PILATES BY" se asienta, las letras de RIVEN suben una a una,
 * se traza una línea y aparece el lema; después todo el telón sube y deja ver la app.
 */
export default function Intro({ onDone }) {
  const reduced = useReducedMotion()
  const returning = useRef(read(window.localStorage, SEEN_KEY) === '1').current
  const done = useRef(false)
  // Primera vez: se deja ver completa. Las siguientes: una versión breve.
  const hold = reduced ? 700 : returning ? 1900 : 3200
  const pace = returning ? 0.7 : 1

  const finish = () => {
    if (done.current) return
    done.current = true
    write(window.sessionStorage, SESSION_KEY)
    write(window.localStorage, SEEN_KEY)
    onDone()
  }

  useEffect(() => {
    const id = setTimeout(finish, hold)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const t = (seconds) => seconds * pace

  return (
    <motion.div
      className="fixed inset-0 z-[200] flex cursor-pointer items-center justify-center overflow-hidden bg-canvas"
      role="img"
      aria-label="Pilates by Riven"
      onClick={finish}
      initial={false}
      exit={reduced ? { opacity: 0, transition: { duration: 0.25 } } : { y: '-100%', transition: { duration: 0.85, ease: [0.76, 0, 0.24, 1] } }}
    >
      {/* Resplandor cálido que respira detrás del logotipo */}
      {!reduced && (
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 h-[130vmin] w-[130vmin] rounded-full"
          style={{ x: '-50%', y: '-50%', background: 'radial-gradient(circle, rgba(193,156,128,0.30) 0%, rgba(193,156,128,0.10) 34%, rgba(193,156,128,0) 62%)' }}
          initial={{ scale: 0.35, opacity: 0 }}
          animate={{ scale: [0.35, 1, 1.06], opacity: [0, 1, 0.85] }}
          transition={{ duration: t(2.8), ease: 'easeOut', times: [0, 0.6, 1] }}
        />
      )}

      <motion.div
        className="relative flex flex-col items-center px-8"
        exit={reduced ? undefined : { opacity: 0, scale: 1.04, transition: { duration: 0.4, ease: 'easeIn' } }}
      >
        <motion.p
          aria-hidden="true"
          className="whitespace-nowrap text-[12px] font-semibold uppercase text-clay-deep sm:text-[13px]"
          initial={reduced ? false : { opacity: 0, letterSpacing: '1.1em', paddingLeft: '1.1em' }}
          animate={{ opacity: 1, letterSpacing: '0.42em', paddingLeft: '0.42em' }}
          transition={{ duration: t(1.1), ease: EASE }}
        >
          Pilates by
        </motion.p>

        {/* RIVEN: cada letra sube desde detrás de la línea de base */}
        <svg viewBox={VIEWBOX} aria-hidden="true" className="mt-4 h-auto w-[min(62vw,300px)] overflow-hidden">
          {LETTERS.map((d, i) => (
            <motion.path
              key={i}
              d={d}
              fill="#C19C80"
              initial={reduced ? false : { y: 32, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: t(0.9), delay: t(0.35 + i * 0.09), ease: EASE }}
            />
          ))}
        </svg>

        <motion.span
          aria-hidden="true"
          className="mt-7 block h-px w-16 origin-center bg-clay/70"
          initial={reduced ? false : { scaleX: 0, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 1 }}
          transition={{ duration: t(0.8), delay: t(1.0), ease: EASE }}
        />

        <p aria-hidden="true" className="mt-6 flex gap-[0.9em] whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.3em] text-ink-3">
          {['Strength', '·', 'Control', '·', 'Elegance'].map((word, i) => (
            <motion.span
              key={i}
              initial={reduced ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: t(0.6), delay: returning ? 0.75 : 1.2 + i * 0.08, ease: EASE }}
            >
              {word}
            </motion.span>
          ))}
        </p>
      </motion.div>
    </motion.div>
  )
}
