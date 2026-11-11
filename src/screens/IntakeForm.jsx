import React, { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, ShieldCheck } from 'lucide-react'
import { BLANK_ANSWERS, CONDITIONS, EXERCISES, GOALS, PILATES_TYPES, SCHEDULES } from '../lib/intake'
import { fmtPhone } from '../lib/format'
import { Button, Card, Field, Input, Logo, Textarea, cx } from '../ui'

const STEPS = ['Tus datos', 'Salud', 'Experiencia y objetivos', 'Declaración']

function Chips({ options, value, onToggle, label }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
      {options.map(([key, text]) => {
        const on = value.includes(key)
        return (
          <button
            key={key}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(key)}
            className={cx(
              'inline-flex min-h-[40px] items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors',
              on ? 'border-ink bg-ink text-surface' : 'border-line bg-surface text-ink-2 hover:border-clay',
            )}
          >
            {on && <Check className="h-3.5 w-3.5" aria-hidden="true" />}{text}
          </button>
        )
      })}
    </div>
  )
}

function Choice({ value, onChange, options, label }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
      {options.map(([key, text]) => (
        <button
          key={String(key)}
          type="button"
          role="radio"
          aria-checked={value === key}
          onClick={() => onChange(value === key ? null : key)}
          className={cx(
            'min-h-[40px] min-w-[72px] rounded-full border px-4 text-sm font-semibold transition-colors',
            value === key ? 'border-ink bg-ink text-surface' : 'border-line bg-surface text-ink-2 hover:border-clay',
          )}
        >
          {text}
        </button>
      ))}
    </div>
  )
}

const Question = ({ title, hint, children }) => (
  <div>
    <p className="text-[15px] font-semibold text-ink">{title}</p>
    {hint && <p className="mt-0.5 text-[13px] text-ink-3">{hint}</p>}
    <div className="mt-3">{children}</div>
  </div>
)

/**
 * Formulario de registro y consentimiento informado, en cuatro pasos.
 * Las preguntas de salud son voluntarias; la declaración va en una pantalla aparte.
 * Sirve para la clienta (desde su cuenta) y para el llenado asistido en el estudio.
 */
