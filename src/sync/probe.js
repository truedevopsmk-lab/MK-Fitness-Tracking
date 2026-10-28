// Garmin capability check: calls candidate endpoints once each and keeps only HTTP status + field names/types.
// Never keep values, names or IDs: ctx values stay in memory and must not reach results, notes, shapes or errors.
import { addDays, today } from '../lib/dates.js'
import { GarminError, markExpired, request, sleep } from './garmin.js'

export const PROBE_GROUPS = ['In the app', 'Account', 'Sleep', 'Recovery', 'Training', 'Activity detail']

const app = (id, label, url, more = {}) => ({ id: `app.${id}`, group: 'In the app', label, unlocks: 'Already synced', url, ...more })
const names = json => (Array.isArray(json?.metricDescriptors) ? json.metricDescriptors.map(d => d?.key).filter(k => typeof k === 'string') : [])

export const PROBES = [
  app('steps', 'Daily steps', '/usersummary-service/stats/steps/daily/{weekAgo}/{date}', { session: true }),
  app('sleep', 'Sleep summaries', '/sleep-service/sleep/dailySleepSummariesByDate?startDate={weekAgo}&endDate={date}', { capture: json => ({ profileId: (Array.isArray(json) ? json[0] : json)?.userProfilePK }) }),
  app('sleepDay', 'Sleep (one night)', '/sleep-service/sleep/dailySleep?date={date}'),
  app('hrv', 'HRV', '/hrv-service/hrv/daily/{weekAgo}/{date}', { capture: json => ({ profileId: json?.userProfilePk }) }),
  app('stress', 'Stress', '/usersummary-service/stats/stress/daily/{weekAgo}/{date}'),
  app('bodyBattery', 'Body Battery', '/wellness-service/wellness/bodyBattery/reports/daily?startDate={weekAgo}&endDate={date}'),
  app('weight', 'Weight', '/weight-service/weight/range/{monthAgo}/{date}'),
  app('profile', 'Profile settings', '/userprofile-service/userprofile/settings', { capture: json => ({ displayName: json?.displayName }) }),
  app('activities', 'Activities', '/activitylist-service/activities/search/activities?start=0&limit=1', { capture: json => ({ activityId: Array.isArray(json) ? json[0]?.activityId : null }) }),
  app('userSummary', 'Daily summary', '/usersummary-service/usersummary/daily?calendarDate={date}'),
  app('readiness', 'Training readiness', '/metrics-service/metrics/trainingreadiness/{date}'),
  app('intensity', 'Intensity minutes', '/usersummary-service/stats/im/daily/{weekAgo}/{date}'),
  app('heartRate', 'Daily heart rate', '/wellness-service/wellness/dailyHeartRate?date={date}'),

  { id: 'socialProfile', group: 'Account', label: 'Garmin profile', unlocks: 'Your display name, needed by some endpoints', url: '/userprofile-service/socialProfile', capture: json => ({ displayName: json?.displayName, profileId: json?.profileId ?? json?.id }) },
  { id: 'userSettings', group: 'Account', label: 'User settings', unlocks: 'Sleep need, VO₂ max, heart-rate zones', url: '/userprofile-service/userprofile/user-settings', capture: json => ({ profileId: json?.id }) },
  { id: 'lastDevice', group: 'Account', label: 'Last used device', unlocks: 'Which watch features apply', url: '/device-service/deviceservice/mylastused', capture: json => ({ profileId: json?.userProfileNumber }) },

  { id: 'sleepData', group: 'Sleep', label: 'Sleep detail', unlocks: 'Sleep sub-scores, sleep need, overnight HR/HRV/SpO₂', url: '/wellness-service/wellness/dailySleepData/{displayName}?date={date}&nonSleepBufferMinutes=60' },
  { id: 'sleepDataAlt', group: 'Sleep', label: 'Sleep detail (alternative)', unlocks: 'Same, via the sleep service', url: '/sleep-service/sleep/dailySleepData?date={date}&nonSleepBufferMinutes=60' },

  { id: 'hrvNight', group: 'Recovery', label: 'Overnight HRV', unlocks: 'HRV readings through the night', url: '/hrv-service/hrv/{date}' },
  { id: 'rhr', group: 'Recovery', label: 'Resting heart rate', unlocks: 'Resting HR trend', url: '/userstats-service/wellness/daily/{displayName}?fromDate={weekAgo}&untilDate={date}&metricId=60' },
  { id: 'respiration', group: 'Recovery', label: 'Breathing rate', unlocks: 'Respiration trend for the health monitor', url: '/wellness-service/wellness/daily/respiration/{date}' },
  { id: 'spo2', group: 'Recovery', label: 'Blood oxygen', unlocks: 'SpO₂ trend for the health monitor', url: '/wellness-service/wellness/daily/spo2/{date}' },
  { id: 'stressDay', group: 'Recovery', label: 'Stress timeline', unlocks: 'Stress through the day', url: '/wellness-service/wellness/dailyStress/{date}' },
  { id: 'bbEvents', group: 'Recovery', label: 'Body Battery events', unlocks: 'Sleep, naps and activities on a day timeline', url: '/wellness-service/wellness/bodyBattery/events/{date}' },
  { id: 'hydration', group: 'Recovery', label: 'Hydration', unlocks: 'Water intake logged in Garmin', url: '/usersummary-service/usersummary/hydration/daily/{date}' },

  { id: 'trainingStatus', group: 'Training', label: 'Training status', unlocks: 'Training status, load focus, acute load', url: '/metrics-service/metrics/trainingstatus/aggregated/{date}' },
  { id: 'vo2max', group: 'Training', label: 'VO₂ max', unlocks: 'VO₂ max trend', url: '/metrics-service/metrics/maxmet/daily/{monthAgo}/{date}' },
  { id: 'racePredictions', group: 'Training', label: 'Race predictions', unlocks: '5K / 10K / half / marathon predictions', url: '/metrics-service/metrics/racepredictions/latest/{displayName}' },
  { id: 'enduranceScore', group: 'Training', label: 'Endurance score', unlocks: 'How well you sustain long efforts', url: '/metrics-service/metrics/endurancescore?calendarDate={date}' },
  { id: 'hillScore', group: 'Training', label: 'Hill score', unlocks: 'Climbing strength and endurance', url: '/metrics-service/metrics/hillscore?calendarDate={date}' },
  { id: 'fitnessAge', group: 'Training', label: 'Fitness age', unlocks: 'Fitness compared with your age', url: '/fitnessage-service/fitnessage/{date}' },
  { id: 'personalRecords', group: 'Training', label: 'Personal records', unlocks: 'Personal bests', url: '/personalrecord-service/personalrecord/prs/{displayName}' },
  { id: 'gear', group: 'Training', label: 'Gear', unlocks: 'Shoe and bike mileage', url: '/gear-service/gear/filterGear?userProfilePk={profileId}' },

  { id: 'activity', group: 'Activity detail', label: 'Activity summary', unlocks: 'Full activity stats', url: '/activity-service/activity/{activityId}' },
  { id: 'splits', group: 'Activity detail', label: 'Splits', unlocks: 'Per-lap pace and heart rate', url: '/activity-service/activity/{activityId}/splits' },
  { id: 'details', group: 'Activity detail', label: 'Charts and route', unlocks: 'Pace/HR charts and route map', url: '/activity-service/activity/{activityId}/details?maxChartSize=100&maxPolylineSize=100', extra: names },
  { id: 'hrZones', group: 'Activity detail', label: 'Heart-rate zones', unlocks: 'Time in each HR zone', url: '/activity-service/activity/{activityId}/hrTimeInZones' },
  { id: 'exerciseSets', group: 'Activity detail', label: 'Strength sets', unlocks: 'Sets, reps and weights', url: '/activity-service/activity/{activityId}/exerciseSets' },
]

