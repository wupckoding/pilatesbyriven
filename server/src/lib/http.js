export class HttpError extends Error {
  constructor(status, message, code = 'ERROR', extra = undefined) {
    super(message)
    this.status = status
    this.code = code
    this.extra = extra
  }
}

/** Envuelve un handler async para que los errores lleguen al middleware de errores. */
export const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

/** Valida con zod y lanza 400 con el primer mensaje legible. */
export const parse = (schema, data) => {
  const result = schema.safeParse(data ?? {})
  if (result.success) return result.data
  const issue = result.error.issues[0]
  const field = issue.path.join('.')
  throw new HttpError(400, issue.message || 'Datos inválidos', 'VALIDATION', { field })
}