export default function IntakeForm({ info, assisted = false, onSubmit, onExit, exitLabel = 'Ahora no' }) {
  const [step, setStep] = useState(0)
  const [personal, setPersonal] = useState({
    birthDate: info.personal?.birthDate || '', emergencyName: info.personal?.emergencyName || '', emergencyPhone: info.personal?.emergencyPhone || '',
  })
  const [a, setA] = useState({ ...BLANK_ANSWERS, ...(info.answers || {}) })
  const [hasPain, setHasPain] = useState(info.answers?.painLevel != null)
  const [accepted, setAccepted] = useState(false)
  const [signature, setSignature] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const topRef = useRef(null)

  useEffect(() => { topRef.current?.scrollIntoView({ block: 'start' }) }, [step])

  const set = (key) => (e) => setA((prev) => ({ ...prev, [key]: e?.target ? e.target.value : e }))
  const toggle = (key, { exclusive } = {}) => (item) => setA((prev) => {
    const list = prev[key]
    if (exclusive && item === exclusive) return { ...prev, [key]: list.includes(item) ? [] : [item] }
    const next = list.includes(item) ? list.filter((x) => x !== item) : [...list.filter((x) => x !== exclusive), item]
    return { ...prev, [key]: next }
  })

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      await onSubmit({
        personal: { birthDate: personal.birthDate || null, emergencyName: personal.emergencyName.trim(), emergencyPhone: personal.emergencyPhone.trim() },
        answers: { ...a, painLevel: hasPain ? a.painLevel : null, weeklyFrequency: a.weeklyFrequency },
        consent: { accepted, fullName: signature.trim(), version: info.consentVersion },
      })
    } catch (err) {
      setError(err)
      setBusy(false)
    }
  }
  const last = step === STEPS.length - 1
  const canSend = accepted && signature.trim().length >= 3

  return (
    <div ref={topRef} className="mx-auto w-full max-w-2xl">
      <header className="text-center">
        <Logo size="sm" />
        <h1 className="display mt-5 text-[30px] text-ink sm:text-[36px]">Registro y consentimiento informado</h1>
        <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.3em] text-ink-3">Strength · Control · Elegance</p>
      </header>

      {/* Progreso */}
      <ol className="mt-7 flex items-center gap-2" aria-label="Pasos">
        {STEPS.map((name, i) => (
          <li key={name} className="flex-1" aria-current={i === step ? 'step' : undefined}>
            <div className={cx('h-1.5 rounded-full transition-colors', i <= step ? 'bg-clay-deep' : 'bg-sunken')} />
            <p className={cx('mt-2 hidden text-xs font-semibold sm:block', i === step ? 'text-ink' : 'text-ink-3')}>{i + 1}. {name}</p>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-sm font-semibold text-ink sm:hidden">Paso {step + 1} de {STEPS.length} · {STEPS[step]}</p>

      <Card className="mt-5 space-y-7 p-5 sm:p-8">
        {step === 0 && (
          <>
            <div>
              <h2 className="display text-2xl text-ink">Tus datos</h2>
              <p className="mt-1 text-sm text-ink-2">{assisted ? 'Datos de la ficha de la clienta.' : 'Revisa que tus datos estén correctos antes de continuar. Puedes cambiarlos en tu perfil.'}</p>
            </div>
            <dl className="divide-y divide-line rounded-2xl border border-line bg-canvas/60">
              {[['ID de alumna', info.studentCode], ['Nombre completo', info.personal?.fullName], ['Teléfono', fmtPhone(info.personal?.whatsapp)], ['Correo electrónico', info.personal?.email]].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-4 px-4 py-3">
                  <dt className="text-[13px] text-ink-3">{k}</dt>
                  <dd className="tnum min-w-0 break-all text-right text-sm font-semibold text-ink">{v || "—"}</dd>
                </div>
              ))}
            </dl>
            <Field label="Fecha de nacimiento" optional>
              <Input type="date" value={personal.birthDate} onChange={(e) => setPersonal({ ...personal, birthDate: e.target.value })} />
            </Field>
            <div>
              <p className="mb-3 text-[15px] font-semibold text-ink">Contacto de emergencia</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nombre" optional><Input value={personal.emergencyName} onChange={(e) => setPersonal({ ...personal, emergencyName: e.target.value })} maxLength={120} autoComplete="off" /></Field>
                <Field label="Teléfono" optional><Input type="tel" inputMode="tel" value={personal.emergencyPhone} onChange={(e) => setPersonal({ ...personal, emergencyPhone: e.target.value })} maxLength={40} autoComplete="off" /></Field>
              </div>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <div>
              <h2 className="display text-2xl text-ink">Salud</h2>
              <p className="mt-3 flex items-start gap-2.5 rounded-2xl bg-sage-soft px-4 py-3 text-sm leading-relaxed text-sage">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Responder es voluntario. Puedes dejar en blanco lo que prefieras no informar y continuar. Solo el personal autorizado del estudio puede ver estas respuestas.</span>
              </p>
            </div>
            <Question title="¿Hay alguna condición o lesión que quieras informarnos?" hint="Puedes marcar varias.">
              <Chips label="Condiciones" options={CONDITIONS} value={a.conditions} onToggle={toggle('conditions')} />
              {a.conditions.includes('cirugias') && <Field label="¿Cuáles?" className="mt-4"><Input value={a.surgeriesDetail} onChange={set('surgeriesDetail')} maxLength={1000} /></Field>}
              {a.conditions.includes('otras') && <Field label="Otros / Descripción detallada" className="mt-4"><Textarea value={a.otherConditionsDetail} onChange={set('otherConditionsDetail')} maxLength={1000} /></Field>}
            </Question>
            <Question title="¿Hay algún movimiento que sepas que debes evitar?">
              <Textarea aria-label="Movimientos que debes evitar" value={a.avoidMovements} onChange={set('avoidMovements')} maxLength={1000} />
            </Question>
            <Question title="¿Hay algo importante que debamos saber para cuidar tu cuerpo durante las clases?">
              <Textarea aria-label="Algo importante para cuidar tu cuerpo" value={a.careNotes} onChange={set('careNotes')} maxLength={1000} />
            </Question>
            <Question title="¿Tienes alguna lesión activa?">
              <Choice label="Lesión activa" value={a.activeInjury} onChange={set('activeInjury')} options={[['yes', 'Sí'], ['no', 'No']]} />
              {a.activeInjury === 'yes' && (
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <Field label="Zona" optional><Input value={a.injuryZone} onChange={set('injuryZone')} maxLength={300} /></Field>
                  <Field label="Observaciones" optional><Input value={a.injuryNotes} onChange={set('injuryNotes')} maxLength={1000} /></Field>
                </div>
              )}
            </Question>
            <Question title="¿Tienes dolor actualmente?" hint="Si no informas dolor, puedes continuar sin elegir un número.">
              <Choice label="Dolor actual" value={hasPain ? 'yes' : null} onChange={(v) => { setHasPain(v === 'yes'); if (v !== 'yes') set('painLevel')(null) }} options={[['yes', 'Sí, quiero informarlo']]} />
              {hasPain && (
                <div className="mt-4 space-y-4">
                  <div>
                    <p className="mb-2 text-[13px] font-semibold text-ink-2">Dolor actual de 1 a 10</p>
                    <div className="grid grid-cols-5 gap-2 sm:grid-cols-10" role="radiogroup" aria-label="Nivel de dolor">
                      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                        <button key={n} type="button" role="radio" aria-checked={a.painLevel === n} onClick={() => set('painLevel')(a.painLevel === n ? null : n)}
                          className={cx('tnum h-11 rounded-2xl border text-sm font-bold transition-colors', a.painLevel === n ? 'border-ink bg-ink text-surface' : 'border-line bg-surface text-ink-2 hover:border-clay')}>
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="¿Dónde lo sientes?" optional><Input value={a.painZone} onChange={set('painZone')} maxLength={300} /></Field>
                    <Field label="¿Con qué frecuencia?" optional><Input value={a.painFrequency} onChange={set('painFrequency')} maxLength={300} /></Field>
                  </div>
                  <Field label="Observaciones, si aplica" optional><Textarea rows={2} value={a.painNotes} onChange={set('painNotes')} maxLength={1000} /></Field>
                </div>
              )}
            </Question>
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="display text-2xl text-ink">Experiencia y objetivos</h2>
            <Question title="¿Has practicado Pilates antes?">
              <Choice label="Pilates antes" value={a.pilatesBefore} onChange={set('pilatesBefore')} options={[['yes', 'Sí'], ['no', 'No']]} />
              {a.pilatesBefore === 'yes' && (
                <div className="mt-4">
                  <Chips label="Tipos de Pilates" options={PILATES_TYPES} value={a.pilatesTypes} onToggle={toggle('pilatesTypes')} />
                  {a.pilatesTypes.includes('otro') && <Field label="Especifica" className="mt-4"><Input value={a.pilatesOther} onChange={set('pilatesOther')} maxLength={300} /></Field>}
                </div>
              )}
            </Question>
            <Question title="¿Practicas actualmente algún otro ejercicio?" hint="Puedes marcar varias.">
              <Chips label="Otros ejercicios" options={EXERCISES} value={a.exercises} onToggle={toggle('exercises', { exclusive: 'ninguno' })} />
              {a.exercises.includes('deportes') && <Field label="¿Cuál?" className="mt-4"><Input value={a.sportsDetail} onChange={set('sportsDetail')} maxLength={300} /></Field>}
            </Question>
            <Question title="Objetivos personales" hint="Puedes elegir más de uno.">
              <Chips label="Objetivos" options={GOALS} value={a.goals} onToggle={toggle('goals')} />
              {a.goals.includes('preparacion') && <Field label="Explica tu objetivo" className="mt-4"><Textarea rows={2} value={a.goalDetail} onChange={set('goalDetail')} maxLength={1000} /></Field>}
            </Question>
            <Question title="¿Cuántas veces por semana te gustaría practicar Pilates?">
              <Choice label="Veces por semana" value={a.weeklyFrequency} onChange={set('weeklyFrequency')} options={[1, 2, 3, 4, 5].map((n) => [n, n === 5 ? '5 o más' : String(n)])} />
            </Question>
            <Question title="¿Qué horarios prefieres?" hint="Puedes elegir más de una franja.">
              <Chips label="Horarios" options={SCHEDULES} value={a.schedules} onToggle={toggle('schedules')} />
            </Question>
          </>
        )}

        {step === 3 && (
          <>
            <div>
              <h2 className="display text-2xl text-ink">Declaración</h2>
              <p className="mt-1 text-sm text-ink-2">Lee con calma antes de aceptar.</p>
            </div>
            <blockquote className="rounded-2xl border border-line bg-canvas/60 px-5 py-4 text-[15px] leading-relaxed text-ink">{info.consentText}</blockquote>
            <label className="flex cursor-pointer items-start gap-3 text-[15px] leading-snug text-ink">
              <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#8A6548]" />
              <span>He leído y acepto esta declaración.</span>
            </label>
            <Field label={assisted ? 'Nombre completo de la clienta, como firma' : 'Escribe tu nombre completo como firma'} error={error?.data?.field?.startsWith('consent') ? error.message : undefined}>
              <Input value={signature} onChange={(e) => setSignature(e.target.value)} placeholder={info.personal?.fullName || ''} autoComplete="off" maxLength={120} />
            </Field>
            <p className="text-[13px] text-ink-3">Se guardará la fecha, la hora y la versión del texto aceptado ({info.consentVersion}).</p>
            {error && !error.data?.field?.startsWith('consent') && <p className="rounded-2xl bg-terracotta-soft px-4 py-3 text-sm font-medium text-terracotta" role="alert">{error.message}</p>}
          </>
        )}
      </Card>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {step > 0
          ? <Button variant="secondary" icon={ArrowLeft} onClick={() => setStep(step - 1)} disabled={busy}>Atrás</Button>
          : onExit && <Button variant="ghost" onClick={onExit}>{exitLabel}</Button>}
        <span className="flex-1" />
        {last
          ? <Button size="lg" loading={busy} disabled={!canSend} onClick={submit}>Enviar formulario</Button>
          : <Button size="lg" onClick={() => setStep(step + 1)}>Continuar <ArrowRight className="h-4 w-4" aria-hidden="true" /></Button>}
      </div>
    </div>
  )
}
