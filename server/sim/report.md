# Simulación de uso — Pilates by Riven

- Fecha: 2026-11-11T23:28:37.958Z
- Usuarias virtuales: **1000** (concurrencia 60, semilla 20261111) + 3 sesiones de administración y 1 instructora en paralelo
- Duración: **54.1 s** · Peticiones: **17080** (316 por segundo)
- Latencia: p50 53 ms · p95 830 ms · p99 1587 ms · máx 3323 ms
- Datos generados: 1000 clientas, 945 reservas (466 en lista de espera), 567 paquetes, 344 pagos, 884 formularios, 5250 registros de auditoría
- Clases más disputadas (3 cupos): 3/3, 3/3, 3/3, 3/3, 3/3, 3/3

## Resultado: SIN FALLOS

- Errores del servidor (5xx o sin respuesta): **0**
- Respuestas fuera de lo esperado: **0**
- Invariantes de negocio rotos: **0**

## Invariantes comprobados

| Regla | Casos que la rompen |
|---|---|
| ninguna clase supera su capacidad | 0 |
| una clienta no tiene dos reservas vivas en la misma clase | 0 |
| ningún paquete tiene más clases cubiertas que créditos | 0 |
| ningún paquete activo sin estar pagado (salvo excepción autorizada) | 0 |
| ningún paquete pagado quedó sin activar | 0 |
| las clases retenidas de un paquete activo quedaron confirmadas | 0 |
| IDs de alumna únicos | 0 |
| máximo una clase de prueba vigente por clienta | 0 |
| ningún pago duplicado por la misma clave | 0 |
| ningún reembolso supera su pago | 0 |
| un solo comprobante por verificar por orden | 0 |
| las respuestas clínicas están cifradas en la base | 0 |
| la auditoría no guarda contenido clínico | 0 |
| una cuenta eliminada no conserva reservas futuras vivas | 0 |
| Caja concilia con la suma de pagos, reembolsos y gastos | 0 |
| las respuestas clínicas no aparecen en listas, agenda, Caja ni exportaciones | 0 |
| en ningún instante de la corrida una clase superó su capacidad (vigilancia cada 0,7 s) | 0 |

## Acciones

| Acción | Peticiones | Respuestas | p50 ms | p95 ms |
|---|---:|---|---:|---:|
| mis paquetes | 3063 | 200×3063 | 102 | 825 |
| reservar | 2260 | 200×779 201×874 409×607 | 62 | 408 |
| orden | 1250 | 201×756 409×494 | 63 | 434 |
| admin: verificar pago | 1046 | 200×1020 409×26 | 43 | 216 |
| registro | 1000 | 201×1000 | 664 | 2812 |
| admisión | 884 | 201×884 | 47 | 96 |
| ver horarios | 884 | 200×884 | 52 | 309 |
| mis clases | 884 | 200×884 | 48 | 555 |
| ataque: panel | 735 | 403×735 | 14 | 47 |
| comprobante | 670 | 201×335 409×335 | 551 | 1626 |
| ataque: entrada inválida | 630 | 400×516 404×114 | 18 | 97 |
| admin: dar cupo | 480 | 200×1 409×479 | 3 | 30 |
| cancelar reserva | 372 | 200×372 | 47 | 566 |
| info de pago | 335 | 200×335 | 67 | 572 |
| reservar sin admisión | 295 | 409×295 | 55 | 95 |
| admin: confirmar reserva | 288 | 200×287 409×1 | 20 | 208 |
| segunda prueba | 210 | 201×163 409×47 | 66 | 511 |
| admin: ver comprobante | 156 | 200×156 | 541 | 1720 |
| ataque: orden ajena | 105 | 404×105 | 39 | 381 |
| ataque: comprobante ajeno | 105 | 404×105 | 35 | 627 |
| ataque: cancelar ajena | 105 | 404×105 | 58 | 829 |
| ataque: cancelar orden ajena | 105 | 404×105 | 32 | 88 |
| ataque: json roto | 105 | 400×105 | 2 | 6 |
| ataque: cuerpo enorme | 105 | 413×105 | 3 | 7 |
| ataque: token falso | 105 | 401×105 | 2 | 5 |
| ataque: sin sesión | 105 | 401×105 | 2 | 5 |
| admin: pagos por verificar | 90 | 200×90 | 3 | 90 |
| admin: por confirmar | 90 | 200×90 | 2 | 34 |
| admin: lista de espera | 90 | 200×90 | 6 | 32 |
| editar perfil | 80 | 200×80 | 34 | 499 |
| cambiar contraseña | 32 | 200×32 | 1293 | 1986 |
| token viejo | 32 | 401×32 | 13 | 26 |
| setup | 31 | 200×4 201×27 | 3 | 161 |
| registro repetido | 29 | 409×29 | 301 | 1556 |
| admin: inicio | 26 | 200×26 | 14 | 232 |
| admin: caja | 26 | 200×26 | 10 | 45 |
| instructora: agenda | 26 | 200×26 | 2 | 209 |
| admin: rechazar pago | 25 | 200×17 409×8 | 37 | 73 |
| admin: asistencia | 24 | 200×10 409×14 | 3 | 34 |
| eliminar cuenta | 20 | 200×20 | 608 | 1595 |
| cuenta eliminada | 20 | 401×20 | 14 | 422 |
| cancelar orden | 19 | 200×19 | 34 | 445 |
| admin: ficha | 17 | 200×17 | 3 | 283 |
| admin: ver respuestas | 17 | 200×16 404×1 | 4 | 395 |
| instructora: respuestas | 17 | 403×17 | 1 | 34 |
| admin: mover reserva | 17 | 201×1 409×16 | 2 | 446 |
| admin: vender paquete | 12 | 201×3 409×9 | 5 | 71 |
| admin: cancelar clase | 9 | 200×9 | 2 | 4 |
| admin: reactivar clase | 9 | 200×9 | 2 | 14 |
| fuga de datos clínicos | 8 | 200×8 | 10 | 17 |
| admin: gasto | 7 | 201×7 | 5 | 26 |
| admin: transferencia | 7 | 201×7 | 7 | 25 |
| admin: completar pago | 6 | 200×3 201×3 | 22 | 37 |
| admin: pagos verificados | 4 | 200×4 | 20 | 25 |
| admin: pago parcial | 3 | 201×3 | 21 | 28 |
| admin: reembolso | 3 | 201×3 | 6 | 7 |
| admin: cancelar paquete | 1 | 200×1 | 2283 | 2283 |
| cierre | 1 | 200×1 | 9 | 9 |
