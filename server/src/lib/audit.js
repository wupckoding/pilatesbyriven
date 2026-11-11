/** Registra quién cambió qué. `q` es db o una transacción. */
export const audit = (q, actorId, action, entity, entityId, detail = null) =>
  q.run(
    'insert into audit_log (actor_id, action, entity, entity_id, detail) values ($1,$2,$3,$4,$5)',
    [actorId || null, action, entity, entityId ? String(entityId) : null, detail ? JSON.stringify(detail) : null],
  )
