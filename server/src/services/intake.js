import { z } from 'zod'
import { HttpError } from '../lib/http.js'
import { encryptJson, decryptJson } from '../lib/crypto.js'
import { audit } from '../lib/audit.js'

// Al cambiar las preguntas o el texto legal se sube la versión: quien ya completó pasa a "requiere actualización".
export const FORM_VERSION = '2026-11-v1'
export const CONSENT_VERSION = '2026-11-borrador-1'

// Texto proporcionado por Riven. PENDIENTE de revisión legal en Costa Rica antes de publicar
// (Ley 8968 sobre datos sensibles; artículo 42 de la Ley 7472 sobre cláusulas de exoneración).
export const CONSENT_TEXT = 'Declaro que la información proporcionada en este formulario es verdadera, completa y actualizada. '
  + 'Reconozco que la omisión o falsedad de información relevante sobre mi estado de salud puede afectar mi seguridad durante la práctica. '
  + 'Entiendo que la práctica de Pilates es una actividad física voluntaria que implica esfuerzo corporal y conlleva riesgos inherentes. '
  + 'Eximo de responsabilidad a Pilates by Riven, a sus instructoras y representantes por lesiones o daños derivados de la práctica normal.'

export const CONDITIONS = ['columna', 'hernia_discal', 'escoliosis', 'rodilla', 'cadera', 'hombro', 'muneca', 'tobillo',
  'cirugias', 'osteoporosis', 'hipertension', 'diabetes', 'embarazo', 'posparto', 'otras']
export const PILATES_TYPES = ['mat', 'reformer', 'cadillac', 'otro']
export const EXERCISES = ['gimnasio', 'yoga', 'running', 'deportes', 'ninguno']
export const GOALS = ['core', 'postura', 'rehabilitacion', 'dolor', 'flexibilidad', 'tonificacion', 'bienestar', 'preparacion']
export const SCHEDULES = ['manana', 'tarde', 'noche']

const text = (max = 1000) => z.string().trim().max(max, 'Texto demasiado largo').optional().default('')
const yesNo = z.enum(['yes', 'no']).nullable().optional().default(null)

// Toda pregunta clínica es opcional: lo que no se responde queda como "Sin informar".
export const answersSchema = z.object({
  conditions: z.array(z.enum(CONDITIONS)).max(CONDITIONS.length).optional().default([]),
  surgeriesDetail: text(),
  otherConditionsDetail: text(),
  avoidMovements: text(),
  careNotes: text(),
  activeInjury: yesNo,
  injuryZone: text(300),
  injuryNotes: text(),
  painLevel: z.number().int().min(1).max(10).nullable().optional().default(null),
  painZone: text(300),
  painFrequency: text(300),
  painNotes: text(),
  pilatesBefore: yesNo,
  pilatesTypes: z.array(z.enum(PILATES_TYPES)).optional().default([]),
  pilatesOther: text(300),
  exercises: z.array(z.enum(EXERCISES)).optional().default([]),
  sportsDetail: text(300),
  goals: z.array(z.enum(GOALS)).optional().default([]),
  goalDetail: text(),
  weeklyFrequency: z.number().int().min(1).max(7).nullable().optional().default(null),
  schedules: z.array(z.enum(SCHEDULES)).optional().default([]),
}).transform((a) => ({
  ...a,
  // "Ninguno" es excluyente; los detalles solo se guardan si su opción está marcada.
  exercises: a.exercises.includes('ninguno') ? ['ninguno'] : a.exercises,
  surgeriesDetail: a.conditions.includes('cirugias') ? a.surgeriesDetail : '',
  otherConditionsDetail: a.conditions.includes('otras') ? a.otherConditionsDetail : '',
  pilatesTypes: a.pilatesBefore === 'yes' ? a.pilatesTypes : [],
  sportsDetail: a.exercises.includes('deportes') && !a.exercises.includes('ninguno') ? a.sportsDetail : '',
  goalDetail: a.goals.includes('preparacion') ? a.goalDetail : '',
}))

export const intakeBody = z.object({
  personal: z.object({
    birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha de nacimiento inválida').nullable().optional(),
    emergencyName: z.string().trim().max(120).optional().default(''),
    emergencyPhone: z.string().trim().max(40).optional().default(''),
  }).optional().default({}),
  answers: answersSchema,
  consent: z.object({
    accepted: z.literal(true, { errorMap: () => ({ message: 'Debes aceptar la declaración para continuar' }) }),
    fullName: z.string({ required_error: 'Escribe tu nombre completo como firma' }).trim().min(3, 'Escribe tu nombre completo como firma').max(120),
    version: z.string().optional(),
  }),
})

/** Marca para revisión privada si la clienta informó algo de salud. La regla final depende de la revisión legal. */
const needsReview = (a) => a.conditions.length > 0 || a.activeInjury === 'yes' || a.painLevel !== null
  || !!a.avoidMovements || !!a.careNotes || !!a.injuryNotes || !!a.painNotes

export const logAccess = (q, clientId, submissionId, actorId, action) =>
  q.run('insert into intake_access_log (client_id, submission_id, actor_id, action) values ($1,$2,$3,$4)',
    [clientId, submissionId, actorId || null, action])

/** Guarda un envío del formulario. No reemplaza los anteriores. */
export async function submitIntake(t, { clientId, actor, body, assisted = false }) {
  if (body.consent.version && body.consent.version !== CONSENT_VERSION) {
    throw new HttpError(409, 'La declaración cambió. Vuelve a abrir el formulario para leer la versión vigente', 'CONSENT_OUTDATED')
  }
  const review = needsReview(body.answers)
  const row = await t.one(
    `insert into intake_submissions (client_id, form_version, consent_version, answers_enc, needs_review, consent_name, submitted_by, assisted)
     values ($1,$2,$3,$4,$5,$6,$7,$8) returning id, created_at`,
    [clientId, FORM_VERSION, CONSENT_VERSION, encryptJson(body.answers), review, body.consent.fullName, actor.id, assisted])
  await t.run(
    `update clients set intake_status = $2,
            birth_date = coalesce($3::date, birth_date),
            emergency_name = case when $4 <> '' then $4 else emergency_name end,
            emergency_phone = case when $5 <> '' then $5 else emergency_phone end,
            updated_at = now()
      where id = $1`,
    [clientId, review ? 'needs_review' : 'completed', body.personal.birthDate ?? null, body.personal.emergencyName, body.personal.emergencyPhone])
  await logAccess(t, clientId, row.id, actor.id, 'submit')
  // La auditoría general registra el hecho, nunca el contenido.
  await audit(t, actor.id, 'intake.submit', 'client', clientId, { formVersion: FORM_VERSION, consentVersion: CONSENT_VERSION, assisted })
  return row
}

export const latestSubmission = (q, clientId) => q.one(
  `select * from intake_submissions where client_id = $1 and deleted_at is null order by created_at desc limit 1`, [clientId])

export const readAnswers = (submission) => (submission?.answersEnc ? decryptJson(submission.answersEnc) : null)

/** Al arrancar: quien completó una versión anterior del formulario pasa a "requiere actualización". */
export const flagOutdated = (q) => q.run(
  `update clients c set intake_status = 'needs_update', updated_at = now()
    where c.intake_status in ('completed','needs_review')
      and not exists (select 1 from intake_submissions s
                       where s.client_id = c.id and s.deleted_at is null and s.form_version = $1 and s.consent_version = $2)`,
  [FORM_VERSION, CONSENT_VERSION])

/** ¿Pasó el paso de admisión vigente? No depende de lo que haya respondido. */
export const intakeDone = (status) => status === 'completed' || status === 'needs_review'
