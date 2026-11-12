// Conferência rápida de um app já publicado, sem conta: a tela de acesso carrega,
// sem erros de consola, y el service worker queda instalado.
//   node e2e/smoke.mjs https://app.pilatesbyriven.com
import { chromium } from '@playwright/test'

const base = process.argv[2]
if (!base) throw new Error('uso: node e2e/smoke.mjs <url>')
// SMOKE_IP=1.2.3.4 fuerza la IP del servidor (útil mientras el DNS nuevo aún no llega a esta red).
const args = process.env.SMOKE_IP ? [`--host-resolver-rules=MAP ${new URL(base).hostname} ${process.env.SMOKE_IP}`] : []
const browser = await chromium.launch({ args })
const page = await browser.newPage()
const problems = []
page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text().slice(0, 200)) })
page.on('pageerror', (e) => problems.push(e.message))
await page.goto(base)
await page.waitForLoadState('networkidle')
const password = await page.getByLabel('Contraseña', { exact: true }).isVisible()
if (!password) problems.push('la pantalla de acceso no muestra el campo de contraseña')
const sw = await page.evaluate(async () => {
  const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(r, 8000))])
  return reg ? reg.active?.state : null
})
if (!sw) problems.push('el service worker no quedó instalado')
await browser.close()
if (problems.length) { console.error('FALLÓ:\n' + problems.join('\n')); process.exit(1) }
console.log(`OK · acceso visible · sin errores de consola · service worker ${sw}`)
