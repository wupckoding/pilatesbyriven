import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'

const STORAGE_KEY = 'pbr_language'

const dateLocaleByLanguage = {
  es: 'es-CR',
  pt: 'pt-BR',
  en: 'en-US',
}

const languageOptions = [
  { id: 'es', label: 'Español' },
  { id: 'pt', label: 'Português' },
  { id: 'en', label: 'English' },
]

const LanguageContext = createContext(null)

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || 'es'
    } catch {
      return 'es'
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, language)
    } catch {
      // ignore storage failures
    }
    document.documentElement.lang = language
  }, [language])

  const value = useMemo(() => ({
    language,
    setLanguage,
    languageOptions,
    dateLocale: dateLocaleByLanguage[language] || 'es-CR',
  }), [language])

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider')
  }
  return context
}
