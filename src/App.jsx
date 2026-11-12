import React from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { WifiOff } from 'lucide-react'
import { useAuth } from './lib/auth'
import { Button, EmptyState, Logo } from './ui'
import Shell from './app/Shell'
import AuthScreen from './screens/AuthScreen'
import VerifyEmail from './screens/VerifyEmail'
import AdminHome from './screens/admin/Home'
import Agenda from './screens/admin/Agenda'
import Bookings from './screens/admin/Bookings'
import Clients from './screens/admin/Clients'
import ClientDetail from './screens/admin/ClientDetail'
import Settings from './screens/admin/Settings'
import Packages from './screens/admin/Packages'
import Caja from './screens/admin/Caja'
import ClientHome from './screens/client/Home'
import Book from './screens/client/Book'
import MyClasses from './screens/client/MyClasses'
import Profile from './screens/client/Profile'
import Intake from './screens/client/Intake'
import MyPackages from './screens/client/Packages'

function Splash() {
  return (
    <div className="flex h-full items-center justify-center bg-canvas">
      <Logo size="lg" className="animate-pulse" />
    </div>
  )
}

export default function App() {
  const { status, user } = useAuth()

  if (status === 'loading') return <Splash />
  if (status === 'offline') {
    return (
      <div className="flex h-full items-center justify-center bg-canvas p-6">
        <EmptyState
          icon={WifiOff}
          title="Sin conexión"
          text="No pudimos conectar con el estudio. Revisa tu internet."
          action={<Button onClick={() => window.location.reload()}>Reintentar</Button>}
        />
      </div>
    )
  }
  if (status === 'guest') return <AuthScreen />

  // Cuenta recién creada: primero confirma su correo.
  if (user.role === 'client' && user.emailVerified === false) return <VerifyEmail />

  if (user.role === 'client') {
    return (
      <Shell>
        <Routes>
          <Route path="/" element={<ClientHome />} />
          <Route path="/reservar" element={<Book />} />
          <Route path="/clases" element={<MyClasses />} />
          <Route path="/perfil" element={<Profile />} />
          <Route path="/admision" element={<Intake />} />
          <Route path="/paquetes" element={<MyPackages />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Shell>
    )
  }

  const isAdmin = user.role === 'admin'
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<AdminHome />} />
        <Route path="/agenda" element={<Agenda />} />
        {isAdmin && (
          <>
            <Route path="/reservas" element={<Bookings />} />
            <Route path="/clientas" element={<Clients />} />
            <Route path="/clientas/:id" element={<ClientDetail />} />
            <Route path="/paquetes" element={<Packages />} />
            <Route path="/caja" element={<Caja />} />
          </>
        )}
        <Route path="/ajustes" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  )
}