export const NEEDS = {
  displayName: 'Needs your Garmin display name — run a sync first',
  profileId: 'Needs your Garmin profile number',
  activityId: 'Needs an activity — sync activities first',
}

export function probeContext({ displayName, activityId } = {}, day = today()) {
  return { date: day, weekAgo: addDays(day, -6), monthAgo: addDays(day, -29), displayName: displayName || null, profileId: null, activityId: activityId || null }
}

const empty = v => v == null || v === ''
const placeholders = template => [...String(template).matchAll(/\{(\w+)\}/g)].map(m => m[1])

export function missingFor(template, ctx) {
  return placeholders(template).find(name => empty(ctx?.[name])) || null
}

export function fill(template, ctx) {
  if (missingFor(template, ctx)) return null
  const url = String(template).replace(/\{(\w+)\}/g, (_, name) => encodeURIComponent(String(ctx[name])))
  const i = url.indexOf('?')
  if (i < 0) return { path: url, params: {} }
  return { path: url.slice(0, i), params: Object.fromEntries(new URLSearchParams(url.slice(i + 1))) }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function redactKey(key) {
  const k = String(key)
  if (/^\d{4}-\d{2}-\d{2}/.test(k)) return '<date>'
  if (/^\d+$/.test(k)) return '<n>'
  if (UUID.test(k)) return '<id>'
  if (k.includes('@')) return '<email>'
  if (k.length > 48) return '<key>'
  return k
}

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v)
const MAX_KEYS = 120, MAX_DEPTH = 6, MAX_LEN = 6000

