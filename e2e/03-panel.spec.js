import { test, expect, createClient, openAs, dialog, staffToken, API, unique, expectNoHorizontalOverflow } from './helpers'

const addDays = (n) => {
  const d = new Date(Date.now() + n * 864e5)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Costa_Rica' }).format(d)
}

test.describe('Panel de administración', () => {
  let admin
  test.beforeEach(async ({ request }) => { admin = await staffToken(request) })

  test('agenda: abrir una clase, agregar una clienta, moverla y cancelar', async ({ page, request }) => {
    const client = await createClient(request)
    // Clase propia de esta prueba, para no depender de otras.
    const name = `Clase interfaz ${unique()}`
    await openAs(page, admin, '/agenda')
    await page.getByRole('button', { name: 'Clase suelta' }).click()
    await dialog(page).getByLabel('Nombre').fill(name)
    await dialog(page).getByLabel('Fecha').fill(addDays(1))
    await dialog(page).getByLabel('Hora').fill('11:30')
    await dialog(page).getByLabel('Capacidad').fill('2')
    await dialog(page).getByRole('button', { name: 'Crear' }).click()
    await expect(page.getByText('Clase creada')).toBeVisible()
    await expectNoHorizontalOverflow(page)

    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Costa_Rica' }).format(new Date())
    // Si mañana cae en la semana siguiente, se avanza una semana.
    if (new Date(`${addDays(1)}T12:00:00Z`).getUTCDay() === 1 && addDays(1) !== today) await page.getByRole('button', { name: 'Semana siguiente' }).click()
    await page.getByRole('button', { name: new RegExp(name) }).click()
    await expect(dialog(page)).toContainText('Sin reservas todavía')
    await expect(dialog(page)).toContainText('0 de 2')

    await dialog(page).getByRole('button', { name: 'Agregar clienta' }).click()
    await dialog(page).getByPlaceholder('Nombre, WhatsApp o ID').fill(client.fullName)
    await dialog(page).getByRole('button', { name: 'Agregar', exact: true }).click()
    await expect(page.getByText('Reserva confirmada')).toBeVisible()
    await expect(dialog(page)).toContainText(client.fullName)
    await expect(dialog(page)).toContainText('1 de 2')
    await expect(dialog(page)).toContainText('Sin paquete')

    // Mover la reserva a otra clase conserva la reserva y libera este cupo.
    await dialog(page).getByRole('button', { name: 'Mover' }).click()
    const select = dialog(page).getByRole('combobox')
    await select.selectOption({ index: 3 })
    await dialog(page).getByRole('button', { name: 'Mover reserva' }).click()
    await expect(page.getByText('Reserva movida')).toBeVisible()
    await expect(dialog(page)).toContainText('0 de 2')

    // Cancelar la clase pide motivo y se puede reactivar.
    await dialog(page).getByRole('button', { name: 'Cancelar esta clase' }).click()
    await dialog(page).getByLabel('Motivo de la cancelación').fill('Mantenimiento')
    await dialog(page).getByRole('button', { name: 'Cancelar la clase' }).click()
    await expect(page.getByText('Clase cancelada', { exact: true })).toBeVisible()
    await expect(dialog(page)).toContainText('Motivo: Mantenimiento')
    await dialog(page).getByRole('button', { name: 'Reactivar clase' }).click()
    await expect(page.getByText('Clase reactivada')).toBeVisible()
  })

  test('clientas: alta con ID automático, aviso de duplicado y búsqueda', async ({ page }) => {
    const id = unique()
    const phone = `7${String(Math.floor(Math.random() * 9e6) + 1e6)}`
    await openAs(page, admin, '/clientas')
    await page.getByRole('button', { name: 'Nueva clienta' }).click()
    await dialog(page).getByLabel('Nombre completo').fill(`Marta Interfaz ${id}`)
    await dialog(page).getByLabel('WhatsApp').fill('12')
    await dialog(page).getByRole('button', { name: 'Crear ficha' }).click()
    await expect(dialog(page).getByText('Revisa el número de WhatsApp')).toBeVisible()
    await dialog(page).getByLabel('WhatsApp').fill(phone)
    await dialog(page).getByRole('button', { name: 'Crear ficha' }).click()

    await expect(page).toHaveURL(/\/clientas\/[0-9a-f-]{36}$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Marta Interfaz ${id}`)
    await expect(page.getByText(/^PR \d{4}$/)).toBeVisible()
    await expect(page.getByText('Admisión pendiente').first()).toBeVisible()
    await expectNoHorizontalOverflow(page)

    // El mismo WhatsApp avisa antes de crear otra ficha.
    await page.goto('/clientas')
    await page.getByRole('button', { name: 'Nueva clienta' }).click()
    await dialog(page).getByLabel('Nombre completo').fill('Marta Repetida')
    await dialog(page).getByLabel('WhatsApp').fill(`+506 ${phone}`)
    await dialog(page).getByRole('button', { name: 'Crear ficha' }).click()
    await expect(dialog(page)).toContainText('Puede que esta clienta ya tenga ficha')
    await expect(dialog(page)).toContainText(`Marta Interfaz ${id}`)
    await expect(dialog(page).getByRole('button', { name: 'Crear de todos modos' })).toBeVisible()
    await dialog(page).getByRole('button', { name: 'Cancelar' }).click()

    await page.getByLabel('Buscar clientas').fill(`Interfaz ${id}`)
    await expect(page.getByText('1 clienta', { exact: true })).toBeVisible()
    await page.getByLabel('Buscar clientas').fill('nadie-con-este-nombre-zz')
    await expect(page.getByText('Sin resultados')).toBeVisible()
  })

  test('paquete: vender con fechas, pago parcial, completar y queda activo', async ({ page, request }) => {
    const client = await createClient(request)
    await openAs(page, admin, `/clientas/${client.clientId}`)
    await page.getByRole('button', { name: 'Vender paquete' }).first().click()
    await expect(dialog(page)).toContainText('Paquete para')
    // Grupo con cupo amplio: se proponen las cuatro fechas.
    await dialog(page).getByLabel('Grupo fijo').selectOption({ label: 'Mat Lunes' })
    await expect(dialog(page).getByText('4 de 4')).toBeVisible()
    await dialog(page).getByRole('button', { name: 'Crear paquete' }).click()
    await expect(page.getByText('Paquete creado y cupos retenidos')).toBeVisible()

    // Se abre el detalle: por cobrar, con las clases retenidas.
    await expect(dialog(page)).toContainText('Por cobrar')
    await expect(dialog(page)).toContainText('Saldo US$80')
    await expect(dialog(page).getByText('Cupo retenido')).toHaveCount(5) // 4 clases + la línea de vigencia
    await expectNoHorizontalOverflow(page)

    await dialog(page).getByRole('button', { name: 'Registrar pago' }).click()
    await expect(dialog(page).getByLabel('Monto recibido')).toHaveValue('80')
    await dialog(page).getByLabel('Monto recibido').fill('30')
    await expect(dialog(page)).toContainText('Pago parcial: quedará un saldo de US$50')
    await dialog(page).getByRole('button', { name: 'Guardar pago' }).click()
    await expect(dialog(page)).toContainText('Saldo US$50')
    await expect(dialog(page)).toContainText('Por cobrar')

    await dialog(page).getByRole('button', { name: 'Registrar pago' }).click()
    await expect(dialog(page).getByLabel('Monto recibido')).toHaveValue('50')
    await expect(dialog(page)).toContainText('el paquete queda cubierto')
    await dialog(page).getByRole('button', { name: 'Guardar pago' }).click()
    await expect(page.getByText('paquete activo y clases confirmadas')).toBeVisible()
    await expect(dialog(page).getByText('Activo', { exact: true })).toBeVisible()
    await expect(dialog(page).getByText('Confirmada', { exact: true })).toHaveCount(4)
    await expect(dialog(page)).toContainText('Pagos y ajustes · 2')

    // Reembolso parcial desde el detalle.
    await dialog(page).getByRole('button', { name: 'Reembolsar' }).first().click()
    await dialog(page).getByLabel(/Monto a reembolsar/).fill('10')
    await dialog(page).getByLabel('Motivo').fill('Ajuste de prueba')
    await dialog(page).getByRole('button', { name: 'Registrar reembolso' }).click()
    await expect(page.getByText('Reembolso registrado')).toBeVisible()
    await expect(dialog(page)).toContainText('Pagos y ajustes · 3')
    await dialog(page).getByRole('button', { name: 'Cerrar' }).click()

    // La ficha muestra el paquete con sus créditos.
    await expect(page.locator('main').getByText('0 tomadas · 4 reservadas')).toBeVisible()
  })

  test('caja: registrar gasto y transferencia actualiza los totales; exportar descarga el CSV', async ({ page, request }) => {
    const headers = { Authorization: `Bearer ${admin}` }
    const note = `Gasto interfaz ${unique()}`
    const before = await (await request.get(`${API}/admin/caja`, { headers })).json()
    await openAs(page, admin, '/caja')
    await expect(page.getByRole('heading', { name: 'Cobros, gastos y ahorro' })).toBeVisible()
    await expectNoHorizontalOverflow(page)

    await page.getByRole('button', { name: 'Gasto', exact: true }).click()
    await dialog(page).getByLabel('Monto').fill('abc')
    await dialog(page).getByRole('button', { name: 'Guardar' }).click()
    await expect(dialog(page).getByText('Escribe un monto válido')).toBeVisible()
    await dialog(page).getByLabel('Monto').fill('45.50')
    await dialog(page).getByLabel('Nota').fill(note)
    await dialog(page).getByRole('button', { name: 'Guardar' }).click()
    await expect(page.getByText('Gasto registrado')).toBeVisible()
    await expect(page.getByText(note)).toBeVisible()

    await page.getByRole('button', { name: 'Transferencia', exact: true }).click()
    await dialog(page).getByLabel('Monto').fill('100')
    await dialog(page).getByRole('button', { name: 'Guardar' }).click()
    await expect(page.getByText('Transferencia registrada')).toBeVisible()

    const after = await (await request.get(`${API}/admin/caja`, { headers })).json()
    expect(after.totals.USD.expenses - before.totals.USD.expenses).toBe(4550)
    expect(after.savings.period - before.savings.period).toBe(10000)
    expect(after.totals.USD.available - before.totals.USD.available).toBe(-4550) // la transferencia no es gasto

    await page.goto('/paquetes?vista=payments')
    await expect(page.getByRole('button', { name: 'Exportar CSV' })).toBeVisible()
    if (await page.getByRole('button', { name: 'Exportar CSV' }).isEnabled()) {
      const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exportar CSV' }).click()])
      expect(download.suggestedFilename()).toBe('pagos.csv')
    }
  })

  test('admisión: llenar en el estudio, ver respuestas y queda el registro de acceso', async ({ page, request }) => {
    const client = await createClient(request, { intake: false })
    await openAs(page, admin, `/clientas/${client.clientId}`)
    await page.getByRole('button', { name: 'Llenar en el estudio' }).click()
    await expect(dialog(page)).toContainText('Formulario en el estudio')
    await dialog(page).getByRole('button', { name: 'Continuar' }).click()
    await dialog(page).getByRole('button', { name: 'Hernia discal' }).click()
    await dialog(page).getByLabel('Movimientos que debes evitar').fill('Flexión profunda')
    await dialog(page).getByRole('button', { name: 'Continuar' }).click()
    await dialog(page).getByRole('button', { name: 'Continuar' }).click()
    await dialog(page).getByRole('checkbox').check()
    await dialog(page).getByLabel(/como firma/).fill(client.fullName)
    await dialog(page).getByRole('button', { name: 'Enviar formulario' }).click()
    await expect(page.getByText('Formulario guardado')).toBeVisible()
    await expect(page.getByText('Requiere revisión').first()).toBeVisible()

    // Las respuestas no están en la ficha: se abren aparte y el acceso se registra.
    await expect(page.getByText('Flexión profunda')).toHaveCount(0)
    await page.getByRole('button', { name: 'Ver admisión' }).click()
    await expect(dialog(page)).toContainText('Llenado en el estudio')
    await expect(dialog(page).getByText('Flexión profunda')).toHaveCount(0)
    await dialog(page).getByRole('button', { name: 'Ver respuestas' }).click()
    await expect(dialog(page).getByText('Flexión profunda')).toBeVisible()
    await expect(dialog(page).getByText('Hernia discal')).toBeVisible()
    await expect(dialog(page).getByText('Sin informar').first()).toBeVisible()
    await expect(dialog(page)).toContainText('Vio las respuestas')

    await dialog(page).getByRole('button', { name: 'Marcar como revisado' }).click()
    await expect(page.getByText('Marcado como revisado')).toBeVisible()
    await expect(dialog(page).getByText('Admisión completa')).toBeVisible()
  })

  test('ajustes: cambiar una regla se guarda y persiste', async ({ page }) => {
    await openAs(page, admin, '/ajustes')
    const field = page.getByLabel('Retener el cupo sin pago (días)')
    const save = page.getByRole('button', { name: 'Guardar reglas' })
    await expect(save).toBeDisabled()
    const next = (await field.inputValue()) === '6' ? '5' : '6'
    await field.fill(next)
    await save.click()
    await expect(page.getByText('Reglas guardadas')).toBeVisible()
    await page.reload()
    await expect(page.getByLabel('Retener el cupo sin pago (días)')).toHaveValue(next)
    await expectNoHorizontalOverflow(page)
  })

  test('la instructora ve su agenda pero no clientas, pagos ni caja', async ({ page, request }) => {
    const token = await staffToken(request, 'instructora@e2e.local')
    await openAs(page, token, '/')
    await expect(page.getByText('Hoy en el estudio')).toBeVisible()
    await expect(page.getByText('Pendientes', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Clientas' })).toHaveCount(0)
    for (const path of ['/clientas', '/caja', '/paquetes']) {
      await page.goto(path)
      await expect(page).toHaveURL(/localhost:3100\/$/)
    }
  })
})
