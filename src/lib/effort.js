// Effort score: training load + everyday steps against your own previous-28-day usual, plus a daily
// target taken from recovery. An estimate from Garmin data, not a Garmin number.
import { addDays, eachDay } from './dates.js'
import { dailyLoadMap } from './activities.js'
import { recoverySeries } from './homeLogic.js'

export const STEP_POINTS = 2, BASE_DAYS = 28, MIN_DAYS = 14

const num = v => typeof v === 'number' && Number.isFinite(v)
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

/** Points for every day in `days` or with an activity: { [date]: { points, load, stepPoints, steps, everydaySteps, workouts } }. points is null with no steps and no load. */
export function effortPoints(days, activities) {
  const load = dailyLoadMap(days, activities), wk = {}
  for (const a of activities) if (a.day) { const w = wk[a.day] ||= { n: 0, steps: 0 }; w.n += 1; if (num(a.steps)) w.steps += a.steps }
  const out = {}
  for (const date of new Set([...Object.keys(days), ...Object.keys(wk)])) {
    const total = days[date]?.steps?.total, hasSteps = num(total), l = load[date]
    const steps = hasSteps ? total : null
    const everydaySteps = hasSteps ? Math.max(0, total - (wk[date]?.steps || 0)) : null
    const stepPoints = hasSteps ? Math.round(everydaySteps / 1000 * STEP_POINTS * 10) / 10 : null
    const points = !hasSteps && !num(l) ? null : (num(l) ? l : 0) + (stepPoints || 0)
    out[date] = { points, load: num(l) ? l : null, stepPoints, steps, everydaySteps, workouts: wk[date]?.n || 0 }
  }
  return out
}

/** Effort for one day: { date, score, points, load, stepPoints, steps, everydaySteps, workouts, usual, n, reason }. */
export function effortFor(days, activities, asOf, pts = effortPoints(days, activities), { exclude } = {}) {
  const d = pts[asOf] || { points: null, load: null, stepPoints: null, steps: null, everydaySteps: null, workouts: 0 }
  const prior = []
  for (let i = 1; i <= BASE_DAYS; i += 1) { const day = addDays(asOf, -i); if (exclude?.has(day)) continue; const p = pts[day]?.points; if (p != null) prior.push(p) }
  const n = prior.length, mean = n ? prior.reduce((a, b) => a + b, 0) / n : null
  const base = { date: asOf, score: null, points: d.points, load: d.load, stepPoints: d.stepPoints, steps: d.steps, everydaySteps: d.everydaySteps, workouts: d.workouts, usual: mean == null ? null : Math.round(mean), n }
  if (d.points == null) return { ...base, reason: 'no-data' }
  if (n < MIN_DAYS) return { ...base, reason: 'history' }
  const scale = Math.max(10, mean)
  return { ...base, score: clamp(Math.round(100 * (1 - 2 ** (-d.points / scale))), 0, 100), reason: null }
}

/** Target band from the recovery score (same cut points as headlineFor). */
export function effortTarget(recoveryScore) {
  if (recoveryScore == null) return null
  if (recoveryScore >= 75) return { lo: 60, hi: 80, tier: 'strong', label: 'Strong day' }
  if (recoveryScore >= 50) return { lo: 40, hi: 60, tier: 'steady', label: 'Steady day' }
  return { lo: 20, hi: 40, tier: 'easy', label: 'Easy day' }
}

export function effortStatus(score, target) {
  if (score == null || !target) return null
  return score < target.lo ? 'below' : score > target.hi ? 'above' : 'in'
}

const TODAY = { below: 'Room for more today', in: 'In today’s target range', above: 'Above today’s target range' }
const OTHER = { below: 'Below the target for this day', in: 'In the target range for this day', above: 'Above the target for this day' }
export const statusText = (status, isToday = true) => status ? (isToday ? TODAY : OTHER)[status] : null

/** One row per day in [from, to]: effort plus that day's own recovery and target (no carry-over). */
export function effortSeries(days, activities, from, to, opts = {}) {
  const pts = effortPoints(days, activities), rec = recoverySeries(days, from, to, opts)
  return eachDay(from, to).map((date, i) => {
    const e = effortFor(days, activities, date, pts, { exclude: opts.exclude }), recovery = rec[i].value, t = effortTarget(recovery)
    return { date, value: e.score, points: e.points, load: e.load, stepPoints: e.stepPoints, steps: e.steps, usual: e.usual, recovery, lo: t ? t.lo : null, hi: t ? t.hi : null, status: effortStatus(e.score, t) }
  })
}
