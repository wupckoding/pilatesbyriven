import React, { useEffect } from 'react'
import { motion } from 'framer-motion'

export default function SplashScreen({ onFinish, isReturning }) {
  useEffect(() => {
    // Returning users get a shorter splash (1.5s vs 3.5s)
    const timer = setTimeout(() => onFinish(), isReturning ? 1500 : 3500)
    return () => clearTimeout(timer)
  }, [onFinish, isReturning])

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      style={{ background: '#FFFFFF' }}
    >
      {/* Soft warm glow behind logo */}
      <motion.div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(193,156,128,0.05) 0%, transparent 60%)' }}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 2.5, ease: 'easeOut' }}
      />

      {/* Main content — centered logo */}
      <div className="relative z-10 flex flex-col items-center px-8">

        {/* PILATES — big, bold, serif */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
        >
          <h1
            className="font-display text-center font-medium tracking-[0.22em] uppercase leading-none"
            style={{ color: '#C19C80', fontSize: 'clamp(48px, 14vw, 72px)' }}
          >
            PILATES
          </h1>
        </motion.div>

        {/* by RIVEN — elegant, proportional */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.7, ease: [0.25, 0.1, 0.25, 1] }}
          className="mt-2"
        >
          <p
            className="font-display text-center font-normal tracking-[0.1em] leading-none"
            style={{ color: '#C19C80', fontSize: 'clamp(20px, 5.5vw, 30px)' }}
          >
            <span className="text-[0.7em] tracking-[0.2em] mr-1">by</span> RIVEN
          </p>
        </motion.div>
      </div>

      {/* Loading dots — centered below logo */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.8 }}
        className="absolute bottom-[28%] left-0 right-0 flex justify-center gap-1.5"
      >
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="w-[5px] h-[5px] rounded-full"
            style={{ background: '#C19C80' }}
            initial={{ opacity: 0.15 }}
            animate={{ opacity: [0.15, 0.6, 0.15] }}
            transition={{
              duration: 1.2,
              repeat: Infinity,
              delay: i * 0.2,
              ease: 'easeInOut',
            }}
          />
        ))}
      </motion.div>

      {/* made by jbnexo */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2, duration: 1 }}
        className="absolute bottom-5 left-0 right-0 text-center text-[8px] tracking-[0.15em]"
        style={{ color: 'rgba(193,156,128,0.25)' }}
      >
        made by jbnexo
      </motion.p>
    </motion.div>
  )
}
