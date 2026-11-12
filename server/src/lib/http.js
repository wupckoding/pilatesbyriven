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

// Los mensajes por defecto de zod salen en inglés: aquí se dicen en español.
const spanish = (issue) => {
  const m = issue.message || ''
  if (!/^(String|Number|Array|Expected|Required|Invalid|Unrecognized)/.test(m)) return m || 'Datos inválidos'
  if (issue.code === 'too_big' && issue.type === 'string') return `Demasiado largo (máximo ${issue.maximum} caracteres)`
  if (issue.code === 'too_small' && issue.type === 'string') return issue.minimum <= 1 ? 'Completa este campo' : `Demasiado corto (mínimo ${issue.minimum} caracteres)`
  if (issue.code === 'too_big' || issue.code === 'too_small') return 'El valor está fuera del rango permitido'
  if (m === 'Required') return 'Completa este campo'
  return 'Datos inválidos'
}

/** Una fecha de nacimiento creíble: ni futura ni de hace más de 110 años. */
export const validBirthDate = (ymd) => {
  if (ymd === null || ymd === undefined) return true
  const year = Number(String(ymd).slice(0, 4))
  const now = new Date()
  return year >= now.getFullYear() - 110 && String(ymd) <= now.toISOString().slice(0, 10)
}

/** Valida con zod y lanza 400 con el primer mensaje legible. */
export const parse = (schema, data) => {
  const result = schema.safeParse(data ?? {})
  if (result.success) return result.data
  const issue = result.error.issues[0]
  const field = issue.path.join('.')
  throw new HttpError(400, spanish(issue), 'VALIDATION', { field })
}
