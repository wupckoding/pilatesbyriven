import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, getToken, setToken, setUnauthenticatedHandler } from './api'
import { nativeSignOut } from './native'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const queryClient = useQueryClient()
  // status: 'loading' (validando sesión guardada) | 'guest' | 'ready'
  const [state, setState] = useState({ status: getToken() ? 'loading' : 'guest', user: null, client: null })

  const clear = useCallback(() => {
    setToken(null)
    // Un borrador de admisión a medias no debe quedar en el dispositivo al salir.
    try { Object.keys(sessionStorage).filter((k) => k.startsWith('pbr_intake_draft_')).forEach((k) => sessionStorage.removeItem(k)) } catch { /* sin almacenamiento */ }
    queryClient.clear()
    nativeSignOut()
    setState({ status: 'guest', user: null, client: null })
  }, [queryClient])

  const accept = useCallback((data) => {
    if (data.token) setToken(data.token)
    setState({ status: 'ready', user: data.user, client: data.client })
  }, [])

  useEffect(() => {
    setUnauthenticatedHandler(clear)
    if (!getToken()) return
    let cancelled = false
    api.get('/auth/me')
      .then((data) => { if (!cancelled) accept(data) })
      .catch((err) => {
        if (cancelled) return
        // Sin red no se cierra la sesión: se reintenta al recargar.
        if (err.status === 0) setState({ status: 'offline', user: null, client: null })
        else clear()
      })
    return () => { cancelled = true }
  }, [accept, clear])

  const value = useMemo(() => ({
    ...state,
    isStaff: state.user?.role === 'admin' || state.user?.role === 'instructor',
    isAdmin: state.user?.role === 'admin',
    login: async (email, password) => accept(await api.post('/auth/login', { email, password })),
    register: async (form) => accept(await api.post('/auth/register', form)),
    updateProfile: async (patch) => accept(await api.patch('/auth/me', patch)),
    changePassword: async (currentPassword, newPassword) => {
      const data = await api.post('/auth/change-password', { currentPassword: currentPassword || undefined, newPassword })
      setToken(data.token)
      setState((s) => ({ ...s, user: { ...s.user, hasPassword: true } }))
    },
    google: async (credential, extra = {}) => accept(await api.post('/auth/google', { credential, ...extra })),
    // payload: { identityToken, authorizationCode, fullName } de la ventana nativa de Apple
    apple: async (payload, extra = {}) => accept(await api.post('/auth/apple', { ...payload, ...extra })),
    verifyEmail: async (code) => accept(await api.post('/auth/verify-email', { code })),
    resendCode: () => api.post('/auth/resend-code'),
    // confirmation: { password } o, en cuentas de Google sin contraseña, { confirm: 'ELIMINAR' }
    deleteAccount: async (confirmation) => { await api.delete('/auth/me', confirmation); clear() },
    refresh: async () => accept(await api.get('/auth/me')),
    logout: clear,
  }), [state, accept, clear])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
