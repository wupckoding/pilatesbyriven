import { test, expect, createClient, openAs, staffToken, expectNoHorizontalOverflow } from './helpers'

// Revisión de cada pantalla en computadora y en celular: carga, tiene título,
// no se desborda a lo ancho, no lanza errores y los botones se pueden tocar.
const ADMIN = ['/', '/agenda', '/reservas', '/clientas', '/paquetes', '/paquetes?vista=active', '/paquetes?vista=payments', '/paquetes?vista=catalog', '/caja', '/ajustes']
const CLIENT = ['/', '/reservar', '/clases', '/paquetes', '/perfil', '/admision']

async function review(page, testInfo, path) {
  await page.goto(path)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
  await expectNoHorizontalOverflow(page)
  // Controles demasiado pequeños para el dedo (menos de 32 px) en celular.
  if (testInfo.project.name === 'celular') {
    const tiny = await page.evaluate(() => [...document.querySelectorAll('main button, main a[href]')]
      .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 32 && !el.closest('p, li, dd, label') })
      .map((el) => `${el.tagName} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30)}" ${el.className.slice(0, 40)} ${Math.round(el.getBoundingClientRect().height)}px`))
    expect(tiny, `controles pequeños en ${path}`).toEqual([])
  }
  await testInfo.attach(`${testInfo.project.name}${path.replace(/[/?=]/g, '-')}`, { body: await page.screenshot({ fullPage: false }), contentType: 'image/png' })
}

test.describe('Todas las pantallas', () => {
  test('panel de administración', async ({ page, request }, testInfo) => {
    await openAs(page, await staffToken(request), '/')
    for (const path of ADMIN) await review(page, testInfo, path)
  })

  test('app de la clienta', async ({ page, request }, testInfo) => {
    const client = await createClient(request)
    await openAs(page, client.token, '/')
    for (const path of CLIENT) await review(page, testInfo, path)
  })

  test('la navegación principal lleva a cada sección', async ({ page, request }) => {
    await openAs(page, await staffToken(request), '/')
    for (const [link, heading] of [['Agenda', 'Clases y cupos'], ['Clientas', 'Fichas y seguimiento'], ['Caja', 'Cobros, gastos y ahorro'], ['Inicio', /Buen/]]) {
      await page.getByRole('link', { name: link, exact: true }).locator('visible=true').first().click()
      await expect(page.getByRole('heading', { level: 1 })).toContainText(heading)
    }
  })
})
