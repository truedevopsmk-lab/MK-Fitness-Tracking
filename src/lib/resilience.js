// Resilience: 14-day recovery against 14-day effort, i.e. whether recovery is keeping up with what you
// do compared with your own usual. An estimate from Garmin data, not a Garmin number.
import { addDays, eachDay } from './dates.js'
import { mean } from './stats.js'
import { effortSeries } from './effort.js'

export const WINDOW = 14, MIN_PAIRED = 7, REC_HOLD = 60, EFFORT_HARD = 50, HARD_DAY = 65, MIN_BOUNCE = 3, CHANGE_MIN = 5

const num = v => typeof v === 'number' && Number.isFinite(v)

const STATES = {
  strong: { short: 'Strong', title: 'Handling the load well', tone: 'good', text: 'Harder than your usual fortnight, and recovery is holding up.' },
  fresh: { short: 'Fresh', title: 'Recovered, with room for more', tone: 'good', text: 'Recovery is good and effort has been around or below your usual.' },
  stretched: { short: 'Stretched', title: 'Load is ahead of recovery', tone: 'warning', text: `Harder than your usual fortnight while recovery averaged under ${REC_HOLD}.` },
  low: { short: 'Low recovery', title: 'Recovery is low on lighter days', tone: 'warning', text: `Effort has been at or below your usual, yet recovery averaged under ${REC_HOLD}. Sleep and stress are worth a look.` },
}

/** { short, title, tone, text } for a state key, or null. */
export const stateInfo = key => Object.hasOwn(STATES, key) ? STATES[key] : null

/** strong | fresh | stretched | low from a 14-day recovery and effort average (null if either is missing). */
export function stateOf(recovery, effort) {
  if (!num(recovery) || !num(effort)) return null
  const hold = recovery >= REC_HOLD, hard = effort >= EFFORT_HARD
  return hold ? (hard ? 'strong' : 'fresh') : (hard ? 'stretched' : 'low')
}

function windowStats(rows) {
  const paired = rows.filter(r => num(r.value) && num(r.recovery))
  const n = paired.length, ok = n >= MIN_PAIRED
  return { recovery: ok ? mean(paired.map(r => r.recovery)) : null, effort: ok ? mean(paired.map(r => r.value)) : null, n }
}

function bounceOf(rows) {
  const after = [], other = []
  for (let i = 0; i < rows.length - 1; i += 1) {
    if (!num(rows[i].value) || !num(rows[i + 1].recovery)) continue
    ;(rows[i].value >= HARD_DAY ? after : other).push(rows[i + 1].recovery)
  }
  const nAfter = after.length, nOther = other.length, ok = nAfter >= MIN_BOUNCE && nOther >= MIN_BOUNCE
  if (!ok) return { ok, after: null, other: null, nAfter, nOther, delta: null }
  const a = mean(after), o = mean(other)
  return { ok, after: a, other: o, nAfter, nOther, delta: a - o }
}

/** The 14 days ending asOf: { date, state, recovery, effort, n, reason, change, prev, bounce, points }. */
export function resilienceFor(days, activities, asOf, opts = {}, rows = effortSeries(days, activities, addDays(asOf, -(2 * WINDOW - 1)), asOf, opts)) {
  const cur = rows.slice(-WINDOW), prevRows = rows.slice(0, rows.length - WINDOW)
  const w = windowStats(cur), history = w.n < MIN_PAIRED
  const prevVals = prevRows.map(r => r.recovery).filter(num)
  const prev = { recovery: prevVals.length >= MIN_PAIRED ? mean(prevVals) : null, n: prevVals.length }
  return {
    date: asOf, state: history ? null : stateOf(w.recovery, w.effort), recovery: w.recovery, effort: w.effort, n: w.n,
    reason: history ? 'history' : null,
    change: w.recovery != null && prev.recovery != null ? w.recovery - prev.recovery : null,
    prev, bounce: bounceOf(rows),
    points: cur.map(r => ({ date: r.date, recovery: r.recovery, effort: r.value })),
  }
}

/** One row per day in [from, to] from that day's own 14-day window: { date, recovery, effort, n, state }. */
export function resilienceSeries(days, activities, from, to, opts = {}) {
  const rows = effortSeries(days, activities, addDays(from, -(WINDOW - 1)), to, opts)
  return eachDay(from, to).map((date, i) => {
    const w = windowStats(rows.slice(i, i + WINDOW))
    return { date, recovery: w.recovery, effort: w.effort, n: w.n, state: stateOf(w.recovery, w.effort) }
  })
}

export function changeText(change) {
  if (change == null) return null
  if (change <= -CHANGE_MIN) return `Recovery is ${Math.round(-change)} points lower than the 14 days before.`
  if (change >= CHANGE_MIN) return `Recovery is ${Math.round(change)} points higher than the 14 days before.`
  return 'Recovery is about the same as the 14 days before.'
}

export function bounceText(b) {
  if (b.ok) return `The day after a hard day (effort ${HARD_DAY} or more), recovery averaged ${Math.round(b.after)}, against ${Math.round(b.other)} after other days (${b.nAfter} and ${b.nOther} days).`
  return `Needs ${MIN_BOUNCE} hard days and ${MIN_BOUNCE} other days in the last 28 (${b.nAfter} hard so far).`
}