// Collapse object samples into one key -> value map; the first non-null value wins per key.
function merge(samples) {
  const out = new Map()
  for (const s of samples) for (const [k, v] of Object.entries(s)) {
    const key = redactKey(k)
    if (!out.has(key) || (out.get(key) == null && v != null)) out.set(key, v)
  }
  return out
}

function renderMap(map, depth) {
  if (!map.size) return '{}'
  if (depth >= MAX_DEPTH) return `{…${map.size} keys}`
  const entries = [...map]
  const shown = entries.slice(0, MAX_KEYS).map(([k, v]) => `${k}:${render(v, depth + 1)}`)
  return `{${shown.join(',')}${entries.length > MAX_KEYS ? `,…+${entries.length - MAX_KEYS} more` : ''}}`
}

function render(v, depth) {
  if (v == null) return 'null'
  const t = typeof v
  if (t === 'number') return 'num'
  if (t === 'string') return 'str'
  if (t === 'boolean') return 'bool'
  if (Array.isArray(v)) {
    if (!v.length) return '[]'
    const objs = v.filter(isObj).slice(0, 5)
    const inner = objs.length ? renderMap(merge(objs), depth) : render(v.find(x => x != null) ?? null, depth)
    return `[${v.length}×${inner}]`
  }
  if (t === 'object') return renderMap(merge([v]), depth)
  return '?'
}

/** Compact structure string. Never includes values. */
export function shapeOf(value, depth = 0) {
  let s
  try { s = render(value, depth) } catch { s = '?' }
  return depth === 0 && s.length > MAX_LEN ? `${s.slice(0, MAX_LEN)}…(truncated)` : s
}

const META = new Set(['calendarDate', 'date', 'userProfilePK', 'userProfilePk', 'userProfileId', 'userId', 'id', 'uuid', 'startTimestampGMT', 'endTimestampGMT', 'startTimestampLocal', 'endTimestampLocal'])

export function hasData(json, depth = 0) {
  if (json == null || depth > 12) return false
  if (Array.isArray(json)) return json.some(x => hasData(x, depth + 1))
  if (typeof json === 'object') return Object.entries(json).some(([k, v]) => !META.has(k) && hasData(v, depth + 1))
  if (typeof json === 'string') return json !== ''
  return true
}

export function statusForError(err) {
  if ([401, 403, 404].includes(err?.status)) return 'unavailable'
  if (err?.status === 429 || err?.kind === 'rate-limit') return 'limited'
  return 'error'
}

// Fixed copy per error: GarminError messages can embed the filled-in path (display name, activity ID).
const errorNote = (status, err) => status === 'limited' ? 'Garmin rate limit — try again later'
  : status === 'unavailable' ? `Not offered to your API key (${err.status})`
    : err?.kind === 'network' ? 'Could not reach Garmin'
      : err?.status >= 500 ? `Garmin server error (${err.status})`
        : err?.status ? `Garmin rejected the request (${err.status})`
          : err?.kind === 'server' ? 'Garmin sent a response that is not JSON' : 'Unexpected error'

const SESSION_ERROR = 'Garmin rejected your session. Reconnect above, then run the check again.'

