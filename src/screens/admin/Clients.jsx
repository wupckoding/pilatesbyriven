import React, { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, MessageCircle, Search, UserPlus, Users, X } from 'lucide-react'
import { api } from '../../lib/api'
import { CLIENT_STATUS, INTAKE, fmtDateTime, fmtPhone, waLink } from '../../lib/format'
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, IconButton, Input, PageHeader, Segmented, SkeletonList } from '../../ui'
import ClientForm from './ClientForm'

const FILTERS = [{ value: 'all', label: 'Todas' }, ...Object.entries(CLIENT_STATUS).map(([value, s]) => ({ value, label: s.label }))]

const useDebounced = (value, delay = 250) => {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

export default function Clients() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const followup = params.get('seguimiento') === '1'
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [creating, setCreating] = useState(false)
  const term = useDebounced(search.trim())

  const query = { search: term, status, followup: followup ? '1' : undefined }
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['clients', query],
    queryFn: () => api.get('/admin/clients', query),
    placeholderData: (prev) => prev,
  })
  const clients = data?.clients || []

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Clientas"
        title="Fichas y seguimiento"
        actions={<Button icon={UserPlus} onClick={() => setCreating(true)}>Nueva clienta</Button>}
      />

      <div className="space-y-3">
        <div className="relative max-w-xl">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden="true" />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, WhatsApp, correo o ID"
            aria-label="Buscar clientas"
            className="pl-11"
          />
        </div>
        <Segmented label="Estado" options={FILTERS} value={status} onChange={setStatus} />
        {followup && (
          <button type="button" onClick={() => setParams({}, { replace: true })} className="inline-flex items-center gap-1.5 rounded-full bg-honey-soft px-3 py-1.5 text-[13px] font-semibold text-honey">
            Con seguimiento para hoy o vencido <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>

      {isLoading && <SkeletonList count={5} className="h-[76px]" />}
      {isError && <ErrorState error={error} onRetry={refetch} />}
      {data && clients.length === 0 && (
        <EmptyState
          icon={Users}
          title={term || status !== 'all' || followup ? 'Sin resultados' : 'Aún no hay clientas'}
          text={term || status !== 'all' || followup ? 'Prueba con otro nombre o cambia el filtro.' : 'Crea la primera ficha o espera a que se registren desde la app.'}
        />
      )}

      {clients.length > 0 && (
        <>
          <p className="tnum text-[13px] text-ink-3">{clients.length} {clients.length === 1 ? 'clienta' : 'clientas'}</p>
          <Card className="divide-y divide-line overflow-hidden">
            {clients.map((c) => {
              const s = CLIENT_STATUS[c.status]
              return (
                <div key={c.id} className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-clay-soft/30 sm:px-5">
                  <Link to={`/clientas/${c.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                    <Avatar name={c.fullName} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="truncate text-[15px] font-semibold text-ink">{c.fullName}</p>
                        <Badge tone={s.tone}>{s.label}</Badge>
                        {c.intakeStatus !== 'completed' && <Badge tone={INTAKE[c.intakeStatus].tone} className="hidden sm:inline-flex">{INTAKE[c.intakeStatus].label}</Badge>}
                      </div>
                      <p className="tnum mt-0.5 truncate text-[13px] text-ink-3">
                        {c.studentCode}
                        {c.whatsapp && ` · ${fmtPhone(c.whatsapp)}`}
                        {c.nextClassAt && ` · Próxima: ${fmtDateTime(c.nextClassAt)}`}
                      </p>
                    </div>
                  </Link>
                  {c.whatsapp && <IconButton icon={MessageCircle} label={`WhatsApp de ${c.fullName}`} href={waLink(c.whatsapp)} className="bg-sage-soft !text-sage" />}
                  <ChevronRight className="hidden h-4 w-4 shrink-0 text-ink-3 sm:block" aria-hidden="true" />
                </div>
              )
            })}
          </Card>
        </>
      )}

      {creating && <ClientForm onClose={() => setCreating(false)} onSaved={(saved) => navigate(`/clientas/${saved.id}`)} />}
    </div>
  )
}
