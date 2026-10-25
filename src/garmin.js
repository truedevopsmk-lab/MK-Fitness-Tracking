// Garmin does not expose the Personal API to browser origins via CORS.
// Vite forwards this same-origin path during local development. Production
// hosting needs an equivalent server-side reverse proxy.
const API = import.meta.env.DEV ? '/garmin-api' : (import.meta.env.VITE_GARMIN_API_BASE || '/garmin-api')
const TOKEN_KEY = 'garmin_dashboard_session'
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))

export function session() { try { return JSON.parse(localStorage.getItem(TOKEN_KEY)) } catch { return null } }
export function signOut() { localStorage.removeItem(TOKEN_KEY) }

export async function tokenFromApiKey(apiKey) {
  const res = await fetch(`${API}/personalapitoken-service/personal-api/personal-api-key/token`, {
    method: 'POST', headers: { Authorization: `ApiKey ${apiKey.trim()}` }
  })
  if (!res.ok) throw new Error(`Garmin token request failed (${res.status}). Check the key and proxy connection.`)
  // Garmin may return either a JSON object or the raw JWT text.
  const raw = await res.text()
  let data
  try { data = JSON.parse(raw) } catch { data = raw.trim() }
  const value = typeof data === 'string' ? data : (data.access_token || data.accessToken || data.token)
  if (!value) throw new Error('Garmin returned no access token')
  const saved = { accessToken: value, expiresAt: Date.now() + 23 * 60 * 60 * 1000 }
  localStorage.setItem(TOKEN_KEY, JSON.stringify(saved))
  return saved
}

async function get(path, params = {}) {
  const s = session()
  if (!s?.accessToken || s.expiresAt < Date.now()) throw new Error('Session expired — enter your Personal API key again')
  const url = API.startsWith('/')
    ? new URL(API + path, window.location.origin)
    : new URL(API + path)
  Object.entries(params).forEach(([k, v]) => v !== '' && v != null && url.searchParams.set(k, v))
  let res
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try { res = await fetch(url, { headers: { Authorization: `Bearer ${s.accessToken}` } }) }
    catch { throw new Error('Unable to reach Garmin. The PWA needs its same-origin Garmin proxy running.') }
    if (res.ok) return res.json()
    const retryable = res.status === 429 || res.status >= 500
    if (!retryable || attempt === 2) throw new Error(`${path} returned ${res.status}${res.status === 429 ? ' (Garmin rate limit)' : ''}`)
    const retryAfter = Number(res.headers.get('retry-after'))
    await pause(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 750 * (attempt + 1))
  }
}

export const fetchSettings = () => get('/userprofile-service/userprofile/settings')
export const fetchActivities = (limit = 100, start = 0) => get('/activitylist-service/activities/search/activities', { limit, start })
export const fetchActivity = id => get(`/activity-service/activity/${id}`)
export const fetchDailySteps = (from, to) => get(`/usersummary-service/stats/steps/daily/${from}/${to}`)
export const fetchDailyStress = (from, to) => get(`/usersummary-service/stats/stress/daily/${from}/${to}`)
export const fetchWeight = (from, to) => get(`/weight-service/weight/range/${from}/${to}`)
export const fetchHrv = (from, to) => get(`/hrv-service/hrv/daily/${from}/${to}`)
export const fetchBodyBattery = (from, to) => get('/wellness-service/wellness/bodyBattery/reports/daily', { startDate: from, endDate: to })
export const fetchSleep = date => get('/sleep-service/sleep/dailySleep', { date })
export const fetchSleepSummaries = (from, to) => get('/sleep-service/sleep/dailySleepSummariesByDate', { startDate: from, endDate: to })

export async function fetchAllActivities(onProgress) {
  const all = []
  for (let start = 0; start < 5000; start += 100) {
    const batch = await fetchActivities(100, start)
    const items = Array.isArray(batch) ? batch : (batch.activities || batch.summarizedActivities || [])
    all.push(...items); onProgress?.(all.length)
    if (items.length < 100) break
  }
  return all
}

export async function fetchRangeInChunks(fetcher, from, to, chunkDays = 27) {
  const chunks = []
  let end = new Date(`${to}T00:00:00`)
  const first = new Date(`${from}T00:00:00`)
  while (end >= first) {
    const start = new Date(end)
    start.setDate(start.getDate() - chunkDays + 1)
    if (start < first) start.setTime(first.getTime())
    chunks.push([isoDate(start), isoDate(end)])
    end.setDate(start.getDate() - 1)
  }
  const results = []
  for (const [start, finish] of chunks) results.push(await fetcher(start, finish).catch(() => []))
  return results.flatMap(result => Array.isArray(result) ? result : [])
}

export const fetchDailyStepsRange = (from, to) => fetchRangeInChunks(fetchDailySteps, from, to)
export const fetchDailyStressRange = (from, to) => fetchRangeInChunks(fetchDailyStress, from, to)

function sleepItems(value) {
  if (Array.isArray(value)) return value
  if (Array.isArray(value?.sleep)) return value.sleep
  if (Array.isArray(value?.dailySleepSummaries)) return value.dailySleepSummaries
  if (Array.isArray(value?.dailySleepDTOList)) return value.dailySleepDTOList
  return value ? [value] : []
}

export async function fetchSleepDays(from, to) {
  const summaries = await fetchSleepSummaries(from, to).catch(() => null)
  const summaryItems = sleepItems(summaries)
  if (summaryItems.length) return summaryItems
  const dates = []
  for (let cursor = new Date(`${from}T00:00:00`); cursor <= new Date(`${to}T00:00:00`); cursor.setDate(cursor.getDate() + 1)) dates.push(isoDate(cursor))
  const results = []
  for (const date of dates) results.push(await fetchSleep(date).catch(() => null))
  return results.flatMap(sleepItems)
}

export const isoDate = date => date.toISOString().slice(0, 10)
