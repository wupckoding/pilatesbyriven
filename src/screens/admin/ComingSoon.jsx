import React from 'react'
import { Check, Landmark, WalletCards } from 'lucide-react'
import { Badge, Card, PageHeader } from '../../ui'

const CONTENT = {
  paquetes: {
    icon: WalletCards,
    eyebrow: 'Paquetes y pagos',
    title: 'Paquetes, renovaciones y cobros',
    items: [
      'Catálogo editable: prueba US$15, clase suelta US$25 y paquete mensual US$80',
      'Paquete por clienta con créditos reservados, consumidos y disponibles',
      'Renovación con retención de cupo, fecha límite y pago parcial',
      'Cobros por SINPE y Compra Click, con comprobante y verificación',
    ],
  },
  caja: {
    icon: Landmark,
    eyebrow: 'Caja',
    title: 'Caja, gastos y fondo Lindora',
    items: [
      'Cobros confirmados, reembolsos y gastos por período',
      'Transferencias al fondo de Lindora frente a la meta mensual y total',
      'Totales separados en USD y CRC con tipo de cambio guardado',
      'Exportación a CSV o Excel con los mismos filtros',
    ],
  },
}

/** Secciones de la siguiente entrega: el modelo de datos ya existe, falta la interfaz. */
export default function ComingSoon({ kind }) {
  const { icon: Icon, eyebrow, title, items } = CONTENT[kind]
  return (
    <div className="max-w-3xl space-y-7">
      <PageHeader eyebrow={eyebrow} title={title} />
      <Card className="p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-clay-soft text-clay-deep">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
          <Badge tone="honey">Siguiente entrega · Fase 2</Badge>
        </div>
        <p className="mt-5 text-[15px] leading-relaxed text-ink-2">
          La base de datos de esta sección ya está creada. La pantalla se activa en la siguiente entrega con:
        </p>
        <ul className="mt-4 space-y-3">
          {items.map((item) => (
            <li key={item} className="flex items-start gap-3 text-sm text-ink">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-clay-deep" aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
