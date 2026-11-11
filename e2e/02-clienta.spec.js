import { test, expect, createClient, openAs, dialog, staffToken, API, PNG, expectNoHorizontalOverflow } from './helpers'

test.describe('Clienta', () => {
  test('admisión completa en cuatro pasos y luego puede reservar', async ({ page, request }) => {
    const client = await createClient(request, { intake: false })
    await openAs(page, client.token, '/')
    // Aviso en el inicio mientras está pendiente.
    await page.getByRole('link', { name: /Completa tu formulario de admisión/ }).click()
    await expect(page).toHaveURL(/\/admision$/)

    // Paso 1: datos
    await page.getByLabel('Fecha de nacimiento').fill('1992-03-14')
    await page.getByLabel(/^Nombre\s*Opcional$/).fill('Contacto De Prueba')
    await page.getByRole('button', { name: 'Continuar' }).click()

    // Paso 2: salud (voluntaria) con campos que aparecen según la respuesta
    await expect(page.getByText('Responder es voluntario')).toBeVisible()
    await expect(page.getByLabel('¿Cuáles?')).toHaveCount(0)
    await page.getByRole('button', { name: 'Cirugías previas' }).click()
    await page.getByLabel('¿Cuáles?').fill('Menisco, 2020')
    await page.getByRole('radio', { name: 'Sí', exact: true }).click()
    await page.getByLabel('Zona').fill('Rodilla derecha')
    await page.getByRole('radio', { name: 'Sí, quiero informarlo' }).click()
    await page.getByRole('radio', { name: '4', exact: true }).click()
    await expectNoHorizontalOverflow(page)
    await page.getByRole('button', { name: 'Continuar' }).click()

    // Paso 3: "Ninguno" es excluyente
    await page.getByRole('button', { name: 'Yoga' }).click()
    await page.getByRole('button', { name: 'Ninguno' }).click()
    await expect(page.getByRole('button', { name: 'Yoga' })).toHaveAttribute('aria-pressed', 'false')
    await page.getByRole('button', { name: 'Preparación física específica' }).click()
    await page.getByLabel('Explica tu objetivo').fill('Media maratón')
    await page.getByRole('button', { name: 'Continuar' }).click()

    // Paso 4: declaración aparte; no se envía sin aceptar y firmar
    await expect(page.getByRole('heading', { name: 'Declaración' })).toBeVisible()
    const send = page.getByRole('button', { name: 'Enviar formulario' })
    await expect(send).toBeDisabled()
    await page.getByRole('checkbox').check()
    await expect(send).toBeDisabled()
    await page.getByLabel('Escribe tu nombre completo como firma').fill(client.fullName)
    await send.click()
    await expect(page.getByRole('heading', { name: '¡Listo!' })).toBeVisible()

    // El aviso desaparece y la ficha queda para revisión privada (informó algo de salud).
    await page.goto('/')
    await expect(page.getByRole('link', { name: /formulario de admisión/ })).toHaveCount(0)
    const admin = await staffToken(request)
    const ficha = await (await request.get(`${API}/admin/clients/${client.clientId}`, { headers: { Authorization: `Bearer ${admin}` } })).json()
    expect(ficha.client.intakeStatus).toBe('needs_review')
    expect(ficha.client.birthDate).toBe('1992-03-14')
  })

  test('sin admisión, reservar lleva al formulario', async ({ page, request }) => {
    const client = await createClient(request, { intake: false })
    await openAs(page, client.token, '/reservar')
    await page.getByRole('tab').nth(1).click()
    await page.getByRole('button', { name: 'Reservar', exact: true }).first().click()
    await dialog(page).getByRole('button', { name: 'Reservar', exact: true }).click()
    await expect(page).toHaveURL(/\/admision$/)
  })

  test('reserva una clase, la ve en su agenda y la cancela', async ({ page, request }) => {
    const client = await createClient(request)
    await openAs(page, client.token, '/reservar')
    await expect(page.getByRole('heading', { name: 'Elige tu clase' })).toBeVisible()
    await page.getByRole('tab').nth(1).click() // mañana siempre tiene clases
    await expect(page.getByRole('heading', { name: 'Mañana' })).toBeVisible()
    await expectNoHorizontalOverflow(page)

    await page.getByRole('button', { name: 'Reservar', exact: true }).first().click()
    await expect(dialog(page)).toContainText('Confirma tu reserva')
    await expect(dialog(page)).toContainText('pendiente hasta que el estudio la confirme')
    await dialog(page).getByRole('button', { name: 'Reservar', exact: true }).click()
    await expect(dialog(page)).toContainText('Solicitud enviada')
    await expect(dialog(page)).toContainText('Por confirmar')
    await dialog(page).getByRole('link', { name: 'Ver mis clases' }).click()

    await expect(page).toHaveURL(/\/clases$/)
    await expect(page.getByText('Por confirmar')).toBeVisible()
    await expect(page.getByRole('tab', { name: /Próximas/ })).toContainText('1')
    // La misma clase ya no ofrece "Reservar" otra vez.
    await page.goto('/reservar')
    await page.getByRole('tab').nth(1).click()
    await expect(page.getByText('Por confirmar').first()).toBeVisible()

    await page.goto('/clases')
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click()
    await dialog(page).getByRole('button', { name: 'Sí, cancelar' }).click()
    await expect(page.getByText('No tienes clases agendadas')).toBeVisible()
    await page.getByRole('tab', { name: 'Historial' }).click()
    await expect(page.getByText('Cancelada', { exact: true })).toBeVisible()
  })

  test('compra una clase suelta, sube el comprobante y administración lo verifica', async ({ page, request }) => {
    const client = await createClient(request)
    await openAs(page, client.token, '/paquetes')
    await expect(page.getByText('Aún no tienes paquetes')).toBeVisible()
    await page.locator('div').filter({ hasText: /^Clase sueltaClase suelta/ }).getByRole('button', { name: 'Elegir' }).click()
    await expect(dialog(page)).toContainText('US$25')
    await dialog(page).getByRole('button', { name: 'Continuar al pago' }).click()

    // Pantalla de pago: total, referencia de la orden y datos de SINPE.
    await expect(dialog(page)).toContainText('Total a pagar')
    await expect(dialog(page)).toContainText('US$25')
    await expect(dialog(page)).toContainText(/PR\d{4}-[0-9A-F]{6}/)
    await expect(dialog(page)).toContainText('8888 0000')
    await expectNoHorizontalOverflow(page)
    // Tarjeta: sin enlace todavía, lo explica y no confirma nada.
    await dialog(page).getByRole('tab', { name: 'Tarjeta' }).click()
    await expect(dialog(page)).toContainText('El estudio te enviará el enlace de pago')
    await dialog(page).getByRole('tab', { name: 'SINPE Móvil' }).click()

    const send = dialog(page).getByRole('button', { name: 'Enviar comprobante' })
    await expect(send).toBeDisabled()
    await dialog(page).locator('input[type=file]').setInputFiles({ name: 'sinpe.png', mimeType: 'image/png', buffer: PNG })
    await dialog(page).getByLabel('N.º de referencia del SINPE').fill('20261111')
    await send.click()
    await expect(dialog(page)).toContainText('Recibimos tu comprobante')
    await dialog(page).getByRole('button', { name: 'Cerrar' }).click()
    await expect(page.getByText('Pago por verificar')).toBeVisible()

    // Administración verifica: el paquete de la clienta queda pagado.
    const admin = await staffToken(request)
    const headers = { Authorization: `Bearer ${admin}` }
    const pending = await (await request.get(`${API}/admin/payments?status=to_verify&clientId=${client.clientId}`, { headers })).json()
    expect(pending.payments).toHaveLength(1)
    expect(pending.payments[0].hasProof).toBe(true)
    const proof = await request.get(`${API}/admin/payments/${pending.payments[0].id}/proof`, { headers })
    expect(proof.headers()['content-type']).toBe('image/jpeg') // la foto se redujo a JPEG antes de subir
    await request.post(`${API}/admin/payments/${pending.payments[0].id}/verify`, { headers })

    await page.reload()
    await expect(page.getByText('Pago confirmado')).toBeVisible()
    await expect(page.getByText('1 de 1 clase por reservar')).toBeVisible()
  })

  test('edita su perfil y ve su ID de alumna', async ({ page, request }) => {
    const client = await createClient(request)
    await openAs(page, client.token, '/perfil')
    await expect(page.getByText(`ID de alumna · ${client.studentCode}`)).toBeVisible()
    const save = page.getByRole('button', { name: 'Guardar cambios' })
    await expect(save).toBeDisabled()
    await page.getByLabel('Contacto de emergencia').fill('Hermana')
    await page.getByLabel('WhatsApp').fill('abc')
    await save.click()
    await expect(page.getByText('Revisa tu número de WhatsApp')).toBeVisible()
    await page.getByLabel('WhatsApp').fill('7999 1234')
    await save.click()
    await expect(page.getByText('Datos actualizados')).toBeVisible()
    await expect(page.getByLabel('WhatsApp')).toHaveValue('+506 7999 1234')
    await expect(save).toBeDisabled()
    await expectNoHorizontalOverflow(page)
  })
})
