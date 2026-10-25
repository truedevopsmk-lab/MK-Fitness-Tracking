// Pure helpers for the trend pages (unit-tested in scripts/test-trends.mjs).
import { addDays, daysBetween, parseDay } from '../lib/dates.js'
import { fmtDay } from '../lib/format.js'

export const RANGES = [7, 30, 60, 120, 365]
export const GRANULARITIES = [{ value: 'day', label: 'Daily' }, { value: 'week', label: 'Weekly' }, { value: 'month', label: 'Monthly' }]
export const BAR_METRICS = ['steps', 'intensity', 'trainingLoad', 'sleepDuration']
export const BASELINE_METRICS = ['hrv', 'restingHr', 'sleepScore']

/** 7/30 → day, 60/120 → week, 365 → month. */
export const defaultGranularity = range => range >= 365 ? 'month' : range >= 60 ? 'week' : 'day'
/** Weekly needs ≥ 30 days, monthly needs ≥ 120 days. */
export const allowedGranularities = range => ['day', ...(range >= 30 ? ['week'] : []), ...(range >= 120 ? ['month'] : [])]

/** Read range / g / end from URL params, falling back to safe defaults. */
export function resolveParams(params, todayKey) {
  const r = Number(params?.range), range = RANGES.includes(r) ? r : 30
  const g = allowedGranularities(range).includes(params?.g) ? params.g : defaultGranularity(range)
  const e = params?.end
  const end = e && /^\d{4}-\d{2}-\d{2}$/.test(e) && !Number.isNaN(parseDay(e).getTime()) && e <= todayKey ? e : todayKey
  return { range, g, end }
}

/** Inclusive window of `range` days ending at `end`. */
export const windowFor = (end, range) => ({ from: addDays(end, -(range - 1)), to: end })
/** The equal-length window immediately before. */
export const previousWindow = win => { const n = daysBetween(win.from, win.to) + 1; return { from: addDays(win.from, -n), to: addDays(win.from, -1) } }
/** Shift the end by one window length (dir ±1), never past today. */
export function shiftEnd(end, range, dir, todayKey) { const e = addDays(end, dir * range); return e > todayKey ? todayKey : e }
export const canGoPrev = (win, firstDay) => !!firstDay && win.from > firstDay
export const canGoNext = (win, todayKey) => win.to < todayKey

export function windowLabel(win) {
  const sameYear = win.from.slice(0, 4) === win.to.slice(0, 4)
  const a = fmtDay(win.from, sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' })
  return `${a} – ${fmtDay(win.to, { day: 'numeric', month: 'short', year: 'numeric' })}`
}

export const bucketLabel = (date, g) => g === 'month' ? parseDay(`${date}-01`).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }) : fmtDay(date)
export const bucketTitle = (date, g) => g === 'month' ? parseDay(`${date}-01`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) : g === 'week' ? `Week of ${fmtDay(date)}` : null

const round = v => Math.round(v * 1000) / 1000
/** CSV rows for bucketed series: raw numeric values, plus coverage for week/month. */
export function csvRows(buckets, g) {
  return buckets.map(p => ({
    date: p.date,
    value: p.value == null ? '' : round(p.value),
    ...(g === 'day' ? {} : { coverage: p.coverage == null ? '' : Math.round(p.coverage * 100) / 100 }),
  }))
}
export const csvColumns = g => [{ key: 'date', label: g === 'day' ? 'date' : g === 'week' ? 'week_start' : 'month' }, { key: 'value', label: 'value' }, ...(g === 'day' ? [] : [{ key: 'coverage', label: 'coverage' }])]
export const csvFilename = (key, win) => `mk-fitness-${key}-${win.from}-to-${win.to}.csv`
