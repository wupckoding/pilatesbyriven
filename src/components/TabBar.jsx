import React from 'react'
import { motion } from 'framer-motion'
import { FiHome, FiPlusCircle, FiUser, FiSettings, FiGift } from 'react-icons/fi'
import { useLanguage } from '../i18n/LanguageContext'

const labelsByLanguage = {
  es: { home: 'Inicio', book: 'Reservar', coupons: 'Cupones', profile: 'Perfil', admin: 'Admin' },
  pt: { home: 'Início', book: 'Reservar', coupons: 'Cupons', profile: 'Perfil', admin: 'Admin' },
  en: { home: 'Home', book: 'Book', coupons: 'Coupons', profile: 'Profile', admin: 'Admin' },
}

export default function TabBar({ active, onChange, isAdmin }) {
  const { language } = useLanguage()
  const labels = labelsByLanguage[language] || labelsByLanguage.es
  const baseTabs = [
    { id: 'home', icon: FiHome, label: labels.home },
    { id: 'book', icon: FiPlusCircle, label: labels.book },
    { id: 'profile', icon: FiUser, label: labels.profile },
  ]
  const couponsTab = { id: 'coupons', icon: FiGift, label: labels.coupons }
  const adminTab = { id: 'admin', icon: FiSettings, label: labels.admin }
  const tabs = isAdmin ? [baseTabs[0], baseTabs[1], couponsTab, baseTabs[2], adminTab] : baseTabs
  return (
    <div className="safe-bottom bg-white/90 backdrop-blur-2xl border-t border-charcoal/[0.04]">
      <div className="flex items-center justify-around px-3 pt-2 pb-1 max-w-lg mx-auto">
        {tabs.map(tab => {
          const isActive = active === tab.id
          const Icon = tab.icon

          return (
            <button key={tab.id} onClick={() => onChange(tab.id)}
              className="relative flex flex-col items-center gap-[3px] py-1 px-3 tap">
              <div className="relative">
                {isActive && (
                  <motion.div layoutId="tab-bg"
                    className="absolute -inset-2 bg-charcoal/[0.04] rounded-xl"
                    transition={{ type: 'spring', stiffness: 500, damping: 32 }} />
                )}
                <Icon size={20}
                  className={`relative z-10 transition-colors duration-200 ${
                    isActive ? 'text-charcoal' : 'text-charcoal/20'
                  }`} />
              </div>
              <span className={`text-[10px] font-semibold transition-colors duration-200 ${
                isActive ? 'text-charcoal' : 'text-charcoal/20'
              }`}>
                {tab.label}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
