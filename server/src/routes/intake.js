import { Router } from 'express'
import { z } from 'zod'
import { db, tx } from '../db.js'
import { h, parse, HttpError } from '../lib/http.js'
import { audit } from '../lib/audit.js'
import { requireAuth, requireRole } from '../auth.js'
import {
  CONSENT_TEXT, CONSENT_VERSION, FORM_VERSION, intakeBody, latestSubmission, logAccess, readAnswers, submitIntake,
} from '../services/intake.js'

const uuid = z.string().uuid('Identificador inválido')
const formInfo = { formVersion: FORM_VERSION, consentVersion: CONSENT_VERSION, consentText: CONSENT_TEXT }

// ─── Clienta: su propio formulario ─────────────────────
export const clientIntake = Router()
clientIntake.use(requireAuth)

const ownClient = async (req) => {
  const client = await db.one(
    `select id, full_name, whatsapp, email, birth_date, emergency_name, emergency_phone, intake_status
       from clients where user_id = $1 and archived_at is null`, [req.user.id])
  if (!client) throw new HttpError(403, 'Tu cuenta no tiene una ficha de clienta', 'NO_CLIENT')
  return client
}

clientIntake.get('/intake', h(async (req, res) => {
  const client = await ownClient(req)
  const last = await latestSubmission(db, client.id)
  res.json({
    ...formInfo,
    status: client.intakeStatus,
    personal: { fullName: client.fullName, whatsapp: client.whatsapp, email: client.email, birthDate: client.birthDate,
      emergencyName: client.emergencyName, emergencyPhone: client.emergencyPhone },
    submittedAt: last?.createdAt || null,
    // La clienta puede ver y actualizar lo que ella misma respondió.
    answers: readAnswers(last),
  })
}))

clientIntake.post('/intake', h(async (req, res) => {
  const body = parse(intakeBody, req.body)
  const client = await ownClient(req)
  await tx((t) => submitIntake(t, { clientId: client.id, actor: req.user, body }))
  const fresh = await db.one('select intake_status from clients where id = $1', [client.id])
  res.status(201).json({ status: fresh.intakeStatus })
}))

// ─── Administración: estado para todos, respuestas solo con permiso y registro de acceso ───
export const adminIntake = Router()
adminIntake.use(requireAuth, requireRole('admin'))

const clientById = async (id) => {
  const client = await db.one('select id, full_name, intake_status from clients where id = $1 and archived_at is null', [id])
  if (!client) throw new HttpError(404, 'Clienta no encontrada', 'NOT_FOUND')
  return client
}

// Estado, historial de versiones y registro de accesos. No incluye respuestas.
adminIntake.get('/clients/:id/intake', h(async (req, res) => {
  const { id } = parse(z.object({ id: uuid }), req.params)
  const client = await clientById(id)
  const submissions = await db.query(
    `select s.id, s.form_version, s.consent_version, s.needs_review, s.reviewed_at, s.consent_name, s.consent_accepted_at,
            s.assisted, s.created_at, s.deleted_at, s.delete_reason, (s.answers_enc is not null) as has_answers,
            u.full_name as submitted_by_name, r.full_name as reviewed_by_name
       from intake_submissions s
       left join users u on u.id = s.submitted_by left join users r on r.id = s.reviewed_by
      where s.client_id = $1 order by s.created_at desc`, [id])
  const log = await db.query(
    `select l.id, l.action, l.created_at, u.full_name as actor_name, u.role as actor_role
       from intake_access_log l left join users u on u.id = l.actor_id
      where l.client_id = $1 order by l.created_at desc limit 50`, [id])
  res.json({ ...formInfo, status: client.intakeStatus, submissions, log })
}))

// Ver respuestas: POST para que nunca quede en caché, y cada consulta se registra.
adminIntake.post('/clients/:id/intake/reveal', h(async (req, res) => {
  const { id } = parse(z.object({ id: uuid }), req.params)
  const body = parse(z.object({ submissionId: uuid.optional() }), req.body)
  await clientById(id)
  const submission = body.submissionId
    ? await db.one('select * from intake_submissions where id = $1 and client_id = $2', [body.submissionId, id])
    : await latestSubmission(db, id)
  if (!submission || !submission.answersEnc) throw new HttpError(404, 'No hay respuestas guardadas', 'NOT_FOUND')
  await logAccess(db, id, submission.id, req.user.id, 'view')
  res.setHeader('Cache-Control', 'no-store')
  res.json({
    answers: readAnswers(submission),
    submission: { id: submission.id, formVersion: submission.formVersion, consentVersion: submission.consentVersion,
      consentName: submission.consentName, consentAcceptedAt: submission.consentAcceptedAt, createdAt: submission.createdAt },
  })
}))

// Llenado asistido en el estudio.
adminIntake.post('/clients/:id/intake', h(async (req, res) => {
  const { id } = parse(z.object({ id: uuid }), req.params)
  const body = parse(intakeBody, req.body)
  await clientById(id)
  await tx((t) => submitIntake(t, { clientId: id, actor: req.user, body, assisted: true }))
  res.status(201).json({ status: (await clientById(id)).intakeStatus })
}))

adminIntake.post('/clients/:id/intake/review', h(async (req, res) => {
  const { id } = parse(z.object({ id: uuid }), req.params)
  await clientById(id)
  await tx(async (t) => {
    const last = await latestSubmission(t, id)
    if (!last) throw new HttpError(409, 'Esta clienta aún no completa el formulario', 'INVALID_STATE')
    await t.run('update intake_submissions set needs_review = false, reviewed_at = now(), reviewed_by = $2 where id = $1', [last.id, req.user.id])
    await t.run(`update clients set intake_status = 'completed', updated_at = now() where id = $1 and intake_status = 'needs_review'`, [id])
    await logAccess(t, id, last.id, req.user.id, 'review')
  })
  res.json({ status: (await clientById(id)).intakeStatus })
}))

adminIntake.post('/clients/:id/intake/request-update', h(async (req, res) => {
  const { id } = parse(z.object({ id: uuid }), req.params)
  await clientById(id)
  await db.run(`update clients set intake_status = 'needs_update', updated_at = now() where id = $1 and intake_status <> 'pending'`, [id])
  await logAccess(db, id, null, req.user.id, 'request_update')
  res.json({ status: (await clientById(id)).intakeStatus })
}))

// Eliminación de datos sensibles a pedido: se borran las respuestas, queda constancia de que existieron.
adminIntake.delete('/clients/:id/intake', h(async (req, res) => {
  const { id } = parse(z.object({ id: uuid }), req.params)
  const body = parse(z.object({ reason: z.string({ required_error: 'Indica el motivo' }).trim().min(3, 'Indica el motivo').max(300) }), req.body)
  await clientById(id)
  await tx(async (t) => {
    await t.run(
      `update intake_submissions set answers_enc = null, deleted_at = now(), delete_reason = $2
        where client_id = $1 and deleted_at is null`, [id, body.reason])
    await t.run(`update clients set intake_status = 'pending', updated_at = now() where id = $1`, [id])
    await logAccess(t, id, null, req.user.id, 'delete')
    await audit(t, req.user.id, 'intake.delete', 'client', id, { reason: body.reason })
  })
  res.json({ status: 'pending' })
}))
