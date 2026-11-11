import React, { useEffect, useRef } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { CalendarDays, CalendarHeart, CalendarPlus, Home, Landmark, LogOut, Settings, UserRound, Users, WalletCards } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { Avatar, Logo, cx } from '../ui'

const NAV = {
  admin: [
    { to: '/', label: 'Inicio', icon: Home },
    { to: '/agenda', label: 'Agenda', icon: CalendarDays },
    { to: '/clientas', label: 'Clientas', icon: Users },
    { to: '/paquetes', label: 'Paquetes y pagos', short: 'Pagos', icon: WalletCards },
    { to: '/caja', label: 'Caja', icon: Landmark },
    { to: '/ajustes', label: 'Ajustes', icon: Settings, desktopOnly: true },
  ],
  instructor: [
    { to: '/', label: 'Inicio', icon: Home },
    { to: '/agenda', label: 'Agenda', icon: CalendarDays },
    { to: '/ajustes', label: 'Cuenta', icon: UserRound },
  ],
  client: [
    { to: '/', label: 'Inicio', icon: Home },
    { to: '/reservar', label: 'Reservar', icon: CalendarPlus },
    { to: '/clases', label: 'Mis clases', icon: CalendarHeart },
    { to: '/perfil', label: 'Perfil', icon: UserRound },
  ],
}

const ROLE_LABEL = { admin: 'Administración', instructor: 'Instructora', client: 'Clienta' }

/** Marco de la app: barra lateral en computadora, barra inferior en celular. */
export default function Shell({ children }) {
  const { user, logout } = useAuth()
  const { pathname } = useLocation()
  const mainRef = useRef(null)
  const items = NAV[user.role] || NAV.client
  const accountPath = user.role === 'client' ? '/perfil' : '/ajustes'

  // Cada pantalla empieza arriba.
  useEffect(() => { mainRef.current?.scrollTo({ top: 0 }) }, [pathname])

  return (
    <div className="flex h-full bg-canvas">
      {/* Barra lateral (≥ 1024 px) */}
      <aside className="hidden w-[264px] shrink-0 flex-col border-r border-line bg-surface/60 lg:flex">
        <div className="px-7 pb-8 pt-9">
          <Logo size="md" className="items-start" />
        </div>
        <nav className="flex-1 space-y-1 px-4" aria-label="Principal">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => cx(
                'flex h-11 items-center gap-3 rounded-2xl px-4 text-sm font-semibold transition-colors duration-150',
                isActive ? 'bg-ink text-surface shadow-card' : 'text-ink-2 hover:bg-ink/5 hover:text-ink',
              )}
            >
              <item.icon className="h-[18px] w-[18px]" aria-hidden="true" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="m-4 flex items-center gap-3 rounded-2xl border border-line bg-surface p-3">
          <Avatar name={user.fullName} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-ink">{user.fullName || user.email}</p>
            <p className="text-[11px] text-ink-3">{ROLE_LABEL[user.role]}</p>
          </div>
          <button
            type="button"
            onClick={logout}
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-3 hover:bg-ink/5 hover:text-ink"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Barra superior (celular) */}
        <header className="pt-safe border-b border-line/70 bg-canvas/90 backdrop-blur lg:hidden">
          <div className="flex h-14 items-center justify-between px-5">
            <img src="/logo-beige.svg" alt="Pilates by Riven" className="h-[15px] w-auto" />
            <NavLink to={accountPath} aria-label="Mi cuenta" className="rounded-full">
              <Avatar name={user.fullName} size="sm" />
            </NavLink>
          </div>
        </header>

        <main ref={mainRef} className="scroll-area flex-1">
          <div className="mx-auto w-full max-w-6xl px-5 pb-10 pt-6 sm:px-8 lg:px-12 lg:pb-16 lg:pt-12">
            {children}
          </div>
        </main>

        {/* Barra inferior (celular) */}
        <nav className="pb-safe border-t border-line bg-surface/95 backdrop-blur lg:hidden" aria-label="Principal">
          <div className="mx-auto flex max-w-lg items-stretch justify-around px-2">
            {items.filter((i) => !i.desktopOnly).map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) => cx(
                  'flex min-w-[60px] flex-1 flex-col items-center gap-1 pb-2 pt-2.5 text-[10px] font-semibold transition-colors',
                  isActive ? 'text-ink' : 'text-ink-3',
                )}
              >
                {({ isActive }) => (
                  <>
                    <span className={cx('flex h-8 w-14 items-center justify-center rounded-full transition-colors', isActive && 'bg-clay-soft text-clay-deep')}>
                      <item.icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    {item.short || item.label}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </nav>
      </div>
    </div>
  )
}
