import { test, expect } from './helpers'

test.describe('Apertura de marca', () => {
  test('la apertura se muestra al abrir la app y deja paso al acceso', async ({ page }) => {
    await page.goto('/')
    const intro = page.getByRole('img', { name: 'Pilates by Riven' }).first()
    await expect(intro).toBeVisible()
    // Sola, sin tocar nada, termina y aparece la pantalla de acceso.
    await expect(page.getByRole('heading', { name: 'Bienvenida de vuelta' })).toBeVisible({ timeout: 8000 })
    await expect(page.locator('.intro-on')).toHaveCount(0)
    await expect(page.locator('[aria-label="Pilates by Riven"].fixed')).toHaveCount(0)

    // Al recargar dentro de la misma apertura de la app no se repite.
    await page.reload()
    await expect(page.getByLabel('Contraseña', { exact: true })).toBeVisible()
    await expect(page.locator('[aria-label="Pilates by Riven"].fixed')).toHaveCount(0)
  })

  test('la apertura se puede saltar con un toque', async ({ page }) => {
    await page.goto('/')
    const intro = page.locator('[aria-label="Pilates by Riven"].fixed')
    await expect(intro).toBeVisible()
    await intro.click()
    await expect(intro).toHaveCount(0, { timeout: 3000 })
    await expect(page.getByLabel('Contraseña', { exact: true })).toBeVisible()
  })
})
