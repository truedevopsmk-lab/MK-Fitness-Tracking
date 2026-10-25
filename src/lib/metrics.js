// Single registry of every metric the UI can show. Home cards, trend pages, reports,
// CSV export and insights all read from here so labels, units and formatting agree.
import { fmtDuration, fmtNumber } from './format.js'

const n0 = v => fmtNumber(v)
const hours = v => v == null ? '—' : `${(v / 3600).toFixed(1)}h`
const axisHours = v => `${Math.round(v / 3600)}h`

/** Bands return { label, tone } where tone ∈ 'good' | 'warning' | 'serious' | 'critical' | 'neutral'. */
const sleepBand = v => v == null ? null : v >= 90 ? { label: 'Excellent', tone: 'good' } : v >= 80 ? { label: 'Good', tone: 'good' } : v >= 60 ? { label: 'Fair', tone: 'warning' } : { label: 'Poor', tone: 'serious' }
const bbBand = v => v == null ? null : v >= 76 ? { label: 'High', tone: 'good' } : v >= 51 ? { label: 'Medium', tone: 'neutral' } : v >= 26 ? { label: 'Low', tone: 'warning' } : { label: 'Very low', tone: 'serious' }
const stressBand = v => v == null ? null : v <= 25 ? { label: 'Rest', tone: 'good' } : v <= 50 ? { label: 'Low', tone: 'good' } : v <= 75 ? { label: 'Medium', tone: 'warning' } : { label: 'High', tone: 'serious' }
const readinessBand = v => v == null ? null : v >= 95 ? { label: 'Prime', tone: 'good' } : v >= 75 ? { label: 'High', tone: 'good' } : v >= 50 ? { label: 'Moderate', tone: 'neutral' } : v >= 25 ? { label: 'Low', tone: 'warning' } : { label: 'Poor', tone: 'serious' }
export const hrvStatusBand = s => !s ? null : ({
  BALANCED: { label: 'Balanced', tone: 'good' }, UNBALANCED: { label: 'Unbalanced', tone: 'warning' },
  LOW: { label: 'Low', tone: 'serious' }, POOR: { label: 'Poor', tone: 'critical' },
}[String(s).toUpperCase()] || { label: String(s).toLowerCase(), tone: 'neutral' })

const intensityTotal = d => d.intensity && (d.intensity.moderate != null || d.intensity.vigorous != null)
  ? (d.intensity.moderate ?? 0) + 2 * (d.intensity.vigorous ?? 0) : null

/**
 * key → {
 *   label, short, unit,
 *   pick(day: DayRecord) → number|null,
 *   format(v) → string for display, axis?(v) → short tick label,
 *   agg: 'mean' | 'sum'   how weekly/monthly buckets combine days,
 *   better: 'up' | 'down' | null   which direction is an improvement (colours deltas),
 *   hue: one of sleep|stress|battery|steps|intensity|readiness|hrv|heart (→ CSS var --hue-<hue>),
 *   domain?: [min, max] fixed y-axis, band?(v) → {label, tone}, goal?(day) → number|null,
 *   group: section heading in the trends index, report?: report route kind
 * }
 */
