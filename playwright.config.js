import { defineConfig, devices } from '@playwright/test'

// Pruebas de interfaz: la app real en un navegador real, en computadora y en celular.
// Levanta su propia API (base pilates_e2e) y su propio Vite, sin tocar el entorno de desarrollo.
export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e/report' }]],
  outputDir: 'e2e/results',
  use: {
    baseURL: 'http://localhost:3100',
    locale: 'es-CR',
    timezoneId: 'America/Costa_Rica',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'computadora', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'celular', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    { command: 'node e2e/server.mjs', url: 'http://127.0.0.1:3101/api/health', reuseExistingServer: false, timeout: 60_000 },
    { command: 'npx vite --port 3100 --strictPort', url: 'http://localhost:3100', reuseExistingServer: false, timeout: 60_000, env: { API_PORT: '3101' } },
  ],
})
