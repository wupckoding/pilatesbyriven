// Capturas para la App Store (iPhone 6,9": 1320 × 2868) con datos de demostración del entorno local.
//   API (3001) y web (3000) en marcha, con `npm run seed:demo`.  node scripts/app-store-shots.mjs
import { mkdirSync } from 'fs'
import { chromium } from '@playwright/test'

const API = 'http://localhost:3001/api'
const WEB = 'http://localhost:3000'
const OUT = 'docs/app-store'
mkdirSync(OUT, { recursive: true })

const post = async (path, body, token) => {
  const res = await fetch(API + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) })
  return res.json().catch(() => ({}))
}
// Clienta ficticia de demostración (solo existe en la base local).
const { token } = await post('/auth/login', { email: 'daniela.demo@example.test', password: 'demo-readme-2026' })
if (!token) throw new Error('Falta la clienta de demostración en la base local')

const browser = await chromium.launch()
const shots = [
  { name: '1-apertura', path: '/', guest: true, intro: true, wait: 2300 },
  { name: '2-acceso', path: '/', guest: true },
  { name: '3-inicio', path: '/' },
  // Si hoy ya no quedan clases, se pasa al próximo día con horarios.
  { name: '4-reservar', path: '/reservar', before: async (page) => { const next = page.getByRole('button', { name: 'Ir a esa fecha' }); if (await next.count()) await next.click() } },
  { name: '5-paquetes', path: '/paquetes' },
  { name: '6-perfil', path: '/perfil' },
]
for (const s of shots) {
  const context = await browser.newContext({ viewport: { width: 440, height: 956 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  await context.addInitScript(([t, intro]) => {
    // Puente de iOS simulado: se ven los botones nativos de Apple, como en el app real.
    window.webkit = { messageHandlers: { bridge: { postMessage() {} } } }
    if (t) localStorage.setItem('pbr_token', t)
    if (intro) { localStorage.removeItem('pbr_intro_seen'); sessionStorage.removeItem('pbr_intro') } else sessionStorage.setItem('pbr_intro', '1')
  }, [s.guest ? null : token, Boolean(s.intro)])
  const page = await context.newPage()
  await page.goto(WEB + s.path)
  if (!s.intro) await page.waitForLoadState('networkidle')
  await page.waitForTimeout(s.wait || 1300)
  if (s.before) { await s.before(page); await page.waitForTimeout(900) }
  await page.screenshot({ path: `${OUT}/${s.name}.png` })
  console.log('ok', s.name)
  await context.close()
}
await browser.close()
