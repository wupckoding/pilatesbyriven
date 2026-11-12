import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { INTAKE } from '../../lib/format'
import { Badge, Button, Card, ErrorState, Skeleton, SuccessCheck } from '../../ui'
import IntakeForm from '../IntakeForm'

/** Paso de admisión de la clienta: aparece al registrarse y antes de reservar o comprar. */
export default function Intake() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { client, refresh } = useAuth()
  const [done, setDone] = useState(false)
  const [editing, setEditing] = useState(false)
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['intake'], queryFn: () => api.get('/intake'), staleTime: 0 })

  if (isLoading) return <div className="mx-auto max-w-2xl"><Skeleton className="h-96" /></div>
  if (isError) return <ErrorState error={error} onRetry={refetch} />

  const submit = async (body) => {
    await api.post('/intake', body)
    await Promise.all([refresh(), qc.invalidateQueries({ queryKey: ['intake'] })])
    setEditing(false)
    setDone(true)
  }

  if (done) {
    return (
      <div className="stagger-in mx-auto flex max-w-md flex-col items-center py-10 text-center">
        <SuccessCheck />
        <h1 className="display mt-6 text-[34px] text-ink">¡Listo!</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-2">Recibimos tu formulario. Ya puedes reservar tu clase.</p>
        <div className="mt-7 flex flex-wrap justify-center gap-2">
          <Button size="lg" to="/reservar">Ver horarios</Button>
          <Button size="lg" variant="secondary" to="/">Ir al inicio</Button>
        </div>
      </div>
    )
  }

  const current = data.status === 'completed' || data.status === 'needs_review'
  if (current && !editing) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <header>
          <p className="eyebrow mb-2">Admisión</p>
          <h1 className="display text-[34px] text-ink">Tu formulario está al día</h1>
        </header>
        <Card className="space-y-4 p-6">
          <Badge tone="sage">{INTAKE.completed.label}</Badge>
          <p className="text-[15px] leading-relaxed text-ink-2">
            Lo enviaste el {new Intl.DateTimeFormat('es-CR', { timeZone: 'America/Costa_Rica', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(data.submittedAt))}.
            Si algo cambió en tu salud o en tus objetivos, actualízalo cuando quieras.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setEditing(true)}>Actualizar mis respuestas</Button>
            <Button variant="ghost" to="/perfil">Volver al perfil</Button>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <IntakeForm draftKey={client ? `pbr_intake_draft_${client.id}` : undefined}
      info={{ ...data, studentCode: client?.studentCode }}
      onSubmit={submit}
      onExit={() => (editing ? setEditing(false) : navigate('/'))}
      exitLabel={editing ? 'Cancelar' : 'Ahora no'}
    />
  )
}
