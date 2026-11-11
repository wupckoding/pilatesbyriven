import React, { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Copy, CreditCard, FileUp, MessageCircle, PackageOpen, Smartphone } from 'lucide-react'
import { api } from '../../lib/api'
import { MODALITY, PRODUCT_KIND, addDays, capitalize, fmtDate, fmtMoney, fmtTime, newKey, todayCR, waLink } from '../../lib/format'
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, PageHeader, SectionTitle, Segmented, Select, SkeletonList, cx } from '../../ui'
import Sheet from '../../ui/Sheet'
import { useToast } from '../../ui/Toast'
import { MyPackageCard, useMyPackages } from './shared'

const useRefresh = () => {
  const qc = useQueryClient()
  return () => Promise.all(['my-packages', 'my-bookings', 'sessions', 'order-payment', 'my-products'].map((key) => qc.invalidateQueries({ queryKey: [key] })))
}

/** Reduce una foto a un JPEG razonable antes de subirla (los PDF van tal cual). */
async function fileToBase64(file) {
  if (file.type === 'application/pdf') {
    const buf = new Uint8Array(await file.arrayBuffer())
    let bin = ''
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000))
    return btoa(bin)
  }
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.82).split(',')[1]
}

// ─── Pagar una orden ─────────────────────────────────────
function PaySheet({ orderId, onClose }) {
  const toast = useToast()
  const refresh = useRefresh()
  const [method, setMethod] = useState('sinpe')
  const [file, setFile] = useState(null)
  const [reference, setReference] = useState('')
  const [copied, setCopied] = useState('')
  const inputRef = useRef(null)
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['order-payment', orderId],
    queryFn: () => api.get(`/orders/${orderId}/payment`),
    enabled: !!orderId,
  })
  const send = useMutation({
    mutationFn: async () => api.post(`/orders/${orderId}/proof`, { data: await fileToBase64(file), reference: reference.trim() }),
    onSuccess: async () => { await refresh(); setFile(null); toast.success('Comprobante enviado') },
    onError: toast.error,
  })
  const cancel = useMutation({
    mutationFn: () => api.post(`/orders/${orderId}/cancel`),
    onSuccess: async () => { await refresh(); toast.success('Orden cancelada'); onClose() },
    onError: toast.error,
  })
  const copy = async (label, text) => {
    try { await navigator.clipboard.writeText(text); setCopied(label); setTimeout(() => setCopied(''), 1800) } catch { toast.error('No se pudo copiar. Mantén presionado para seleccionar el texto') }
  }

  const pkg = data?.package
  const waiting = data?.payments.find((y) => y.status === 'to_verify')
  const rejected = !waiting && data?.payments[0]?.status === 'rejected' ? data.payments[0] : null
  const paid = pkg && pkg.balanceCents === 0
  const CopyRow = ({ label, value }) => (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="text-[13px] text-ink-3">{label}</p>
        <p className="tnum truncate text-[15px] font-semibold text-ink">{value}</p>
      </div>
      <Button size="sm" variant="secondary" icon={copied === label ? Check : Copy} onClick={() => copy(label, value)}>{copied === label ? 'Copiado' : 'Copiar'}</Button>
    </div>
  )

  return (
    <Sheet open={!!orderId} onClose={onClose} title={paid ? 'Pago confirmado' : 'Pagar'} subtitle={pkg?.name}>
      {isLoading && <SkeletonList count={3} className="h-16" />}
      {isError && <ErrorState error={error} onRetry={refetch} />}
      {pkg && (
        <div className="space-y-5">
          <div className="grain rounded-3xl bg-espresso p-5 text-white">
            <p className="text-[11px] font-semibold uppercase tracking-label text-white/60">{paid ? 'Total pagado' : 'Total a pagar'}</p>
            <p className="display tnum mt-2 text-[44px]">{fmtMoney(paid ? pkg.priceCents : pkg.balanceCents, pkg.currency)}</p>
            <p className="tnum mt-1 text-sm text-white/70">Referencia de tu orden: <strong className="font-semibold text-white">{data.reference}</strong></p>
          </div>

          {paid && <p className="rounded-2xl bg-sage-soft px-4 py-3 text-sm font-medium text-sage">El estudio confirmó tu pago. Ya puedes reservar tus clases.</p>}

          {waiting && (
            <div className="rounded-3xl border border-honey/30 bg-honey-soft p-4">
              <p className="text-[15px] font-semibold text-ink">Recibimos tu comprobante</p>
              <p className="mt-1 text-sm leading-relaxed text-ink-2">El estudio lo está revisando. Tu pago aparece como <strong className="font-semibold">por verificar</strong> hasta que lo confirme.</p>
            </div>
          )}
          {rejected && (
            <p className="rounded-2xl bg-terracotta-soft px-4 py-3 text-sm font-medium text-terracotta" role="alert">
              No pudimos confirmar tu comprobante anterior{rejected.rejectReason ? `: ${rejected.rejectReason}` : ''}. Puedes enviar otro.
            </p>
          )}

          {!paid && !waiting && (
            <>
              <Segmented label="Medio de pago" value={method} onChange={setMethod} options={[{ value: 'sinpe', label: 'SINPE Móvil' }, { value: 'card', label: 'Tarjeta' }]} />
              {method === 'sinpe' ? (
                <div className="space-y-4">
                  {data.sinpe.number ? (
                    <Card className="divide-y divide-line">
                      <CopyRow label={`SINPE Móvil${data.sinpe.name ? ` · ${data.sinpe.name}` : ''}`} value={data.sinpe.number} />
                      <CopyRow label="Detalle de la transferencia" value={data.reference} />
                    </Card>
                  ) : (
                    <p className="rounded-2xl border border-dashed border-line px-4 py-4 text-sm text-ink-2">Escríbenos por WhatsApp y te pasamos el número de SINPE.</p>
                  )}
                  <div>
                    <p className="mb-1.5 text-[13px] font-semibold text-ink-2">Sube tu comprobante</p>
                    <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                    <button type="button" onClick={() => inputRef.current?.click()} className={cx('flex w-full items-center gap-3 rounded-2xl border border-dashed px-4 py-4 text-left transition-colors hover:border-clay', file ? 'border-clay bg-clay-soft/40' : 'border-line bg-surface')}>
                      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-clay-soft text-clay-deep"><FileUp className="h-[18px] w-[18px]" aria-hidden="true" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-ink">{file ? file.name : 'Elegir foto o PDF'}</span>
                        <span className="block text-[13px] text-ink-3">{file ? 'Toca para cambiarlo' : 'Captura de pantalla del SINPE'}</span>
                      </span>
                    </button>
                  </div>
                  <Field label="N.º de referencia del SINPE" optional><Input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={120} inputMode="numeric" /></Field>
                  <Button size="lg" block icon={Smartphone} loading={send.isPending} disabled={!file} onClick={() => send.mutate()}>Enviar comprobante</Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {data.cardLink
                    ? <Button size="lg" block icon={CreditCard} href={data.cardLink}>Pagar con tarjeta o Apple Pay</Button>
                    : <p className="rounded-2xl border border-dashed border-line px-4 py-4 text-sm leading-relaxed text-ink-2">El estudio te enviará el enlace de pago de BAC Compra Click para esta orden. Cuando esté listo, aparecerá aquí.</p>}
                  <p className="text-[13px] leading-relaxed text-ink-3">El pago se hace en la página segura de BAC. Al volver, tu orden sigue como pendiente hasta que el estudio confirme el cobro.</p>
                </div>
              )}
            </>
          )}

          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
            <Button variant="whatsapp" size="sm" icon={MessageCircle} href={waLink(data.studioWhatsapp, `Hola, tengo una consulta sobre mi orden ${data.reference}.`)}>Consultar por WhatsApp</Button>
            {!paid && !waiting && pkg.paidCents === 0 && <Button variant="ghost" size="sm" className="!text-terracotta" loading={cancel.isPending} onClick={() => cancel.mutate()}>Cancelar orden</Button>}
          </div>
        </div>
      )}
    </Sheet>
  )
}

