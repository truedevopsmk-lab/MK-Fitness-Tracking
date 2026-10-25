// Sync orchestrator: plans the request list, runs it sequentially, writes every chunk to the
// store as it arrives (merge only — never replaces), and records per-endpoint status.
import { addDays, chunkRange, dayOf, eachDay, toDay } from '../lib/dates.js'
import { getPrefs } from '../lib/prefs.js'
import { actions, getState } from '../state/store.js'
import { trainingByDay } from '../data/normalize.js'
import { ENDPOINTS, ENDPOINT_BY_ID } from './endpoints.js'
import { GarminError, isSessionValid, markExpired, request, sleep } from './garmin.js'

export const GAP_MS = 250
export const SLOW_GAP_MS = 1000
export const AUTO_SYNC_MIN_AGE_MS = 30 * 60 * 1000
const FAILURE_BREAKER = 4
const PER_DAY_FIRST_RUN = 14
const ACTIVE_FAILED = ['failed', 'partial', 'cancelled']

// ---- pure helpers (unit-tested in Node) ---------------------------------------------------

/** Wait before retry number `attempt` (1-based): Retry-After if given, else 2 s doubling to a 60 s cap. */
export function backoffMs(attempt, retryAfterMs = null) {
  if (Number.isFinite(retryAfterMs) && retryAfterMs > 0) return Math.min(120000, Math.max(1000, Math.round(retryAfterMs)))
  return Math.min(60000, 2000 * 2 ** Math.max(0, attempt - 1))
}

/** Total attempts allowed per request for an error kind (429: 4, 5xx: 1 + 3 retries, network: 1 + 2). */
export function maxAttemptsFor(kind) { return kind === 'rate-limit' || kind === 'server' ? 4 : kind === 'network' ? 3 : 1 }

const asDay = v => v instanceof Date ? toDay(v) : v
const dedupe = tasks => { const seen = new Set(); return tasks.filter(t => !seen.has(t.key) && seen.add(t.key)) }
const taskKey = (id, a, b = a) => `${id}:${a}:${b}`

/** Window [from, to] for one endpoint. Full = configured depth; incremental = since last OK − 2 days, 3 ≤ days ≤ depth. */
export function windowFor(ep, mode, status, prefs, asOf) {
  const depth = Math.max(3, (ep.kind === 'perDay' ? prefs.perDayDays : prefs.historyDays) || 90)
  const earliest = addDays(asOf, -(depth - 1))
  if (mode === 'full') return [earliest, asOf]
  const last = status?.lastOkAt ? dayOf(status.lastOkAt) : null
  let from = last ? addDays(last, -2) : ep.kind === 'perDay' ? addDays(asOf, -(Math.min(depth, PER_DAY_FIRST_RUN) - 1)) : earliest
  if (from > addDays(asOf, -2)) from = addDays(asOf, -2)
  if (from < earliest) from = earliest
  return [from, asOf]
}

const rank = ep => ({ single: 0, paged: 1, range: 2, perDay: 3 })[ep.kind] ?? 4

/** Pick which endpoints take part in a run. */
export function selectEndpoints(endpoints, mode, statuses = {}, ids = null) {
  return endpoints.filter(ep => {
    const st = statuses[ep.id]?.status
    if (ids) return ids.includes(ep.id)
    if (mode === 'retry') return ACTIVE_FAILED.includes(st)
    if (mode === 'incremental' && st === 'unavailable') return false
    return true
  }).sort((a, b) => rank(a) - rank(b))
}

/**
 * Build the ordered request list. Range/per-day tasks run newest → oldest so the most useful data lands first.
 * @param {object[]} endpoints registry entries
 * @param {'full'|'incremental'|'retry'} mode
 * @param {object} syncMeta (unused today; kept for the contract)
 * @param {object} prefs     { historyDays, perDayDays }
 * @param {string|Date} asOf today's day key
 * @param {Record<string, object>} statuses endpoints[id] from the store
 * @param {{ ids?: string[], knownActivities?: number }} opts
 */
