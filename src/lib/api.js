// Cliente HTTP de la API. En desarrollo Vite redirige /api al servidor local.
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

export const api = {
  get: (path, params) => request('GET', path + qs(params)),
  post: (path, body = {}) => request('POST', path, body),
  put: (path, body = {}) => request('PUT', path, body),
  patch: (path, body = {}) => request('PATCH', path, body),
  delete: (path, body = {}) => request('DELETE', path, body),
}
