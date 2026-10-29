import { eachDay, monthKey, weekStart } from './dates.js'

const nums = values => values.filter(v => typeof v === 'number' && Number.isFinite(v))

export const mean = values => { const v = nums(values); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null }
export const sum = values => { const v = nums(values); return v.length ? v.reduce((a, b) => a + b, 0) : null }
export const min = values => { const v = nums(values); return v.length ? Math.min(...v) : null }
export const max = values => { const v = nums(values); return v.length ? Math.max(...v) : null }
export function stdev(values) { const v = nums(values), m = mean(v); return v.length > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1)) : null }

/** Percent change from a to b; null if either side is missing or a is 0. */
export const pctChange = (a, b) => a == null || b == null || a === 0 ? null : ((b - a) / Math.abs(a)) * 100

/**
 * Dense daily series for [from, to]: one point per day, `value: null` where data is missing,
 * so charts can render gaps and count missing days.
 * @param {Record<string, object>} days   the store's day map
 * @param {(day: object) => number|null} pick
 */
export function dailySeries(days, from, to, pick) {
  return eachDay(from, to).map(date => {
    const record = days[date]
    const value = record ? pick(record) : null
    return { date, value: typeof value === 'number' && Number.isFinite(value) ? value : null }
  })
}

/** Bucket a dense daily series into 'day' | 'week' | 'month' using mean (or sum for additive metrics). */
export function bucketSeries(series, granularity, agg = 'mean') {
  if (granularity === 'day') return series
  const keyOf = granularity === 'week' ? weekStart : monthKey
  const groups = new Map()
  for (const p of series) { const k = keyOf(p.date); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p.value) }
  return [...groups].map(([date, values]) => ({ date, value: (agg === 'sum' ? sum : mean)(values), coverage: nums(values).length / values.length }))
}

/**
 * Summary used by every trend page header.
 * `change` is the % change of the window's average vs the equal-length window before it
 * (pass that as `previous`); `delta` is the same comparison in metric units.
 */
export function summarize(series, previous = []) {
  const values = series.map(p => p.value)
  const present = nums(values)
  const avg = mean(values), prevAvg = mean(previous.map(p => p.value))
  return {
    avg, min: min(values), max: max(values), prevAvg,
    change: pctChange(prevAvg, avg), delta: avg != null && prevAvg != null ? avg - prevAvg : null,
    missing: values.length - present.length, total: values.length,
  }
}

/** Trailing mean of the `n` days before index i (excluding i), skipping dates in `exclude`. */
export function rollingBaseline(series, n = 7, exclude = null) {
  return series.map((p, i) => ({ ...p, baseline: mean(series.slice(Math.max(0, i - n), i).filter(x => !exclude?.has(x.date)).map(x => x.value)) }))
}

/** Pearson correlation of paired values (pairs with a null on either side are dropped). */
export function correlation(pairs) {
  const p = pairs.filter(([a, b]) => typeof a === 'number' && typeof b === 'number')
  if (p.length < 5) return null
  const ma = mean(p.map(x => x[0])), mb = mean(p.map(x => x[1]))
  let num = 0, da = 0, db = 0
  for (const [a, b] of p) { num += (a - ma) * (b - mb); da += (a - ma) ** 2; db += (b - mb) ** 2 }
  return da && db ? num / Math.sqrt(da * db) : null
}
