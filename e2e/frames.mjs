// Captura cuadros de la apertura para revisarla a ojo.
//   node e2e/frames.mjs [url] [carpeta] [ancho] [alto]
import { mkdirSync } from 'fs'
import { join } from 'path'
import { chromium } from '@playwright/test'

const url = process.argv[2] || 'http://localhost:3000'
const dir = process.argv[3] || 'e2e/results/frames'
const width = Number(process.argv[4] || 390)
const height = Number(process.argv[5] || 844)
mkdirSync(dir, { recursive: true })

const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 })).newPage()
const start = Date.now()
await page.goto(url, { waitUntil: 'commit' })
for (const at of [350, 800, 1300, 1900, 2700, 3150, 3500, 4300]) {
  const wait = at - (Date.now() - start)
  if (wait > 0) await page.waitForTimeout(wait)
  await page.screenshot({ path: join(dir, `${width}-${String(at).padStart(4, '0')}.png`) })
}
await browser.close()
console.log(`cuadros en ${dir}`)
