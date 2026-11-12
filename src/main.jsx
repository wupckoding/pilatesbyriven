import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@fontsource-variable/manrope'
import '@fontsource-variable/fraunces/opsz.css'
import '@fontsource-variable/fraunces/opsz-italic.css'
import './index.css'
import App from './App'
import { AuthProvider } from './lib/auth'
import { ToastProvider } from './ui/Toast'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 20_000,
      refetchOnWindowFocus: true,
      // No se reintenta lo que el servidor rechazó a propósito (permisos, validación).
      retry: (count, error) => (error?.status === 0 || error?.status >= 500) && count < 2,
      // Sin conexión se intenta igual y se muestra el error con "Reintentar",
      // en vez de quedarse en blanco esperando a que vuelva la red.
      networkMode: 'always',
    },
    // Una acción sin conexión falla enseguida con su aviso; nunca queda en pausa para dispararse sola después.
    mutations: { networkMode: 'always' },
  },
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
)
