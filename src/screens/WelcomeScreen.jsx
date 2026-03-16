import React from 'react'
import { motion } from 'framer-motion'
import Logo from '../components/Logo'

export default function WelcomeScreen({ onStart }) {
  return (
    <div className="fixed inset-0 z-[90] flex flex-col overflow-hidden"
      style={{ background: '#FFFFFF' }}>

      {/* Subtle warm gradient overlay at bottom */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'linear-gradient(180deg, #FFFFFF 0%, #FFFFFF 50%, #FBF6F3 75%, #F5EDE8 100%)' }}
      />

      {/* Very subtle decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute -top-[30%] -right-[30%] w-[500px] h-[500px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(193,156,128,0.06) 0%, transparent 70%)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 2 }}
        />
        <motion.div
          className="absolute -bottom-[20%] -left-[20%] w-[400px] h-[400px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(232,180,184,0.05) 0%, transparent 70%)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 2, delay: 0.5 }}
        />
      </div>

      {/* Content */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-between safe-top safe-bottom px-8 py-12">

        {/* Spacer top */}
        <div className="flex-1" />

        {/* Center: Logo + Text */}
        <div className="flex flex-col items-center">
          {/* Logo PILATES by RIVEN */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 1, ease: 'easeOut' }}
          >
            <Logo size="lg" />
          </motion.div>

          {/* Thin line separator */}
          <motion.div
            initial={{ opacity: 0, scaleX: 0 }}
            animate={{ opacity: 1, scaleX: 1 }}
            transition={{ delay: 0.9, duration: 0.8 }}
            className="w-12 h-[1px] mt-10 mb-8"
            style={{ background: 'rgba(193,156,128,0.3)' }}
          />

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.1, duration: 0.7 }}
            className="text-center font-display text-[18px] font-normal leading-relaxed"
            style={{ color: '#A08878' }}
          >
            Tu estudio privado
          </motion.p>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.25, duration: 0.7 }}
            className="text-center text-[14px] leading-relaxed mt-2"
            style={{ color: '#C4AFA2' }}
          >
            Reformer · Cadillac · Personalizado
          </motion.p>
        </div>

        {/* Spacer */}
        <div className="flex-[1.5]" />

        {/* Bottom: CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.5, duration: 0.7, ease: 'easeOut' }}
          className="w-full"
        >
          <button
            onClick={onStart}
            className="w-full rounded-full text-[14px] font-medium tracking-[0.1em] uppercase active:scale-[0.97] transition-all duration-200"
            style={{
              background: '#C19C80',
              color: '#FFFFFF',
              boxShadow: '0 4px 20px rgba(193,156,128,0.3)',
              paddingTop: '16px',
              paddingBottom: '16px',
              letterSpacing: '0.15em',
            }}
          >
            Empezar
          </button>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 2, duration: 0.8 }}
            className="text-center mt-5 text-[10px] font-normal tracking-[0.2em] uppercase"
            style={{ color: '#D4C4B8' }}
          >
            Costa Rica
          </motion.p>
        </motion.div>
      </div>
    </div>
  )
}
