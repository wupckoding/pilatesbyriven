// Comprueba el app compilado, servido en modo producción (con la política de seguridad del
// navegador activa): ninguna pantalla debe generar errores de consola y el service worker
// debe quedar instalado.
//
//   npm run build
//   NODE_ENV=production PORT=3002 node server/src/index.js      (en otra terminal)
//   node e2e/prod-check.mjs [http://localhost:3002]
//
// Usa la cuenta admin de server/.env; no escribe nada en la base.
import { readFileSync } from 'fs'
import { chromium } from '@playwright/test'

const base = process.argv[2] || 'http://localhost:3002'
const env = Object.fromEntries(
  readFileSync(new URL('../server/.env', import.meta.url), 'utf8').split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
)

const login = await fetch(`${base}/api/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD }),
})
if (!login.ok) throw new Error(`login admin: ${login.status}`)
const { token } = await login.json()

const browser = await chromium.launch()
const page = await browser.newPage()
const problems = []
page.on('console', (m) => { if (m.type() === 'error') problems.push(`${page.url()} · ${m.text().slice(0, 200)}`) })
page.on('pageerror', (e) => problems.push(`${page.url()} · ${e.message}`))

await page.goto(base)
await page.evaluate((t) => localStorage.setItem('pbr_token', t), token)

const routes = ['/', '/agenda', '/reservas', '/clientas', '/paquetes', '/caja', '/ajustes']
for (const route of routes) {
  await page.goto(base + route)
  await page.waitForLoadState('networkidle')
  if (!(await page.locator('h1').first().isVisible())) problems.push(`${route} · sin título visible`)
}

const sw = await page.evaluate(async () => {
  const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(r, 8000))])
  return reg ? reg.active?.state : null
})
if (!sw) problems.push('el service worker no quedó instalado')

await browser.close()
if (problems.length) {
  console.error(`FALLÓ (${problems.length}):\n` + [...new Set(problems)].join('\n'))
  process.exit(1)
}
console.log(`OK · ${routes.length} pantallas sin errores de consola · service worker ${sw}`)
