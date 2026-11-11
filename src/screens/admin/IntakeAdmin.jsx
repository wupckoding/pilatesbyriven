import React, { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ClipboardList, Eye, Lock, MessageCircle } from 'lucide-react'
import { api } from '../../lib/api'
import { describeAnswers } from '../../lib/intake'
import { INTAKE, firstName, fmtDateTime, waLink } from '../../lib/format'
import { Badge, Button, Card, ErrorState, Field, Input, SkeletonList } from '../../ui'
import Sheet from '../../ui/Sheet'
import { useToast } from '../../ui/Toast'
import IntakeForm from '../IntakeForm'

const ACTION = { submit: 'Envió el formulario', view: 'Vio las respuestas', review: 'Marcó como revisado', request_update: 'Pidió actualización', delete: 'Eliminó las respuestas' }
const HELP = {
  pending: 'Aún no completa el formulario de registro y consentimiento.',
  completed: 'Formulario vigente completado.',
  needs_review: 'Informó algo de salud: conviene revisarlo en privado antes de su clase.',
  needs_update: 'Debe actualizar el formulario (cambió la versión o se le pidió).',
}

/** Estado de admisión en la ficha. Las respuestas se abren aparte, solo para administración, y cada acceso se registra. */
export default function IntakeAdmin({ client }) {
  const toast = useToast()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [filling, setFilling] = useState(false)
  const [answers, setAnswers] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [reason, setReason] = useState('')
  const base = `/admin/clients/${client.id}/intake`
  const status = INTAKE[client.intakeStatus]

  const meta = useQuery({ queryKey: ['intake-admin', client.id], queryFn: () => api.get(base), enabled: open || filling })
  const refresh = () => Promise.all(['intake-admin', 'client', 'clients', 'dashboard', 'session'].map((key) => qc.invalidateQueries({ queryKey: [key] })))
  const run = (fn, text) => ({ mutationFn: fn, onSuccess: async () => { await refresh(); if (text) toast.success(text) }, onError: toast.error })
  const reveal = useMutation({ mutationFn: () => api.post(`${base}/reveal`, {}), onSuccess: async (data) => { setAnswers(data); await qc.invalidateQueries({ queryKey: ['intake-admin'] }) }, onError: toast.error })
  const review = useMutation(run(() => api.post(`${base}/review`), 'Marcado como revisado'))
  const requestUpdate = useMutation(run(() => api.post(`${base}/request-update`), 'Se pedirá actualización'))
  const remove = useMutation({
    mutationFn: () => api.delete(base, { reason: reason.trim() }),
    onSuccess: async () => { await refresh(); setDeleting(false); setReason(''); setAnswers(null); toast.success('Respuestas eliminadas') },
    onError: toast.error,
  })

  const close = () => { setOpen(false); setAnswers(null); setDeleting(false) }
  const last = meta.data?.submissions.find((s) => !s.deletedAt)
  const askMessage = `Hola ${firstName(client.fullName)}, para tu próxima clase en Pilates by Riven necesitamos que completes tu formulario de registro desde la app. Toma unos minutos. ¡Gracias!`

  return (
    <>
      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-clay-soft text-clay-deep"><ClipboardList className="h-[18px] w-[18px]" aria-hidden="true" /></span>
          <div className="min-w-0 flex-1">
            <Badge tone={status.tone}>{status.label}</Badge>
            <p className="mt-1.5 text-[13px] leading-snug text-ink-2">{HELP[client.intakeStatus]}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>Ver admisión</Button>
          {(client.intakeStatus === 'pending' || client.intakeStatus === 'needs_update') && (
            <>
              <Button size="sm" variant="secondary" onClick={() => setFilling(true)}>Llenar en el estudio</Button>
              {client.whatsapp && <Button size="sm" variant="whatsapp" icon={MessageCircle} href={waLink(client.whatsapp, askMessage)}>Pedirlo por WhatsApp</Button>}
            </>
          )}
        </div>
      </Card>

      <Sheet open={open} onClose={close} size="lg" title="Admisión" subtitle={`${client.fullName} · ${client.studentCode}`}>
        {meta.isLoading && <SkeletonList count={3} className="h-14" />}
        {meta.isError && <ErrorState error={meta.error} onRetry={meta.refetch} />}
        {meta.data && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={INTAKE[meta.data.status].tone}>{INTAKE[meta.data.status].label}</Badge>
              {last && <Badge>Formulario {last.formVersion}</Badge>}
              {last?.assisted && <Badge>Llenado en el estudio</Badge>}
            </div>

            {last ? (
              <Card className="divide-y divide-line">
                {[
                  ['Enviado', fmtDateTime(last.createdAt)],
                  ['Declaración aceptada por', `${last.consentName} · ${fmtDateTime(last.consentAcceptedAt)}`],
                  ['Versión del texto aceptado', last.consentVersion],
                  ['Revisado', last.reviewedAt ? `${fmtDateTime(last.reviewedAt)} · ${last.reviewedByName || ''}` : last.needsReview ? 'Pendiente' : 'No requiere'],
                ].map(([k, v]) => (
                  <div key={k} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3">
                    <p className="text-[13px] text-ink-3">{k}</p>
                    <p className="text-sm font-medium text-ink">{v}</p>
                  </div>
                ))}
              </Card>
            ) : <p className="rounded-2xl border border-dashed border-line px-4 py-4 text-sm text-ink-3">No hay un formulario vigente.</p>}

            {/* Respuestas clínicas: solo a pedido */}
            {last?.hasAnswers && !answers && (
              <div className="rounded-3xl border border-line bg-surface p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-ink"><Lock className="h-4 w-4 text-clay-deep" aria-hidden="true" /> Respuestas de salud</p>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-2">Son datos sensibles. Ábrelas solo cuando lo necesites: cada consulta queda registrada con tu nombre y la hora.</p>
                <Button size="sm" className="mt-3" icon={Eye} loading={reveal.isPending} onClick={() => reveal.mutate()}>Ver respuestas</Button>
              </div>
            )}
            {answers && (
              <div className="space-y-4">
                {describeAnswers(answers.answers).map((group) => (
                  <section key={group.title}>
                    <p className="eyebrow mb-2">{group.title}</p>
                    <Card as="dl" className="divide-y divide-line">
                      {group.rows.map(([k, v]) => (
                        <div key={k} className="px-4 py-3 sm:flex sm:items-start sm:justify-between sm:gap-6">
                          <dt className="shrink-0 text-[13px] text-ink-3">{k}</dt>
                          <dd className={`mt-0.5 whitespace-pre-wrap text-sm sm:mt-0 sm:text-right ${v ? 'font-medium text-ink' : 'text-ink-3'}`}>{v || 'Sin informar'}</dd>
                        </div>
                      ))}
                    </Card>
                  </section>
                ))}
                <Button size="sm" variant="secondary" onClick={() => setAnswers(null)}>Ocultar respuestas</Button>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {meta.data.status === 'needs_review' && <Button size="sm" loading={review.isPending} onClick={() => review.mutate()}>Marcar como revisado</Button>}
              {last && meta.data.status !== 'needs_update' && <Button size="sm" variant="secondary" loading={requestUpdate.isPending} onClick={() => requestUpdate.mutate()}>Pedir actualización</Button>}
              <Button size="sm" variant="secondary" onClick={() => { close(); setFilling(true) }}>Llenar en el estudio</Button>
              {last?.hasAnswers && !deleting && <Button size="sm" variant="ghost" className="!text-terracotta" onClick={() => setDeleting(true)}>Eliminar respuestas</Button>}
            </div>
            {deleting && (
              <div className="space-y-3 rounded-3xl border border-line bg-surface p-4">
                <p className="text-sm font-semibold text-ink">Eliminar las respuestas de salud</p>
                <p className="text-[13px] text-ink-3">No se puede deshacer. Queda constancia de que existieron y de quién las eliminó. La clienta tendrá que volver a completar el formulario.</p>
                <Field label="Motivo"><Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Solicitud de la clienta" /></Field>
                <div className="flex gap-2">
                  <Button size="sm" variant="danger" disabled={reason.trim().length < 3} loading={remove.isPending} onClick={() => remove.mutate()}>Eliminar definitivamente</Button>
                  <Button size="sm" variant="ghost" onClick={() => setDeleting(false)}>Volver</Button>
                </div>
              </div>
            )}

            <section>
              <p className="eyebrow mb-2">Registro de accesos y cambios</p>
              {meta.data.log.length === 0
                ? <p className="text-sm text-ink-3">Sin movimientos.</p>
                : (
                  <Card className="divide-y divide-line">
                    {meta.data.log.map((l) => (
                      <div key={l.id} className="flex flex-wrap items-center justify-between gap-x-4 px-4 py-2.5">
                        <p className="text-sm text-ink">{ACTION[l.action]} <span className="text-ink-3">· {l.actorName || 'Cuenta eliminada'}</span></p>
                        <p className="tnum text-[13px] text-ink-3">{fmtDateTime(l.createdAt)}</p>
                      </div>
                    ))}
                  </Card>
                )}
            </section>
          </div>
        )}
      </Sheet>

      <Sheet open={filling} onClose={() => setFilling(false)} size="lg" title="Formulario en el estudio" subtitle="Complétalo junto a la clienta; ella lee y acepta la declaración.">
        {meta.data
          ? (
            <IntakeForm
              assisted
              info={{ ...meta.data, studentCode: client.studentCode, personal: { fullName: client.fullName, whatsapp: client.whatsapp, email: client.email, birthDate: client.birthDate, emergencyName: client.emergencyName, emergencyPhone: client.emergencyPhone } }}
              onSubmit={async (body) => { await api.post(base, body); await refresh(); setFilling(false); toast.success('Formulario guardado') }}
              onExit={() => setFilling(false)}
              exitLabel="Cancelar"
            />
          )
          : <SkeletonList count={3} className="h-16" />}
      </Sheet>
    </>
  )
}
