// Read helpers over the store's day map. Pure — wrap calls in useMemo.
import { addDays, daysBetween, today } from '../lib/dates.js'
import { valueOf } from '../lib/metrics.js'
import { dailySeries } from '../lib/stats.js'

export const sortedDates = days => Object.keys(days).sort()

export function dataBounds(days) {
  const dates = sortedDates(days)
  return dates.length ? { first: dates[0], last: dates.at(-1) } : null
}

/**
 * Most recent day (≤ asOf) that has a value for a metric.
 * @returns {{ date: string, value: number, record: object, ageDays: number } | null}
 */
export function latestValue(days, key, { asOf = today(), lookbackDays = 30 } = {}) {
  for (let i = 0; i <= lookbackDays; i += 1) {
    const date = addDays(asOf, -i), record = days[date], value = valueOf(key, record)
    if (value != null) return { date, value, record, ageDays: daysBetween(date, asOf) }
  }
  return null
}

/** Dense daily series of a registry metric for [from, to] (nulls where missing). */
export const metricSeries = (days, key, from, to) => dailySeries(days, from, to, d => valueOf(key, d))

/** Last `n` days ending at asOf, inclusive. */
export const lastNDays = (days, key, n, asOf = today()) => metricSeries(days, key, addDays(asOf, -(n - 1)), asOf)

/** Human label for how old a value is: 'Today' / 'Last night' / 'Yesterday' / '21 Oct'. */
export function ageLabel(date, { asOf = today(), overnight = false } = {}) {
  const age = daysBetween(date, asOf)
  if (age === 0) return overnight ? 'Last night' : 'Today'
  if (age === 1) return overnight ? 'Night before last' : 'Yesterday'
  return null // caller formats the date
}