export function planRequests(endpoints, mode, syncMeta, prefs, asOf, statuses = {}, opts = {}) {
  const today = asDay(asOf), tasks = []
  for (const ep of selectEndpoints(endpoints, mode, statuses, opts.ids || null)) {
    const st = statuses[ep.id] || {}
    const [from, to] = windowFor(ep, mode, st, prefs, today)
    const retryRanges = mode === 'retry' || opts.ids ? (st.failedRanges || []) : []
    const base = { id: ep.id, kind: ep.kind, label: ep.label }
    const pushRange = (a, b) => {
      if (ep.kind === 'perDay') for (const d of eachDay(a, b).reverse()) tasks.push({ ...base, key: taskKey(ep.id, d), date: d, from: d, to: d })
      else if (ep.kind === 'range') for (const [x, y] of chunkRange(a, b, ep.chunkDays || 27).reverse()) tasks.push({ ...base, key: taskKey(ep.id, x, y), from: x, to: y })
    }
    if (ep.kind === 'single') { tasks.push({ ...base, key: taskKey(ep.id, 'single') }); continue }
    if (ep.kind === 'paged') { tasks.push({ ...base, key: taskKey(ep.id, 'paged'), full: mode !== 'incremental', est: mode === 'incremental' ? 1 : Math.max(1, Math.ceil((opts.knownActivities || 0) / (ep.pageSize || 100)) + 1) }); continue }
    const useRetryOnly = retryRanges.length && (mode === 'retry' || (opts.ids && st.status === 'partial'))
    if (useRetryOnly) retryRanges.forEach(([a, b]) => pushRange(a, b))
    else {
      pushRange(from, to)
      // older failed ranges that fall before this window still get another go
      for (const [a, b] of st.failedRanges || []) if (b < from) pushRange(a, b)
    }
  }
  return dedupe(tasks)
}

/** Final EndpointStatus status from a run accumulator. */
export function outcomeStatus(acc) {
  if (acc.unavailable) return 'unavailable'
  if (acc.cancelled) return 'cancelled'
  if (acc.requests > 0 && acc.failedRequests >= acc.requests) return 'failed'
  if (acc.failedRequests > 0) return 'partial'
  if (acc.requests === 0) return 'idle'
  return acc.records > 0 ? 'ok' : 'empty'
}

export function mergeCoverage(a, b) {
  if (!a) return b || null
  if (!b) return a
  return { first: a.first < b.first ? a.first : b.first, last: a.last > b.last ? a.last : b.last }
}

export const coverageOfDays = days => {
  const keys = Object.keys(days || {}).filter(k => Object.keys(days[k] || {}).some(s => s !== 'date')).sort()
  return keys.length ? { first: keys[0], last: keys.at(-1) } : null
}

/** Overall result of a run from the endpoint statuses. */
export function overallResult(statuses, { cancelled = false, aborted = false } = {}) {
  if (cancelled) return 'cancelled'
  if (aborted) return 'failed'
  const list = Object.values(statuses)
  const bad = list.filter(s => s.status === 'failed' || s.status === 'partial')
  if (!bad.length) return 'ok'
  return list.some(s => s.status === 'ok' || s.status === 'empty' || s.status === 'partial') ? 'partial' : 'failed'
}

/** Throttled on the last *attempt* too, so an endpoint that keeps failing can't trigger a sync on every app open. */
export function shouldAutoSync({ prefs, valid, source, lastSuccessAt, lastAttemptAt, running }, now = Date.now()) {
  if (!prefs?.autoSync || !valid || source === 'demo' || running) return false
  const recent = Math.max(lastSuccessAt || 0, lastAttemptAt || 0)
  return !recent || now - recent > AUTO_SYNC_MIN_AGE_MS
}

