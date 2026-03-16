import React, { useState, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { auth } from './utils/data'
import SplashScreen from './components/SplashScreen'
import WelcomeScreen from './screens/WelcomeScreen'
import TabBar from './components/TabBar'
import InstallPrompt from './components/InstallPrompt'
import AuthScreen from './screens/AuthScreen'
import HomeScreen from './screens/HomeScreen'
import BookScreen from './screens/BookScreen'
import ProfileScreen from './screens/ProfileScreen'
import AdminScreen from './screens/AdminScreen'

const screenVariants = {
  enter: (direction) => ({
    x: direction > 0 ? '30%' : '-30%',
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction) => ({
    x: direction > 0 ? '-15%' : '15%',
    opacity: 0,
  }),
}

const tabOrder = ['home', 'book', 'profile', 'admin']

export default function App() {
  const [ready, setReady] = useState(false)
  const [welcomed, setWelcomed] = useState(() => {
    try { return localStorage.getItem('pbr_welcomed') === '1' } catch { return false }
  })
  const [user, setUser] = useState(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [activeTab, setActiveTab] = useState('home')
  const [direction, setDirection] = useState(0)

  const isAdmin = user?.role === 'admin' || user?.email === 'admin@pilatesbyriven.com'
  const isReturning = auth.hasSession()

  // Validate JWT token on mount
  useEffect(() => {
    if (!auth.hasSession()) {
      setAuthChecked(true)
      return
    }
    auth.getUser().then(u => {
      setUser(u)
      setAuthChecked(true)
    })
  }, [])

  const handleWelcome = useCallback(() => {
    setWelcomed(true)
    try { localStorage.setItem('pbr_welcomed', '1') } catch {}
  }, [])

  const handleNavigate = useCallback((tab) => {
    const from = tabOrder.indexOf(activeTab)
    const to = tabOrder.indexOf(tab)
    setDirection(to > from ? 1 : -1)
    setActiveTab(tab)
  }, [activeTab])

  const handleLogout = useCallback(() => {
    auth.logout()
    setUser(null)
    setActiveTab('home')
  }, [])

  const handleUserUpdate = useCallback((updatedUser) => {
    setUser(updatedUser)
  }, [])

  const renderScreen = () => {
    switch (activeTab) {
      case 'home':    return <HomeScreen user={user} onNavigate={handleNavigate} />
      case 'book':    return <BookScreen user={user} />
      case 'profile': return <ProfileScreen user={user} onLogout={handleLogout} onNavigate={handleNavigate} onUserUpdate={handleUserUpdate} />
      case 'admin':   return isAdmin ? <AdminScreen /> : <HomeScreen user={user} onNavigate={handleNavigate} />
      default:        return <HomeScreen user={user} onNavigate={handleNavigate} />
    }
  }

  return (
    <>
      {/* Splash screen */}
      <AnimatePresence>
        {!ready && (
          <SplashScreen onFinish={() => setReady(true)} isReturning={isReturning} />
        )}
      </AnimatePresence>

      {/* Welcome screen */}
      <AnimatePresence>
        {ready && authChecked && !welcomed && !user && (
          <motion.div
            key="welcome"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.5 }}
          >
            <WelcomeScreen onStart={handleWelcome} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Auth screen */}
      <AnimatePresence>
        {ready && authChecked && welcomed && !user && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.4 }}
            className="fixed inset-0 z-50"
          >
            <AuthScreen onAuth={(u) => setUser(u)} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main app */}
      {ready && authChecked && user && (
        <div className="app-container safe-top">
          {/* Screen content */}
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={activeTab}
              custom={direction}
              variants={screenVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
              className="screen flex flex-col"
            >
              {renderScreen()}
            </motion.div>
          </AnimatePresence>

          {/* Tab bar */}
          <TabBar active={activeTab} onChange={handleNavigate} isAdmin={isAdmin} />

          {/* PWA install prompt */}
          <InstallPrompt />
        </div>
      )}
    </>
  )
}