// ─── Comprar ─────────────────────────────────────────────
function BuySheet({ product, onClose, onCreated }) {
  const navigate = useNavigate()
  const toast = useToast()
  const refresh = useRefresh()
  const key = useRef(newKey())
  const today = todayCR()
  const single = product.sessionsCount === 1
  const [sessionId, setSessionId] = useState('')
  const sessions = useQuery({
    queryKey: ['sessions', today, addDays(today, 20)],
    queryFn: () => api.get('/sessions', { from: today, to: addDays(today, 20) }),
    enabled: single,
  })
  const free = (sessions.data?.sessions || []).filter((s) => s.spotsLeft > 0 && !s.myBooking)
  const buy = useMutation({
    mutationFn: () => api.post('/orders', { productId: product.id, sessionId: sessionId || null, orderKey: key.current }),
    onSuccess: async ({ package: pkg }) => { await refresh(); onClose(); onCreated(pkg.id) },
    onError: (err) => {
      toast.error(err)
      if (err.code === 'INTAKE_REQUIRED') navigate('/admision')
      if (err.code === 'SESSION_FULL') sessions.refetch()
    },
  })
  return (
    <Sheet
      open
      onClose={onClose}
      size="sm"
      title={product.name}
      subtitle={PRODUCT_KIND[product.kind]}
      footer={<><Button variant="ghost" onClick={onClose}>Ahora no</Button><Button loading={buy.isPending} onClick={() => buy.mutate()}>Continuar al pago</Button></>}
    >
      <div className="space-y-4">
        <Card className="divide-y divide-line">
          {[['Incluye', `${product.sessionsCount} ${product.sessionsCount === 1 ? 'clase' : 'clases'}`], ['Vigencia', `${product.validityDays} días`], ['Total', fmtMoney(product.priceCents, product.currency)]].map(([k, v]) => (
            <div key={k} className="flex items-center justify-between px-5 py-3">
              <p className="text-[13px] text-ink-3">{k}</p>
              <p className="tnum text-sm font-semibold text-ink">{v}</p>
            </div>
          ))}
        </Card>
        {single && (
          <Field label="Elige tu clase" optional hint="Tu lugar queda retenido mientras confirmamos el pago.">
            <Select value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
              <option value="">{sessions.isLoading ? 'Cargando horarios…' : 'Elegir después'}</option>
              {free.map((s) => <option key={s.id} value={s.id}>{capitalize(fmtDate(s.localDate, { weekday: 'short', day: 'numeric', month: 'short' }))} · {fmtTime(s.localTime)} · {MODALITY[s.modality]}</option>)}
            </Select>
          </Field>
        )}
        <p className="text-sm leading-relaxed text-ink-2">
          {single ? 'Después eliges cómo pagar: SINPE o tarjeta.' : 'Después de pagar podrás reservar tus clases con este paquete.'}
        </p>
      </div>
    </Sheet>
  )
}

