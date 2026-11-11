import { test, expect, createClient, CLIENT_PASSWORD, STAFF_PASSWORD, unique, expectNoHorizontalOverflow } from './helpers'

test.describe('Acceso', () => {
  test('registrarse valida los datos y lleva al formulario de admisión', async ({ page }) => {
    const id = unique()
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Bienvenida de vuelta' })).toBeVisible()
    await expectNoHorizontalOverflow(page)

    await page.getByRole('tab', { name: 'Crear cuenta' }).click()
    await page.getByLabel('Nombre completo').fill('Laura Prueba Interfaz')
    await page.getByLabel('Correo electrónico').fill(`laura${id}@e2e.local`)
    await page.getByLabel('WhatsApp').fill('123')
    await page.getByLabel('Contraseña', { exact: true }).fill('corta')
    await page.getByRole('button', { name: 'Crear cuenta' }).click()
    await expect(page.getByText('al menos 8 caracteres')).toBeVisible()

    await page.getByLabel('Contraseña', { exact: true }).fill(CLIENT_PASSWORD)
    await page.getByRole('button', { name: 'Crear cuenta' }).click()
    await expect(page.getByText('Debes aceptar el aviso de privacidad')).toBeVisible()

    // El aviso de privacidad se puede leer antes de aceptar.
    await page.getByRole('button', { name: 'aviso de privacidad' }).click()
    await expect(page.getByRole('dialog')).toContainText('pendiente de revisión legal')
    await page.getByRole('button', { name: 'Cerrar' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    await page.getByRole('checkbox').check()
    await page.getByRole('button', { name: 'Crear cuenta' }).click()
    await expect(page.getByText('Revisa tu número de WhatsApp')).toBeVisible()
    await page.getByLabel('WhatsApp').fill('7123 4567')
    await page.getByRole('button', { name: 'Crear cuenta' }).click()
    await expect(page).toHaveURL(/\/admision$/)
    await expect(page.getByRole('heading', { name: 'Registro y consentimiento informado' })).toBeVisible()
    await expect(page.getByText(/^PR \d{4}$/)).toBeVisible()
    await expectNoHorizontalOverflow(page)
  })

  test('contraseña incorrecta muestra el error y la correcta entra', async ({ page, request }) => {
    const client = await createClient(request)
    await page.goto('/')
    await page.getByLabel('Correo electrónico').fill(client.email)
    await page.getByLabel('Contraseña', { exact: true }).fill('no-es-esta-clave')
    await page.getByRole('button', { name: 'Iniciar sesión' }).click()
    await expect(page.getByRole('alert')).toContainText('Correo o contraseña incorrectos')

    await page.getByLabel('Contraseña', { exact: true }).fill(CLIENT_PASSWORD)
    await page.getByRole('button', { name: 'Iniciar sesión' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toContainText(client.fullName.split(' ')[0])
    // La sesión se conserva al recargar.
    await page.reload()
    await expect(page.getByRole('heading', { level: 1 })).toContainText(client.fullName.split(' ')[0])
  })

  test('administración entra al panel y una clienta no puede abrirlo', async ({ page, request }) => {
    await page.goto('/')
    await page.getByLabel('Correo electrónico').fill('admin@e2e.local')
    await page.getByLabel('Contraseña', { exact: true }).fill(STAFF_PASSWORD)
    await page.getByRole('button', { name: 'Iniciar sesión' }).click()
    await expect(page.getByText('Hoy en el estudio')).toBeVisible()
    await expect(page.getByText('Pendientes', { exact: true })).toBeVisible()

    // Como clienta, las rutas del panel vuelven a su inicio.
    const client = await createClient(request)
    await page.evaluate((token) => localStorage.setItem('pbr_token', token), client.token)
    await page.goto('/caja')
    await expect(page).toHaveURL(/localhost:3100\/$/)
    await expect(page.getByText('Hoy en el estudio')).toHaveCount(0)
  })
})