const dayLabel = d => { const [y, m, dd] = d.split('-'); return `${Number(dd)} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m) - 1]} ${y}` }
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`

// ---- execution ----------------------------------------------------------------------------

const defaultDeps = () => ({ request, actions, getState, getPrefs, sleep, now: () => Date.now(), isSessionValid, markExpired })

const newAcc = prev => ({ okCount: 0, requests: 0, failedRequests: 0, records: 0, failedRanges: [], coverage: null, error: null, httpStatus: null, unavailable: false, cancelled: false, consecutiveFailures: 0, prev })

/** Run one request with retries/backoff. Throws the final GarminError. */
async function fetchWithRetry(ep, task, extra, ctx) {
  const { deps, signal } = ctx
  const params = extra.params ?? (ep.params ? ep.params(task.date || task.from, task.to) : {})
  const path = extra.path ?? (ep.kind === 'range' ? ep.path(task.from, task.to) : ep.path(task.date))
  for (let attempt = 1; ; attempt++) {
    try {
      const json = await deps.request(path, params, { signal })
      ctx.succeeded = true
      return json
    } catch (e) {
      const err = e instanceof GarminError ? e : new GarminError(e?.message || 'Request failed', { kind: signal?.aborted ? 'aborted' : 'network' })
      if (err.kind === 'aborted' || attempt >= maxAttemptsFor(err.kind)) throw err
      const wait = backoffMs(attempt, err.kind === 'rate-limit' ? err.retryAfterMs : null) / (err.kind === 'rate-limit' ? 1 : 2)
      if (err.kind === 'rate-limit') {
        ctx.gap = SLOW_GAP_MS
        deps.actions.setSync({ rateLimitedUntil: deps.now() + wait, message: 'Garmin asked us to slow down' })
        deps.actions.log('warn', `Rate limited on ${ep.label}; waiting ${Math.round(wait / 1000)} s (attempt ${attempt}/${maxAttemptsFor(err.kind)})`)
      } else deps.actions.log('warn', `${ep.label}: ${err.message}; retrying in ${Math.round(wait / 1000)} s`)
      await deps.sleep(wait, signal)
      deps.actions.setSync({ rateLimitedUntil: null, message: '' })
    }
  }
}

/** Write a normalised result to the store. Returns { days, activities } counts and touched day keys. */
async function apply(result, deps) {
  const out = { records: 0, touched: [] }
  if (result?.days && Object.keys(result.days).length) {
    await deps.actions.applyDays(result.days)
    out.records += Object.keys(result.days).length
    out.touched.push(...Object.keys(result.days))
  }
  if (result?.activities?.length) {
    await deps.actions.applyActivities(result.activities)
    out.records += result.activities.length
    // recompute from the FULL stored list so partial pages never undercount
    const affected = new Set(result.activities.map(a => a.day))
    const all = trainingByDay(deps.getState().activities.filter(a => affected.has(a.day)))
    await deps.actions.applyDays(Object.fromEntries([...affected].map(d => [d, { training: all[d] }]).filter(([, v]) => v.training)))
    out.touched.push(...affected)
  }
  if (result?.profile) { await deps.actions.setProfile(result.profile); out.records += 1 }
  return out
}

function recordOk(acc, applied) {
  acc.records += applied.records
  acc.okCount += 1
  acc.consecutiveFailures = 0
  for (const d of applied.touched) acc.coverage = mergeCoverage(acc.coverage, { first: d, last: d })
}

function recordFailure(acc, task, err) {
  acc.failedRequests += 1
  acc.consecutiveFailures += 1
  acc.error = err.message
  acc.httpStatus = err.status ?? acc.httpStatus
  if (task.from) acc.failedRanges.push([task.from, task.to || task.from])
}

const tick = (deps, n = 1) => deps.actions.setSync({ done: deps.getState().sync.done + n })
const grow = (deps, n = 1) => deps.actions.setSync({ total: deps.getState().sync.total + n })

async function runPaged(ep, task, acc, ctx) {
  const { deps, signal } = ctx
  const known = new Set(deps.getState().activities.map(a => a.id))
  const size = ep.pageSize || 100
  let planned = task.est || 1, pages = 0
  for (let start = 0; start < (ep.maxItems || 5000); start += size) {
    if (pages > 0) { await deps.sleep(ctx.gap, signal); if (pages >= planned) { grow(deps); planned += 1 } }
    deps.actions.setSync({ phase: `${ep.label} · page ${pages + 1}` })
    acc.requests += 1; pages += 1
    try {
      const json = await fetchWithRetry(ep, task, { params: { start, limit: size }, path: ep.path() }, ctx)
      const res = ep.normalize(json, {})
      recordOk(acc, await apply(res, deps))
      tick(deps)
      const items = res.activities || []
      const fresh = items.filter(a => !known.has(a.id)).length
      if (items.length < size) break
      if (!task.full && fresh === 0) break
    } catch (err) {
      tick(deps)
      if (err.kind === 'aborted') throw err
      if (isUnavailable(err, ctx, acc)) { acc.unavailable = true; acc.error = err.message; acc.httpStatus = err.status; break }
      if (isSessionFailure(err, ctx)) throw err
      recordFailure(acc, { from: null }, err)
      break
    }
  }
  if (task.est && pages < task.est) deps.actions.setSync({ total: Math.max(0, deps.getState().sync.total - (task.est - pages)) })
}

const isSessionFailure = (err, ctx) => err.kind === 'session' || (err.status === 401 && !ctx.succeeded && !ctx.ep?.experimental)
const isUnavailable = (err, ctx, acc) => [401, 403, 404].includes(err.status) && !isSessionFailure(err, ctx) && !(err.status === 404 && acc?.okCount > 0)

async function runFallback(ep, task, acc, ctx) {
  const { deps, signal } = ctx
  let misses = 0
  for (const date of eachDay(task.from, task.to).reverse()) {
    grow(deps)
    await deps.sleep(ctx.gap, signal)
    acc.requests += 1
    try {
      const res = ep.fallback.normalize(await fetchWithRetry(ep, task, { path: ep.fallback.path(), params: ep.fallback.params(date) }, ctx), { date })
      const applied = await apply(res, deps)
      tick(deps)
      recordOk(acc, applied)
      misses = applied.records ? 0 : misses + 1
      if (misses >= 3) break
    } catch (err) {
      tick(deps)
      if (err.kind === 'aborted' || isSessionFailure(err, ctx)) throw err
      if (!isUnavailable(err, ctx, acc) && err.status !== 404) recordFailure(acc, { from: date, to: date }, err)
      break
    }
  }
}

/**
 * Run a planned sync against injectable dependencies (the real ones by default).
 * Resolves with { result, endpoints } and never throws.
 */
export async function executeSync({ mode, ids = null }, { signal, deps = defaultDeps() } = {}) {
  const { actions: act } = deps
  const startedAt = deps.now()
  const prefs = deps.getPrefs(), s0 = deps.getState()
  const asOf = toDay(new Date(startedAt))
  const tasks = planRequests(ENDPOINTS, mode, s0.syncMeta, prefs, asOf, s0.endpoints, { ids, knownActivities: s0.activities.length })
  const plan = [...new Set(tasks.map(t => t.id))]
  const prior = Object.fromEntries(plan.map(id => [id, s0.endpoints[id]?.status || 'idle']))
  const total = tasks.reduce((n, t) => n + (t.kind === 'paged' ? t.est : 1), 0)
  const accs = {}, ctx = { deps, signal, gap: GAP_MS, succeeded: false }
  let abort = null, cancelled = false

  act.setSync({ running: true, mode, phase: 'Starting', done: 0, total, current: null, startedAt, rateLimitedUntil: null, message: '' })
  act.setSyncMeta({ lastAttemptAt: startedAt, lastError: null })
  plan.forEach(id => act.setEndpoint(id, { status: 'queued' }))
  act.log('info', `${mode === 'full' ? 'Full' : mode === 'retry' ? 'Retry' : 'Latest'} sync started · ${plural(total, 'request')} planned`)

  let first = true
  try {
    for (const id of plan) {
      const ep = ENDPOINT_BY_ID[id], mine = tasks.filter(t => t.id === id)
      const acc = accs[id] = newAcc(s0.endpoints[id])
      ctx.ep = ep
      act.setEndpoint(id, { status: 'running', error: null })
      for (let i = 0; i < mine.length; i++) {
        const task = mine[i]
        if (acc.unavailable) { tick(deps, mine.length - i); break }
        if (acc.consecutiveFailures >= FAILURE_BREAKER) {
          // give up on this endpoint for now; leave the rest to "Retry failed"
          for (const rest of mine.slice(i)) if (rest.from) acc.failedRanges.push([rest.from, rest.to || rest.from])
          tick(deps, mine.length - i)
          act.log('warn', `${ep.label}: stopping after ${FAILURE_BREAKER} failures in a row`)
          break
        }
        act.setSync({ current: id, phase: task.from && task.kind !== 'perDay' ? `${ep.label} · ${task.from} → ${task.to}` : task.date ? `${ep.label} · ${task.date}` : ep.label })
        if (!first) await deps.sleep(ctx.gap, signal)
        first = false
        if (task.kind === 'paged') { await runPaged(ep, task, acc, ctx); continue }
        acc.requests += 1
        try {
          const json = await fetchWithRetry(ep, task, {}, ctx)
          const res = ep.normalize(json, { date: task.date, from: task.from, to: task.to })
          const applied = await apply(res, deps)
          recordOk(acc, applied)
          tick(deps)
          if (ep.fallback && !applied.records && json != null) await runFallback(ep, task, acc, ctx)
        } catch (err) {
          tick(deps)
          if (err.kind === 'aborted') throw err
          if (isSessionFailure(err, ctx)) throw err
          if (err.status === 404 && acc.okCount > 0) continue // no data for that day
          if (isUnavailable(err, ctx, acc)) { acc.unavailable = true; acc.error = err.message; acc.httpStatus = err.status; continue }
          recordFailure(acc, task, err)
          act.log('error', `${ep.label}${task.from ? ` ${task.from}${task.to !== task.from ? ` → ${task.to}` : ''}` : ''}: ${err.message}`)
        }
      }
      finishEndpoint(id, ep, acc, deps)
    }
  } catch (err) {
    if (err.kind === 'aborted') cancelled = true
    else { abort = err; if (err.kind === 'session' || err.status === 401) deps.markExpired(); act.log('error', err.message) }
    for (const id of plan) {
      const st = deps.getState().endpoints[id]?.status
      if (st === 'running') { const acc = accs[id]; if (acc) acc.cancelled = true; act.setEndpoint(id, { status: cancelled ? 'cancelled' : 'failed', error: cancelled ? 'Cancelled' : err.message, httpStatus: err.status ?? null }) }
      else if (st === 'queued') act.setEndpoint(id, { status: prior[id] })
    }
  }

  const now = deps.now(), st = deps.getState()
  const result = overallResult(st.endpoints, { cancelled, aborted: !!abort })
  const cov = coverageOfDays(st.days)
  const meta = { lastResult: result, coverage: cov ?? st.syncMeta.coverage, lastError: abort ? abort.message : result === 'ok' || result === 'cancelled' ? null : 'Some data could not be fetched — see the endpoint list' }
  // A partial run still brought data up to date: it counts as a sync time. The header shows the
  // warning from lastResult; "Retry failed" picks up the failed ranges.
  if (result === 'ok' || result === 'partial') { meta.lastSuccessAt = now; if (mode === 'full') meta.lastFullAt = now }
  act.setSyncMeta(meta)
  act.resetSync()
  const secs = Math.round((now - startedAt) / 1000)
  act.log(result === 'ok' ? 'info' : 'warn', `Sync ${result === 'ok' ? 'finished' : result} in ${secs} s`)
  return { result, error: abort?.message || null, kind: abort?.kind || null, endpoints: deps.getState().endpoints }
}

function finishEndpoint(id, ep, acc, deps) {
  const status = outcomeStatus(acc), now = deps.now()
  const prev = acc.prev || {}
  const okRun = status === 'ok' || status === 'empty'
  deps.actions.setEndpoint(id, {
    status, lastAttemptAt: now, lastOkAt: okRun ? now : prev.lastOkAt ?? null,
    error: status === 'failed' || status === 'partial' || status === 'unavailable' ? acc.error : null,
    httpStatus: acc.httpStatus, requests: acc.requests, failedRequests: acc.failedRequests, records: acc.records,
    failedRanges: acc.failedRanges, coverage: mergeCoverage(prev.coverage, acc.coverage),
  })
  const cov = acc.coverage ? ` (${dayLabel(acc.coverage.first)} – ${dayLabel(acc.coverage.last)})` : ''
  if (status === 'ok') deps.actions.log('info', `${ep.label}: ${plural(acc.records, 'record')} written${cov}`)
  else if (status === 'empty') deps.actions.log('info', `${ep.label}: Garmin has no data for this yet`)
  else if (status === 'unavailable') deps.actions.log('info', `${ep.label}: not available for your Garmin API key (${acc.httpStatus})`)
  else if (status === 'partial') deps.actions.log('warn', `${ep.label}: ${acc.failedRequests} of ${acc.requests} requests failed`)
  else if (status === 'failed') deps.actions.log('error', `${ep.label}: ${acc.error}`)
}

// ---- public API ---------------------------------------------------------------------------

let current = null // { controller, promise }

export const isSyncRunning = () => !!current

function refuse(message, extra = {}) {
  actions.log('warn', message)
  actions.setSync({ message })
  return Promise.resolve({ result: 'refused', error: message, ...extra })
}

function launch(mode, ids = null) {
  if (current) return current.promise
  const st = getState()
  if (st.source === 'demo') return refuse('Sync is disabled in demo mode. Switch to your Garmin data to sync.')
  if (!isSessionValid()) return refuse('Garmin session expired — reconnect to sync.', { kind: 'session' })
  const controller = new AbortController()
  const promise = executeSync({ mode, ids }, { signal: controller.signal })
    .catch(e => { actions.log('error', `Sync crashed: ${e?.message || e}`); actions.resetSync(); return { result: 'failed', error: e?.message || String(e) } })
    .finally(() => { current = null })
  current = { controller, promise }
  return promise
}

/** @param {'full'|'incremental'} mode */
export const startSync = (mode = 'incremental') => launch(mode === 'full' ? 'full' : 'incremental')
export const retryFailed = () => launch('retry')
export const retryEndpoint = id => ENDPOINT_BY_ID[id] ? launch('retry', [id]) : Promise.resolve({ result: 'refused', error: `Unknown endpoint ${id}` })
export function cancelSync() { if (current) { actions.log('info', 'Cancelling sync…'); actions.setSync({ phase: 'Cancelling', message: 'Cancelling after the current request' }); current.controller.abort() } }

/** Incremental sync on app open when enabled, connected and the last success is older than 30 minutes. */
export function maybeAutoSync() {
  const st = getState()
  const ok = shouldAutoSync({ prefs: getPrefs(), valid: isSessionValid(), source: st.source, lastSuccessAt: st.syncMeta.lastSuccessAt, lastAttemptAt: st.syncMeta.lastAttemptAt, running: !!current })
  return ok ? launch('incremental') : null
}

/** Rough request count for the "Full sync" confirmation. */
export function estimateFullSync(prefs = getPrefs(), asOf = toDay(new Date()), knownActivities = getState().activities.length) {
  return planRequests(ENDPOINTS, 'full', {}, prefs, asOf, {}, { knownActivities }).reduce((n, t) => n + (t.kind === 'paged' ? t.est : 1), 0)
}
