// Garmin HTTP client. Garmin does not allow browser origins (no CORS), so every call goes through
// a same-origin reverse proxy (Vite dev server locally, the Cloudflare worker in production).
// HTTP only: parsing lives in endpoints.js / data/normalize.js, orchestration in engine.js.
const ENV = import.meta.env
const API = ENV?.DEV ? '/garmin-api' : (ENV?.VITE_GARMIN_API_BASE || '/garmin-api')
const TOKEN_KEY = 'garmin_dashboard_session'
const FALLBACK_TTL = 23 * 60 * 60 * 1000
const SKEW = 30 * 1000

/** kind: 'auth' | 'not-found' | 'rate-limit' | 'server' | 'network' | 'aborted' | 'session' | 'bad-request' */
export class GarminError extends Error {
  constructor(message, { status = null, path = null, retryAfterMs = null, kind = 'server' } = {}) {
    super(message)
    this.name = 'GarminError'
    Object.assign(this, { status, path, retryAfterMs, kind })
  }
}

const store = () => { try { return globalThis.localStorage || null } catch { return null } }

export function session() { try { return JSON.parse(store()?.getItem(TOKEN_KEY)) } catch { return null } }
export function isSessionValid() { const s = session(); return !!(s?.accessToken && Number(s.expiresAt) > Date.now() + SKEW) }
export function signOut() { try { store()?.removeItem(TOKEN_KEY) } catch { /* ignore */ } }

/** `exp` (seconds) from a JWT, as epoch ms, or null if the token is not a decodable JWT. */
export function jwtExpiry(token) {
  try {
    const part = String(token).split('.')[1]
    if (!part) return null
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=')
    const json = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('utf8')
    const exp = Number(JSON.parse(json).exp)
    return Number.isFinite(exp) && exp > 0 ? exp * 1000 : null
  } catch { return null }
}

export function parseRetryAfter(value, now = Date.now()) {
  if (value == null || value === '') return null
  const secs = Number(value)
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000)
  const at = Date.parse(value)
  return Number.isNaN(at) ? null : Math.max(0, at - now)
}

export function kindForStatus(status) {
  if (status === 401 || status === 403) return 'auth'
  if (status === 404) return 'not-found'
  if (status === 429) return 'rate-limit'
  if (status >= 500) return 'server'
  return 'bad-request'
}

const messageFor = (status, path) => ({
  401: 'Garmin rejected the session (401)',
  403: 'Not allowed for this Garmin API key (403)',
  404: 'Garmin does not offer this endpoint (404)',
  429: 'Garmin rate limit (429)',
}[status] || (status >= 500 ? `Garmin server error (${status})` : `Garmin rejected the request (${status}) for ${path}`))

/** Sleep that rejects with an 'aborted' GarminError as soon as the signal fires. */
export function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new GarminError('Cancelled', { kind: 'aborted' }))
    const onAbort = () => { clearTimeout(timer); reject(new GarminError('Cancelled', { kind: 'aborted' })) }
    const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve() }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function buildUrl(path, params) {
  const url = API.startsWith('/') ? new URL(API + path, globalThis.location?.origin || 'http://localhost') : new URL(API + path)
  for (const [k, v] of Object.entries(params || {})) if (v !== '' && v != null) url.searchParams.set(k, v)
  return url
}

/** Exchange the Personal API key for a short-lived token. The key itself is never stored. */
export async function tokenFromApiKey(apiKey, { signal } = {}) {
  const path = '/personalapitoken-service/personal-api/personal-api-key/token'
  let res
  try { res = await fetch(buildUrl(path), { method: 'POST', headers: { Authorization: `ApiKey ${String(apiKey || '').trim()}` }, signal }) }
  catch (e) { throw new GarminError(e?.name === 'AbortError' ? 'Cancelled' : 'Unable to reach Garmin. The app needs its Garmin proxy to be reachable.', { path, kind: e?.name === 'AbortError' ? 'aborted' : 'network' }) }
  if (!res.ok) throw new GarminError(`Garmin token request failed (${res.status}). Check the key and proxy connection.`, { status: res.status, path, kind: kindForStatus(res.status) })
  // Garmin may return either a JSON object or the raw JWT text.
  const raw = await res.text()
  let data
  try { data = JSON.parse(raw) } catch { data = raw.trim() }
  const value = typeof data === 'string' ? data : (data?.access_token || data?.accessToken || data?.token)
  if (!value) throw new GarminError('Garmin returned no access token', { path, kind: 'server' })
  const saved = { accessToken: value, expiresAt: jwtExpiry(value) || Date.now() + FALLBACK_TTL }
  store()?.setItem(TOKEN_KEY, JSON.stringify(saved))
  return { expiresAt: saved.expiresAt }
}

/** GET a Garmin path. Returns parsed JSON, or null for 204 / empty bodies. Throws GarminError. */
export async function request(path, params = {}, { signal } = {}) {
  if (signal?.aborted) throw new GarminError('Cancelled', { path, kind: 'aborted' })
  const s = session()
  if (!s?.accessToken || !(Number(s.expiresAt) > Date.now())) throw new GarminError('Garmin session expired — reconnect to sync', { path, kind: 'session' })
  let res
  try { res = await fetch(buildUrl(path, params), { headers: { Authorization: `Bearer ${s.accessToken}` }, signal }) }
  catch (e) {
    if (e?.name === 'AbortError' || signal?.aborted) throw new GarminError('Cancelled', { path, kind: 'aborted' })
    throw new GarminError('Could not reach Garmin. Check your connection and the Garmin proxy.', { path, kind: 'network' })
  }
  if (!res.ok) {
    const status = res.status
    throw new GarminError(messageFor(status, path), { status, path, kind: kindForStatus(status), retryAfterMs: parseRetryAfter(res.headers.get('retry-after')) })
  }
  if (res.status === 204) return null
  let text
  try { text = await res.text() } catch (e) {
    if (e?.name === 'AbortError' || signal?.aborted) throw new GarminError('Cancelled', { path, kind: 'aborted' })
    throw new GarminError('Connection dropped while reading Garmin’s response', { path, kind: 'network' })
  }
  if (!text.trim()) return null
  try { return JSON.parse(text) } catch { throw new GarminError('Garmin sent a response that is not JSON', { status: res.status, path, kind: 'server' }) }
}

/** Keep the token but flag it unusable (Garmin rejected it), so the UI shows "expired". */
export function markExpired() {
  const s = session()
  if (s) try { store()?.setItem(TOKEN_KEY, JSON.stringify({ ...s, expiresAt: 0 })) } catch { /* ignore */ }
}
