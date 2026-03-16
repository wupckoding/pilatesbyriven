import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FiUser, FiPhone, FiLock, FiMail, FiArrowRight, FiEye, FiEyeOff, FiGlobe, FiLoader } from 'react-icons/fi'
import { auth } from '../utils/data'
import { config } from '../config'
import Logo from '../components/Logo'

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: (i) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.05, duration: 0.5, ease: [0.25, 0.1, 0.25, 1] },
  }),
}

const countries = [
  { code: 'CR', name: 'Costa Rica', dial: '+506', flag: '\u{1F1E8}\u{1F1F7}' },
  { code: 'MX', name: 'México', dial: '+52', flag: '\u{1F1F2}\u{1F1FD}' },
  { code: 'CO', name: 'Colombia', dial: '+57', flag: '\u{1F1E8}\u{1F1F4}' },
  { code: 'US', name: 'Estados Unidos', dial: '+1', flag: '\u{1F1FA}\u{1F1F8}' },
  { code: 'PA', name: 'Panamá', dial: '+507', flag: '\u{1F1F5}\u{1F1E6}' },
  { code: 'BR', name: 'Brasil', dial: '+55', flag: '\u{1F1E7}\u{1F1F7}' },
  { code: 'AR', name: 'Argentina', dial: '+54', flag: '\u{1F1E6}\u{1F1F7}' },
  { code: 'ES', name: 'España', dial: '+34', flag: '\u{1F1EA}\u{1F1F8}' },
]

const InputField = ({ icon: Icon, ...props }) => (
  <div className="relative">
    <Icon className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: '#C4AFA2' }} size={16} />
    <input
      {...props}
      className="w-full py-[14px] pl-12 pr-4 rounded-2xl text-[14px] outline-none transition-all focus:ring-2 focus:ring-gold/20"
      style={{ background: 'rgba(193,156,128,0.06)', border: '1px solid rgba(193,156,128,0.1)', color: '#333' }}
    />
  </div>
)