export async function runProbes({ probes = PROBES, ctx, signal, deps = {}, onResult = () => {}, onWait = () => {}, gapMs = 400, timeoutMs = 20000 }) {
  const d = { request, sleep, markExpired, now: () => Date.now(), ...deps }
  const results = []
  let requested = false, limitedRun = 0

  const call = async (path, params) => {
    const child = new AbortController()
    const onAbort = () => child.abort()
    signal?.addEventListener('abort', onAbort, { once: true })
    const timer = setTimeout(() => child.abort(), timeoutMs)
    try { return await d.request(path, params, { signal: child.signal }) }
    finally { clearTimeout(timer); signal?.removeEventListener('abort', onAbort) }
  }
  const push = r => { results.push(r); onResult(r) }
  const stop = extra => ({ results, error: null, cancelled: false, ...extra })

  for (const probe of probes) {
    if (signal?.aborted) return stop({ cancelled: true })
    const missing = missingFor(probe.url, ctx)
    if (missing) { push({ id: probe.id, status: 'skipped', http: null, note: NEEDS[missing] || 'Missing information' }); continue }
    try {
      if (requested) await d.sleep(gapMs, signal)
    } catch (e) { if (signal?.aborted || e?.kind === 'aborted') return stop({ cancelled: true }); throw e }
    requested = true
    const { path, params } = fill(probe.url, ctx)
    const t0 = d.now()
    let json
    try {
      try { json = await call(path, params) }
      catch (e) {
        if (e?.status !== 429) throw e
        const wait = Math.min(e.retryAfterMs ?? 5000, 60000)
        onWait(Math.ceil(wait / 1000))
        await d.sleep(wait, signal)
        json = await call(path, params)
      }
    } catch (err) {
      if (signal?.aborted) return stop({ cancelled: true })
      if (err?.kind === 'aborted' && err instanceof GarminError) { push({ id: probe.id, status: 'error', http: null, ms: d.now() - t0, note: 'Timed out' }); limitedRun = 0; continue }
      if (err?.kind === 'session') return stop({ error: SESSION_ERROR })
      const status = err instanceof GarminError ? statusForError(err) : 'error'
      const http = err?.status ?? null
      const note = err instanceof GarminError ? errorNote(status, err) : 'Unexpected error'
      push({ id: probe.id, status, http, ms: d.now() - t0, note })
      if (probe.session && http === 401) { d.markExpired(); return stop({ error: SESSION_ERROR }) }
      limitedRun = status === 'limited' ? limitedRun + 1 : 0
      if (limitedRun >= 3) return stop({ error: 'Garmin is rate limiting — try again in a few minutes' })
      continue
    }
    limitedRun = 0
    const ok = hasData(json)
    push({ id: probe.id, status: ok ? 'ok' : 'empty', http: 200, ms: d.now() - t0, shape: shapeOf(json), extra: (() => { try { return probe.extra?.(json) || null } catch { return null } })(), note: ok ? null : 'Garmin answered with no data for this date' })
    try {
      for (const [k, v] of Object.entries(probe.capture?.(json) || {})) {
        if (ctx[k] != null) continue
        if ((typeof v === 'string' && v) || (typeof v === 'number' && Number.isFinite(v))) ctx[k] = String(v)
      }
    } catch { /* ignore */ }
  }
  return stop({})
}

const SYMBOL = { ok: '✓', empty: '·', unavailable: '✗', error: '!', limited: '!', skipped: '–' }

export function buildReport(results, { probes = PROBES, date = today() } = {}) {
  const byId = new Map(results.map(r => [r.id, r]))
  const count = (...s) => results.filter(r => s.includes(r.status)).length
  const lines = [
    `MK Fitness · Garmin capability check · ${date}`,
    `${results.length} checked · ${count('ok')} available · ${count('empty')} no data · ${count('unavailable')} not available · ${count('error', 'limited')} errors/limited · ${count('skipped')} skipped`,
    'Field names and types only. No values, names or IDs.',
  ]
  for (const group of PROBE_GROUPS) {
    const rows = probes.filter(p => p.group === group && byId.has(p.id))
    if (!rows.length) continue
    lines.push('', `## ${group}`)
    for (const p of rows) {
      const r = byId.get(p.id)
      const head = r.status === 'skipped' ? `skipped (${r.note})` : r.status === 'empty' ? `${r.http} empty` : r.status === 'limited' ? '429 rate limited' : r.http ?? 'error'
      lines.push(`${SYMBOL[r.status] || '!'} ${p.id} ${head} ${p.url}`)
      if (r.shape) lines.push(`  ${r.shape}`)
      if (r.extra?.length) lines.push(`  metrics: ${r.extra.join(', ')}`)
    }
  }
  return lines.join('\n')
}

let state = { running: false, done: 0, total: 0, results: {}, waitUntil: null, error: null, cancelled: false, finishedAt: null }
let controller = null
const listeners = new Set()
const set = patch => { state = { ...state, ...patch }; listeners.forEach(fn => fn()) }

export const probeState = () => state
export const subscribeProbe = fn => { listeners.add(fn); return () => { listeners.delete(fn) } }

export async function startProbe(seed = {}) {
  if (state.running) return
  controller = new AbortController()
  const ctl = controller
  state = { running: true, done: 0, total: PROBES.length, results: {}, waitUntil: null, error: null, cancelled: false, finishedAt: null }
  listeners.forEach(fn => fn())
  let out
  try {
    out = await runProbes({
      ctx: probeContext(seed), signal: ctl.signal,
      onResult: r => set({ results: { ...state.results, [r.id]: r }, done: state.done + 1, waitUntil: null }),
      onWait: secs => set({ waitUntil: Date.now() + secs * 1000 }),
    })
  } catch { out = { error: 'The check stopped unexpectedly.', cancelled: false } }
  set({ running: false, waitUntil: null, error: out.error || null, cancelled: !!out.cancelled, finishedAt: Date.now() })
}

export function cancelProbe() { controller?.abort() }