export default function MyPackages() {
  const [paying, setPaying] = useState(null)
  const [buying, setBuying] = useState(null)
  const mine = useMyPackages()
  const products = useQuery({ queryKey: ['my-products'], queryFn: () => api.get('/products') })
  const packages = mine.data?.packages || []
  const current = packages.filter((p) => p.status !== 'expired')
  const old = packages.filter((p) => p.status === 'expired')

  return (
    <div className="mx-auto max-w-2xl space-y-8 lg:mx-0 lg:max-w-none">
      <PageHeader eyebrow="Paquetes" title="Tus clases y pagos" />

      <section>
        <SectionTitle>Mis paquetes</SectionTitle>
        {mine.isLoading && <SkeletonList count={1} className="h-40" />}
        {mine.isError && <ErrorState error={mine.error} onRetry={mine.refetch} />}
        {mine.data && packages.length === 0 && <EmptyState icon={PackageOpen} title="Aún no tienes paquetes" text="Elige una opción abajo para empezar." />}
        <div className="grid gap-3 lg:grid-cols-2">
          {current.map((p) => (
            <div key={p.id}>
              <MyPackageCard pkg={p} />
              <div className="mt-2 flex gap-2 px-1">
                <Button size="sm" variant={p.balanceCents > 0 && p.toVerifyCents < p.balanceCents ? 'primary' : 'secondary'} onClick={() => setPaying(p.id)}>
                  {p.balanceCents === 0 ? 'Ver pago' : p.toVerifyCents >= p.balanceCents ? 'Ver estado del pago' : 'Pagar'}
                </Button>
                {p.status === 'active' && p.available > 0 && <Button size="sm" variant="ghost" to="/reservar">Reservar clases</Button>}
              </div>
            </div>
          ))}
          {old.slice(0, 2).map((p) => <MyPackageCard key={p.id} pkg={p} />)}
        </div>
      </section>

      <section>
        <SectionTitle>Comprar</SectionTitle>
        {products.isLoading && <SkeletonList count={2} className="h-32" />}
        {products.isError && <ErrorState error={products.error} onRetry={products.refetch} />}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {products.data?.products.map((p) => (
            <Card key={p.id} className="flex flex-col p-5">
              <p className="eyebrow">{PRODUCT_KIND[p.kind]}</p>
              <p className="mt-1 text-[15px] font-semibold text-ink">{p.name}</p>
              <p className="display tnum mt-3 text-[40px] text-ink">{fmtMoney(p.priceCents, p.currency)}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge tone="clay">{p.sessionsCount} {p.sessionsCount === 1 ? 'clase' : 'clases'}</Badge>
                <Badge>Vigencia {p.validityDays} días</Badge>
              </div>
              <Button className="mt-5 self-start" variant="secondary" onClick={() => setBuying(p)}>Elegir</Button>
            </Card>
          ))}
        </div>
      </section>

      {buying && <BuySheet product={buying} onClose={() => setBuying(null)} onCreated={setPaying} />}
      <PaySheet orderId={paying} onClose={() => setPaying(null)} />
    </div>
  )
}