export default function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState('login')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    name: '', surname: '', email: '', phone: '', password: '', country: 'CR',
  })
  const [error, setError] = useState('')
  const [showOAuthPopup, setShowOAuthPopup] = useState(false)

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value })
  const selectedCountry = countries.find(c => c.code === form.country)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (mode === 'register') {
        if (!form.name.trim()) { setLoading(false); return setError('Ingresa tu nombre') }
        if (!form.surname.trim()) { setLoading(false); return setError('Ingresa tu apellido') }
        if (!form.email.trim()) { setLoading(false); return setError('Ingresa tu email') }
        if (!form.email.includes('@')) { setLoading(false); return setError('Email no válido') }
        if (!form.phone.trim()) { setLoading(false); return setError('Ingresa tu WhatsApp') }
        if (form.password.length < 4) { setLoading(false); return setError('Mínimo 4 caracteres') }

        const result = await auth.register({
          name: form.name.trim(),
          surname: form.surname.trim(),
          email: form.email.trim(),
          phone: `${selectedCountry.dial} ${form.phone.trim()}`,
          password: form.password,
        })
        if (result.error) { setLoading(false); return setError(result.error) }
        onAuth(result.user)
      } else {
        if (!form.email.trim()) { setLoading(false); return setError('Ingresa tu email') }
        if (!form.password) { setLoading(false); return setError('Ingresa tu contraseña') }

        const result = await auth.login(form.email.trim(), form.password)
        if (result.error) { setLoading(false); return setError(result.error) }
        onAuth(result.user)
      }
    } catch {
      setError('Error de conexión. Intenta de nuevo.')
      setLoading(false)
    }
  }

  return (
    <div className="app-container safe-top" style={{ background: '#FFFFFF' }}>

      {/* OAuth Coming Soon Popup */}
      <AnimatePresence>
        {showOAuthPopup && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-8"
            onClick={() => setShowOAuthPopup(false)}
            style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)' }}>
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-3xl p-6 text-center"
              style={{ background: '#FFFFFF', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
                style={{ background: 'rgba(143,166,133,0.1)' }}>
                <span className="text-[28px]">{'\u{1F6A7}'}</span>
              </div>
              <h3 className="font-display text-[18px] font-bold text-charcoal mb-2">Pr{'ó'}ximamente</h3>
              <p className="text-[13px] leading-relaxed mb-5" style={{ color: '#888' }}>
                Estamos desarrollando la plataforma. Pronto podr{'á'}s registrarte con <strong style={{ color: '#333' }}>Google</strong> y <strong style={{ color: '#333' }}>Apple</strong>.
              </p>
              <p className="text-[12px] mb-5" style={{ color: '#C4AFA2' }}>
                Por ahora, usa tu <strong style={{ color: '#C19C80' }}>email</strong> para {mode === 'login' ? 'iniciar sesi\u00f3n' : 'crear tu cuenta'}.
              </p>
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => setShowOAuthPopup(false)}
                className="w-full py-3.5 rounded-2xl text-[14px] font-semibold"
                style={{ background: 'linear-gradient(135deg, #C19C80 0%, #A67D64 100%)', color: '#fff', boxShadow: '0 4px 16px rgba(193,156,128,0.3)' }}>
                Entendido
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'linear-gradient(180deg, #FFFFFF 0%, #FFFFFF 40%, #FBF6F3 70%, #F5EDE8 100%)' }}
      />

      <div className="screen-scroll flex flex-col relative z-10">
        <div className="flex-1 flex flex-col justify-center px-7 py-10">

          {/* Logo */}
          <motion.div custom={0} variants={fadeUp} initial="hidden" animate="show" className="text-center mb-4">
            <div className="flex justify-center mb-5">
              <Logo size="md" />
            </div>
            <div className="w-8 h-[1px] mx-auto mb-3" style={{ background: 'rgba(193,156,128,0.25)' }} />
            <p className="text-[14px] font-normal" style={{ color: '#C4AFA2' }}>
              {mode === 'login' ? '¡Bienvenida de vuelta!' : 'Crea tu cuenta'}
            </p>
          </motion.div>

          {/* Tab toggle */}
          <motion.div custom={1} variants={fadeUp} initial="hidden" animate="show" className="mb-6 mt-4">
            <div className="rounded-full p-1 flex" style={{ background: 'rgba(193,156,128,0.08)' }}>
              {[
                { id: 'login', label: 'Iniciar Sesión' },
                { id: 'register', label: 'Registrarse' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => { setMode(tab.id); setError('') }}
                  className={`flex-1 py-3 rounded-full text-[13px] font-medium transition-all duration-300 ${
                    mode === tab.id ? 'bg-white shadow-sm' : ''
                  }`}
                  style={{
                    color: mode === tab.id ? '#C19C80' : 'rgba(193,156,128,0.4)',
                    boxShadow: mode === tab.id ? '0 2px 10px rgba(0,0,0,0.06)' : 'none',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </motion.div>

          {/* OAuth buttons */}
          <motion.div custom={2} variants={fadeUp} initial="hidden" animate="show" className="mb-4">
            <div className="flex gap-3">
              <motion.button type="button" whileTap={{ scale: 0.95 }}
                onClick={() => setShowOAuthPopup(true)}
                className="flex-1 flex items-center justify-center gap-2.5 py-[13px] rounded-2xl text-[13px] font-medium transition-all"
                style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.08)', color: '#333', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                <svg width="16" height="16" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                Google
              </motion.button>
              <motion.button type="button" whileTap={{ scale: 0.95 }}
                onClick={() => setShowOAuthPopup(true)}
                className="flex-1 flex items-center justify-center gap-2.5 py-[13px] rounded-2xl text-[13px] font-medium transition-all"
                style={{ background: '#000', color: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }}>
                <svg width="14" height="17" viewBox="0 0 14 17" fill="white"><path d="M13.21 5.77a3.76 3.76 0 0 0-1.79 3.16 3.64 3.64 0 0 0 2.21 3.35 8.33 8.33 0 0 1-1.15 2.36c-.72 1.04-1.46 2.07-2.63 2.09-1.15.02-1.52-.68-2.84-.68-1.32 0-1.73.66-2.82.7-1.13.04-1.99-1.12-2.72-2.15C.17 12.61-.77 8.99.77 6.5A4.07 4.07 0 0 1 4.2 4.35c1.11-.02 2.16.75 2.84.75.68 0 1.95-.93 3.29-.79.56.02 2.13.23 3.14 1.7l-.26.16zM9.58.37A3.7 3.7 0 0 1 8.72 3a3.17 3.17 0 0 1-2.1 1.03 3.44 3.44 0 0 1 .87-2.58A3.78 3.78 0 0 1 9.58.37z"/></svg>
                Apple
              </motion.button>
            </div>

            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-[1px]" style={{ background: 'rgba(193,156,128,0.12)' }} />
              <span className="text-[11px] font-medium" style={{ color: 'rgba(193,156,128,0.4)' }}>o con email</span>
              <div className="flex-1 h-[1px]" style={{ background: 'rgba(193,156,128,0.12)' }} />
            </div>
          </motion.div>

          {/* Email form */}
          <motion.div custom={3} variants={fadeUp} initial="hidden" animate="show">
            <form onSubmit={handleSubmit}>
              <AnimatePresence mode="wait">
                <motion.div
                  key={mode}
                  initial={{ opacity: 0, x: mode === 'register' ? 20 : -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: mode === 'register' ? -20 : 20 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-3"
                >
                  {mode === 'register' && (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <InputField icon={FiUser} type="text" value={form.name} onChange={set('name')} placeholder="Nombre" />
                        <InputField icon={FiUser} type="text" value={form.surname} onChange={set('surname')} placeholder="Apellido" />
                      </div>

                      <div className="relative">
                        <FiGlobe className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: '#C4AFA2' }} size={16} />
                        <select
                          value={form.country}
                          onChange={set('country')}
                          className="w-full py-[14px] pl-12 pr-4 rounded-2xl text-[14px] outline-none appearance-none transition-all focus:ring-2 focus:ring-gold/20"
                          style={{ background: 'rgba(193,156,128,0.06)', border: '1px solid rgba(193,156,128,0.1)', color: '#333' }}
                        >
                          {countries.map(c => (
                            <option key={c.code} value={c.code}>{c.flag} {c.name} ({c.dial})</option>
                          ))}
                        </select>
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-[12px]" style={{ color: '#C4AFA2' }}>{'▾'}</div>
                      </div>

                      <div className="relative">
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none">
                          <span className="text-[14px]">{selectedCountry?.flag}</span>
                          <span className="text-[12px] font-medium" style={{ color: '#999' }}>{selectedCountry?.dial}</span>
                        </div>
                        <input type="tel" value={form.phone} onChange={set('phone')}
                          placeholder="0000-0000"
                          className="w-full py-[14px] pl-[85px] pr-4 rounded-2xl text-[14px] outline-none transition-all focus:ring-2 focus:ring-gold/20"
                          style={{ background: 'rgba(193,156,128,0.06)', border: '1px solid rgba(193,156,128,0.1)', color: '#333' }}
                        />
                      </div>
                    </>
                  )}

                  <InputField icon={FiMail} type="email" value={form.email} onChange={set('email')} placeholder="Email" autoComplete="email" />

                  <div className="relative">
                    <FiLock className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: '#C4AFA2' }} size={16} />
                    <input
                      type={showPass ? 'text' : 'password'}
                      value={form.password} onChange={set('password')}
                      placeholder={mode === 'register' ? 'Crea una contraseña' : 'Tu contraseña'}
                      className="w-full py-[14px] pl-12 pr-12 rounded-2xl text-[14px] outline-none transition-all focus:ring-2 focus:ring-gold/20"
                      style={{ background: 'rgba(193,156,128,0.06)', border: '1px solid rgba(193,156,128,0.1)', color: '#333' }}
                    />
                    <button type="button" onClick={() => setShowPass(!showPass)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 tap" style={{ color: '#C4AFA2' }}>
                      {showPass ? <FiEyeOff size={16} /> : <FiEye size={16} />}
                    </button>
                  </div>
                </motion.div>
              </AnimatePresence>

              <AnimatePresence>
                {error && (
                  <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="text-xs font-medium mt-3 text-center" style={{ color: '#C4838E' }}>
                    {error}
                  </motion.p>
                )}
              </AnimatePresence>

              <button type="submit" disabled={loading}
                className="w-full mt-5 py-[15px] rounded-2xl text-[14px] font-medium tracking-wide flex items-center justify-center gap-2 transition-all duration-200 active:scale-[0.97] disabled:opacity-60"
                style={{ background: '#C19C80', color: '#FFFFFF', boxShadow: '0 4px 16px rgba(193,156,128,0.3)' }}
              >
                {loading ? (
                  <FiLoader size={16} className="animate-spin" />
                ) : (
                  <>
                    {mode === 'login' ? 'Iniciar Sesión' : 'Crear Cuenta'}
                    <FiArrowRight size={15} />
                  </>
                )}
              </button>
            </form>

            {mode === 'login' && (
              <p className="text-center mt-5 text-[12px]" style={{ color: '#C4AFA2' }}>
                {'¿'}Olvidaste tu contrase{'ñ'}a?{' '}
                <button type="button"
                  onClick={() => window.open(`https://wa.me/${config.WHATSAPP_NUMBER}?text=¡Hola! Olvidé mi contraseña de la app.`, '_blank')}
                  className="font-semibold" style={{ color: '#C19C80' }}>
                  Contáctanos
                </button>
              </p>
            )}
            {mode === 'register' && (
              <p className="text-center mt-5 text-[11px] leading-relaxed" style={{ color: 'rgba(193,156,128,0.4)' }}>
                Al crear tu cuenta, aceptas nuestros términos y condiciones.
              </p>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  )
}
