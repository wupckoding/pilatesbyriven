import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'logo-beige.svg', 'logo-white.svg'],
      manifest: {
        name: 'Pilates by Riven',
        short_name: 'Riven',
        description: 'Reserva tus clases y gestiona tu práctica en Pilates by Riven',
        lang: 'es',
        theme_color: '#F5F0E8',
        background_color: '#F5F0E8',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        // La API nunca se sirve desde caché: cupos y pagos deben ser siempre reales.
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  server: {
    host: true,
    port: 3000,
    // API_PORT permite que las pruebas de interfaz usen su propia API.
    proxy: { '/api': `http://127.0.0.1:${process.env.API_PORT || 3001}` },
  },
})
