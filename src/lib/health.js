// Health monitor: overnight vitals against your own normal range. Pure.
import { addDays, eachDay } from './dates.js'
import { METRICS, valueOf } from './metrics.js'
import { mean, stdev } from './stats.js'
import { latestValue } from '../data/select.js'
import { fmtNumber } from './format.js'

export const VITALS = ['restingHr', 'hrv', 'respiration', 'spo2']
export const RANGE_DAYS = 30, MIN_NIGHTS = 14
export const PRECISION = { restingHr: 0, hrv: 0, respiration: 1, spo2: 0 }
// Minimum half-width so a very steady metric doesn't flag every 1-unit wobble
const MIN_HALF = { restingHr: 1, hrv: 2, respiration: 0.3, spo2: 1 }
const roundTo = (v, p) => Math.round(v * 10 ** p) / 10 ** p
const NAMES = { restingHr: 'resting HR', hrv: 'HRV', respiration: 'breathing rate', spo2: 'blood oxygen' }
const cap = s => s.charAt(0).toUpperCase() + s.slice(1)

/** Range for one night: Garmin's balanced range for HRV when reported (unless a status day falls in its window and our own range has enough nights), else mean ± 1 SD of the previous 30 nights (needs 14). */
export function normalRange(days, key, date, { exclude } = {}) {
  const h = days[date]?.hrv
  const garmin = key === 'hrv' && typeof h?.baselineLow === 'number' && typeof h?.baselineHigh === 'number'
  const values = []
  let skipped = false
  for (let i = 1; i <= RANGE_DAYS; i += 1) {
    const d = addDays(date, -i)
    if (exclude?.has(d)) { skipped = true; continue }
    const v = valueOf(key, days[d]); if (v != null) values.push(v)
  }
  const n = values.length
  if (garmin && !(skipped && n >= MIN_NIGHTS)) return { low: h.baselineLow, high: h.baselineHigh, avg: null, n: null, source: 'garmin' }
  if (n < MIN_NIGHTS) return { low: null, high: null, avg: null, n, source: 'own' }
  const avg = mean(values), half = Math.max(stdev(values) ?? 0, MIN_HALF[key]), p = PRECISION[key]
  return { low: roundTo(avg - half, p), high: roundTo(avg + half, p), avg, n, source: 'own' }
}

/** Where a value sits against its range. Compared at display precision so the numbers shown and the verdict agree. */
export function rangeStatus(key, value, range) {
  if (value == null || range?.low == null) return null
  const v = roundTo(value, PRECISION[key]), better = METRICS[key].better
  if (v >= range.low && v <= range.high) return { status: 'within', label: 'Within range', tone: 'good' }
  const above = v > range.high
  const good = above ? better === 'up' : better === 'down'
  return { status: above ? 'above' : 'below', label: above ? 'Above range' : 'Below range', tone: good ? 'neutral' : 'warning' }
}

export const fmtRange = (key, r) => {
  const p = PRECISION[key], u = METRICS[key].unit
  return `${fmtNumber(r.low, p)}–${fmtNumber(r.high, p)}${u ? `${u === '%' ? '' : ' '}${u}` : ''}`
}

/** Dense per-day series for [from, to] with each night's own range. */
export function healthSeries(days, key, from, to, opts = {}) {
  return eachDay(from, to).map(date => {
    const value = valueOf(key, days[date]), range = normalRange(days, key, date, opts)
    const st = rangeStatus(key, value, range)
    return { date, value, low: range.low, high: range.high, status: st?.status ?? null, out: st != null && st.status !== 'within' }
  })
}

function streakOf(days, key, date, status, opts) {
  let n = 0
  for (let i = 0; i < RANGE_DAYS; i += 1) {
    const d = addDays(date, -i), st = rangeStatus(key, valueOf(key, days[d]), normalRange(days, key, d, opts))
    if (st?.status !== status) break
    n += 1
  }
  return n
}

/** Latest reading of each vital against its range. Core vitals always appear (in `vitals` or `pending`); SpO₂ only when it has a value. */
export function healthMonitor(days, asOf, { lookbackDays = 2, exclude } = {}) {
  const vitals = [], pending = []
  for (const key of VITALS) {
    const m = METRICS[key], last = latestValue(days, key, { asOf, lookbackDays })
    const base = { key, name: m.label, short: m.short, hue: m.hue }
    if (!last) { if (key !== 'spo2') pending.push({ ...base, reason: 'no-value', n: null }); continue }
    const range = normalRange(days, key, last.date, { exclude }), st = rangeStatus(key, last.value, range)
    if (!st) { pending.push({ ...base, reason: 'no-range', n: range.n }); continue }
    vitals.push({ ...base, value: last.value, date: last.date, ageDays: last.ageDays, range, status: st.status, statusLabel: st.label, tone: st.tone, streak: st.status === 'within' ? 0 : streakOf(days, key, last.date, st.status, { exclude }) })
  }
  const outside = vitals.filter(v => v.status !== 'within').length
  const tone = !vitals.length ? null : !outside ? 'good' : vitals.some(v => v.status !== 'within' && v.tone === 'warning') ? 'warning' : 'neutral'
  return { date: vitals.map(v => v.date).sort().at(-1) ?? null, vitals, pending, total: vitals.length, outside, tone }
}

const list = a => a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`

/** Verdict for Today and the report: { tone, title, sub, sentence } or null with nothing to compare. */
export function monitorSummary(m) {
  if (!m.total) return null
  const out = m.vitals.filter(v => v.status !== 'within'), names = m.vitals.map(v => NAMES[v.key])
  if (!out.length) {
    const title = m.total === 1 ? `${cap(names[0])} within your normal range` : `All ${m.total} vitals within your normal range`
    return { tone: m.tone, title, sub: cap(list(names)), sentence: m.total === 1 ? `${title}.` : `${title}: ${list(names)}.` }
  }
  if (out.length === 1) {
    const v = out[0], title = `${cap(NAMES[v.key])} ${v.status} your normal range`
    return { tone: m.tone, title, sub: v.streak >= 2 ? `${v.streak} nights in a row` : `Normal ${fmtRange(v.key, v.range)}`,
      sentence: v.streak >= 2 ? `${title} for ${v.streak} nights in a row.` : `${title} of ${fmtRange(v.key, v.range)}.` }
  }
  const title = `${out.length} of ${m.total} vitals outside your normal range`
  return { tone: m.tone, title, sub: out.map(v => `${cap(NAMES[v.key])} ${v.status}`).join(' · '), sentence: `${title}: ${list(out.map(v => `${NAMES[v.key]} ${v.status}`))}.` }
}
