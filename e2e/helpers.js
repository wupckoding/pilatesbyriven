import { test as base, expect } from '@playwright/test'

export const API = 'http://127.0.0.1:3101/api'
export const STAFF_PASSWORD = 'clave-e2e-del-personal'
export const CLIENT_PASSWORD = 'clave-e2e-clienta-1'
// PNG válido de 1×1 para subir como comprobante.
export const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64')

let counter = 0
export const unique = () => `${Date.now().toString(36)}${(counter += 1)}`

/**
 * Toda prueba falla si la página lanza un error de JavaScript o escribe un error en la consola.
 * (Los avisos del navegador por respuestas 4xx esperadas no cuentan.)
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    // La apertura de marca tiene su propia prueba (05-apertura); en las demás se omite para no esperar.
    if (!test.info().title.includes('apertura')) {
      await page.addInitScript(() => { try { sessionStorage.setItem('pbr_intro', '1') } catch { /* sin almacenamiento */ } })
    }
    const problems = []
    page.on('pageerror', (err) => problems.push(`error de página: ${err.message}`))
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !msg.text().startsWith('Failed to load resource')) problems.push(`consola: ${msg.text()}`)
    })
    await use(page)
    expect(problems, 'errores de JavaScript durante la prueba').toEqual([])
  },
})
export { expect }

const json = async (res) => { const body = await res.json(); if (!res.ok()) throw new Error(`${res.url()} → ${res.status()} ${JSON.stringify(body)}`); return body }

export const staffToken = async (request, email = 'admin@e2e.local') =>
  (await json(await request.post(`${API}/auth/login`, { data: { email, password: STAFF_PASSWORD } }))).token

/** Crea una clienta por API (rápido) cuando el registro no es lo que se está probando. */
export async function createClient(request, { intake = true, name } = {}) {
  const id = unique()
  const fullName = name || `Clienta ${id}`
  const email = `c${id}@e2e.local`
  const reg = await json(await request.post(`${API}/auth/register`, {
    data: { fullName, email, password: CLIENT_PASSWORD, whatsapp: `7${String(Math.floor(Math.random() * 9e6) + 1e6)}`, acceptPrivacy: true },
  }))
  if (intake) {
    await json(await request.post(`${API}/intake`, {
      headers: { Authorization: `Bearer ${reg.token}` },
      data: { answers: {}, consent: { accepted: true, fullName } },
    }))
  }
  return { email, fullName, token: reg.token, clientId: reg.client.id, studentCode: reg.client.studentCode }
}

/** Abre la app ya con sesión iniciada. */
export async function openAs(page, token, path = '/') {
  await page.addInitScript((value) => { try { localStorage.setItem('pbr_token', value) } catch { /* sin almacenamiento */ } }, token)
  await page.goto(path)
}

/** La pantalla no debe desbordarse a lo ancho (ni la página ni el área de contenido). */
export async function expectNoHorizontalOverflow(page) {
  const overflow = await page.evaluate(() => {
    const main = document.querySelector('main')
    return {
      page: document.documentElement.scrollWidth - window.innerWidth,
      main: main ? main.scrollWidth - main.clientWidth : 0,
    }
  })
  expect(overflow.page, 'la página se desborda a lo ancho').toBeLessThanOrEqual(1)
  expect(overflow.main, 'el contenido se desborda a lo ancho').toBeLessThanOrEqual(1)
}

export const dialog = (page) => page.getByRole('dialog').last()
export const isMobile = (testInfo) => testInfo.project.name === 'celular'