export const METRICS = {
  sleepScore:    { label: 'Sleep score', short: 'Sleep', unit: '', pick: d => d.sleep?.score, format: n0, agg: 'mean', better: 'up', hue: 'sleep', band: sleepBand, group: 'Sleep', report: 'sleep' },
  sleepDuration: { label: 'Sleep duration', short: 'Sleep time', unit: 'h', pick: d => d.sleep?.durationSec, format: fmtDuration, axis: axisHours, agg: 'mean', better: 'up', hue: 'sleep', group: 'Sleep', report: 'sleep' },
  deepSleep:     { label: 'Deep sleep', short: 'Deep', unit: 'h', pick: d => d.sleep?.deepSec, format: fmtDuration, axis: hours, agg: 'mean', better: 'up', hue: 'sleep', group: 'Sleep', report: 'sleep' },
  remSleep:      { label: 'REM sleep', short: 'REM', unit: 'h', pick: d => d.sleep?.remSec, format: fmtDuration, axis: hours, agg: 'mean', better: 'up', hue: 'sleep', group: 'Sleep', report: 'sleep' },
  awakeTime:     { label: 'Awake time', short: 'Awake', unit: 'h', pick: d => d.sleep?.awakeSec, format: fmtDuration, axis: hours, agg: 'mean', better: 'down', hue: 'sleep', group: 'Sleep', report: 'sleep' },

  bodyBatteryHigh: { label: 'Body Battery high', short: 'BB high', unit: '', pick: d => d.bodyBattery?.high, format: n0, agg: 'mean', better: 'up', hue: 'battery', domain: [0, 100], band: bbBand, group: 'Body Battery', report: 'body-battery' },
  bodyBatteryLow:  { label: 'Body Battery low', short: 'BB low', unit: '', pick: d => d.bodyBattery?.low, format: n0, agg: 'mean', better: 'up', hue: 'battery', domain: [0, 100], band: bbBand, group: 'Body Battery', report: 'body-battery' },
  bodyBatteryCharged: { label: 'Body Battery charged', short: 'Charged', unit: '', pick: d => d.bodyBattery?.charged, format: v => v == null ? '—' : `+${n0(v)}`, agg: 'mean', better: 'up', hue: 'battery', group: 'Body Battery', report: 'body-battery' },
  bodyBatteryDrained: { label: 'Body Battery drained', short: 'Drained', unit: '', pick: d => d.bodyBattery?.drained, format: v => v == null ? '—' : `−${n0(v)}`, agg: 'mean', better: null, hue: 'battery', group: 'Body Battery', report: 'body-battery' },

  stressAvg:  { label: 'Average stress', short: 'Stress', unit: '', pick: d => d.stress?.avg, format: n0, agg: 'mean', better: 'down', hue: 'stress', domain: [0, 100], band: stressBand, group: 'Stress', report: 'stress' },
  stressHigh: { label: 'High-stress time', short: 'High stress', unit: 'h', pick: d => d.stress?.highSec, format: fmtDuration, axis: hours, agg: 'mean', better: 'down', hue: 'stress', group: 'Stress', report: 'stress' },

  hrv:          { label: 'Overnight HRV', short: 'HRV', unit: 'ms', pick: d => d.hrv?.lastNight ?? d.sleep?.avgHrv, format: v => v == null ? '—' : `${n0(v)} ms`, axis: n0, agg: 'mean', better: 'up', hue: 'hrv', group: 'Heart', report: 'hrv' },
  hrvWeekly:    { label: 'HRV 7-day average', short: 'HRV 7d', unit: 'ms', pick: d => d.hrv?.weeklyAvg, format: v => v == null ? '—' : `${n0(v)} ms`, axis: n0, agg: 'mean', better: 'up', hue: 'hrv', group: 'Heart', report: 'hrv' },
  restingHr:    { label: 'Resting heart rate', short: 'RHR', unit: 'bpm', pick: d => d.heartRate?.resting ?? d.sleep?.restingHr, format: v => v == null ? '—' : `${n0(v)} bpm`, axis: n0, agg: 'mean', better: 'down', hue: 'heart', group: 'Heart', report: 'heart-rate' },

  steps:     { label: 'Steps', short: 'Steps', unit: '', pick: d => d.steps?.total, format: n0, axis: v => v >= 1000 ? `${Math.round(v / 1000)}k` : n0(v), agg: 'mean', better: 'up', hue: 'steps', goal: d => d.steps?.goal, group: 'Activity', report: 'steps' },
  intensity: { label: 'Intensity minutes', short: 'Intensity', unit: 'min', pick: intensityTotal, format: v => v == null ? '—' : `${n0(v)} min`, axis: n0, agg: 'sum', better: 'up', hue: 'intensity', group: 'Activity', report: 'training-load' },
  trainingLoad: { label: 'Training load', short: 'Load', unit: '', pick: d => d.training?.load, format: n0, agg: 'sum', better: null, hue: 'intensity', group: 'Activity', report: 'training-load' },
  readiness: { label: 'Training readiness', short: 'Readiness', unit: '', pick: d => d.readiness?.score, format: n0, agg: 'mean', better: 'up', hue: 'readiness', domain: [0, 100], band: readinessBand, group: 'Recovery', report: 'recovery' },
  weight:    { label: 'Weight', short: 'Weight', unit: 'kg', pick: d => d.weight?.kg, format: v => v == null ? '—' : `${fmtNumber(v, 1)} kg`, axis: v => fmtNumber(v, 0), agg: 'mean', better: null, hue: 'heart', group: 'Body', report: null },
}

export const METRIC_KEYS = Object.keys(METRICS)
export const metric = key => METRICS[key] || null
export const hueVar = hue => `var(--hue-${hue})`

/** Safe value read: returns a finite number or null. */
export function valueOf(key, day) {
  if (!day) return null
  const v = METRICS[key]?.pick(day)
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/** Smallest change worth showing as a delta chip (below this it is day-to-day noise). */
const MIN_DELTA = { sleepScore: 2, stressAvg: 2, bodyBatteryHigh: 3, bodyBatteryLow: 3, bodyBatteryCharged: 3, bodyBatteryDrained: 3, hrv: 2, hrvWeekly: 1, restingHr: 1, steps: 300, readiness: 3, intensity: 5, trainingLoad: 5, weight: 0.2 }
export function isMeaningfulDelta(key, delta) {
  if (delta == null || !Number.isFinite(delta)) return false
  const unitMin = METRICS[key]?.unit === 'h' ? 300 : 1 // 5 min for durations
  return Math.abs(delta) >= (MIN_DELTA[key] ?? unitMin)
}

/** Colour role for a change: 'good' | 'bad' | 'neutral'. */
export function deltaTone(key, delta) {
  const better = METRICS[key]?.better
  if (!better || delta == null || Math.abs(delta) < 1e-9) return 'neutral'
  return (delta > 0) === (better === 'up') ? 'good' : 'bad'
}

// Validated (dataviz validator, all three app surfaces) — keep this fixed stage order.
export const SLEEP_STAGES = [
  { key: 'deep', label: 'Deep', field: 'deepSec', color: 'var(--stage-deep)' },
  { key: 'light', label: 'Light', field: 'lightSec', color: 'var(--stage-light)' },
  { key: 'rem', label: 'REM', field: 'remSec', color: 'var(--stage-rem)' },
  { key: 'awake', label: 'Awake', field: 'awakeSec', color: 'var(--stage-awake)' },
]
// Ordinal ramp, rest → high (validated --ordinal on light and dark).
export const STRESS_LEVELS = [
  { key: 'rest', label: 'Rest', field: 'restSec', color: 'var(--stress-rest)' },
  { key: 'low', label: 'Low', field: 'lowSec', color: 'var(--stress-low)' },
  { key: 'medium', label: 'Medium', field: 'mediumSec', color: 'var(--stress-medium)' },
  { key: 'high', label: 'High', field: 'highSec', color: 'var(--stress-high)' },
]
