// Cliente HTTP de la API. En desarrollo Vite redirige /api al servidor local;
// en el app de iPhone VITE_API_URL apunta al servidor publicado.
import { isNative, shareFile } from './native'

const BASE = import.meta.env.VITE_API_URL ?? ''
const TOKEN_KEY = 'pbr_token'

const storage = {
  get() { try { return localStorage.getItem(TOKEN_KEY) } catch { return null } },
  set(value) { try { value ? localStorage.setItem(TOKEN_KEY, value) : localStorage.removeItem(TOKEN_KEY) } catch { /* modo privado */ } },
}

let token = storage.get()
let onUnauthenticated = () => {}

export const getToken = () => token
export const setToken = (value) => { token = value || null; storage.set(token) }
export const setUnauthenticatedHandler = (fn) => { onUnauthenticated = fn }

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'NETWORK', data = {} } = {}) {
    super(message)
    this.status = status
    this.code = code
    this.data = data
  }
}

async function request(method, path, body) {
  let res
  try {
    res = await fetch(`${BASE}/api${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError('No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 401 && data.code === 'UNAUTHENTICATED' && token) onUnauthenticated()
    throw new ApiError(data.error || 'Ocurrió un error. Inténtalo de nuevo', { status: res.status, code: data.code, data })
  }
  return data
}

const qs = (params) => {
  const entries = Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== null && v !== '')
  return entries.length ? `?${new URLSearchParams(entries)}` : ''
}

/** Descarga un archivo protegido (CSV) con la sesión actual. */
async function download(path, params, filename) {
  let res
  try {
    res = await fetch(`${BASE}/api${path}${qs(params)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  } catch {
    throw new ApiError('No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo')
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new ApiError(data.error || 'No se pudo generar el archivo', { status: res.status, code: data.code, data })
  }
  const blob = await res.blob()
  // En el iPhone no hay "descargas": el archivo se ofrece con la hoja de compartir.
  if (isNative) return shareFile(blob, filename)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Abre un archivo protegido (comprobante) en una pestaña nueva, con la sesión actual. */
async function openFile(path) {
  let res
  try {
    res = await fetch(`${BASE}/api${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  } catch {
    throw new ApiError('No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo')
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new ApiError(data.error || 'No se pudo abrir el archivo', { status: res.status, code: data.code, data })
  }
  const blob = await res.blob()
  if (isNative) {
    const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/heic': 'heic', 'application/pdf': 'pdf' }[blob.type] || 'bin'
    return shareFile(blob, `comprobante.${ext}`)
  }
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank', 'noopener')
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export const api = {
  download,
  openFile,
  get: (path, params) => request('GET', path + qs(params)),
  post: (path, body = {}) => request('POST', path, body),
  put: (path, body = {}) => request('PUT', path, body),
  patch: (path, body = {}) => request('PATCH', path, body),
  delete: (path, body = {}) => request('DELETE', path, body),
}
