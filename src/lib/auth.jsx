import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, getToken, setToken, setUnauthenticatedHandler } from './api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const queryClient = useQueryClient()
  // status: 'loading' (validando sesión guardada) | 'guest' | 'ready'
  const [state, setState] = useState({ status: getToken() ? 'loading' : 'guest', user: null, client: null })

  const clear = useCallback(() => {
    setToken(null)
    queryClient.clear()
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
      const data = await api.post('/auth/change-password', { currentPassword, newPassword })
      setToken(data.token)
    },
    deleteAccount: async (password) => { await api.delete('/auth/me', { password }); clear() },
    refresh: async () => accept(await api.get('/auth/me')),
    logout: clear,
  }), [state, accept, clear])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
