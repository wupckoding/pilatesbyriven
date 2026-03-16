/**
 * Pilates by Riven — API Client
 * Handles all HTTP requests + JWT token management
 */

const API_URL = import.meta.env.VITE_API_URL ?? ''
const TOKEN_KEY = 'pbr_token'

// ─── TOKEN MANAGEMENT ─────────────────────────────────
export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

export function hasToken() {
  return !!localStorage.getItem(TOKEN_KEY)
}

// ─── FETCH WRAPPER ────────────────────────────────────
async function request(path, options = {}) {
  const token = getToken()
  const headers = { 'Content-Type': 'application/json', ...options.headers }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${API_URL}${path}`, { ...options, headers })
  const data = await res.json()

  if (!res.ok) {
    const err = new Error(data.error || 'Error del servidor')
    err.status = res.status
    throw err
  }

  return data
}

// ─── API METHODS ──────────────────────────────────────
export const api = {
  get:  (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
  put:  (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) }),
}
