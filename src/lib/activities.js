// Pure helpers for activity pages (type grouping, pace/speed, training-effect labels, load ratio).
import { addDays, daysBetween, eachDay, weekStart } from './dates.js'
import { fmtNumber } from './format.js'

export const TYPE_GROUPS = [
  { key: 'run', label: 'Run', plural: 'Runs', icon: 'steps', hue: 'steps' },
  { key: 'ride', label: 'Ride', plural: 'Rides', icon: 'activity', hue: 'intensity' },
  { key: 'walk', label: 'Walk', plural: 'Walks', icon: 'steps', hue: 'battery' },
  { key: 'strength', label: 'Strength', plural: 'Strength sessions', icon: 'flame', hue: 'hrv' },
  { key: 'other', label: 'Other', plural: 'Other activities', icon: 'heart', hue: 'readiness' },
]
export const GROUP = Object.fromEntries(TYPE_GROUPS.map(g => [g.key, g]))

export function typeGroup(type) {
  const t = String(type || '').toLowerCase()
  if (/run|jog/.test(t)) return 'run'
  if (/cycl|bik|ride|bmx/.test(t)) return 'ride'
  if (/walk|hik/.test(t)) return 'walk'
  if (/strength|weight|gym/.test(t)) return 'strength'
  return 'other'
}

/** 'strength_training' → 'Strength training' */
export function typeName(type) {
  const s = String(type || 'activity').replace(/_/g, ' ').trim().toLowerCase()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export const sortActivities = list => [...list].sort((a, b) => (b.startTs ?? 0) - (a.startTs ?? 0) || String(b.day).localeCompare(String(a.day)))

/** Average speed in m/s, from Garmin's value or distance / time. */
export function speedOf(a) {
  if (a.avgSpeed > 0) return a.avgSpeed
  const t = a.movingSec || a.durationSec
  return a.distanceM > 0 && t > 0 ? a.distanceM / t : null
}
/** Seconds per km for a run/walk, null without distance. */
export function paceSecKm(a) { const s = speedOf(a); return s ? 1000 / s : null }

export function fmtPace(secPerKm) {
  if (secPerKm == null || !Number.isFinite(secPerKm)) return '—'
  let m = Math.floor(secPerKm / 60), s = Math.round(secPerKm % 60)
  if (s === 60) { m += 1; s = 0 }
  return `${m}:${String(s).padStart(2, '0')}`
}
export const fmtKm = m => m == null ? '—' : fmtNumber(m / 1000, m >= 100000 ? 0 : m >= 10000 ? 1 : 2)

/** Pace for run/walk, speed for everything else with a distance: { label, value, unit } or null. */
export function paceOrSpeed(a) {
  const g = typeGroup(a.type), s = speedOf(a)
  if (!s || !(a.distanceM > 0)) return null
  if (g === 'run' || g === 'walk') return { label: 'Pace', value: fmtPace(1000 / s), unit: '/km' }
  return { label: 'Speed', value: fmtNumber(s * 3.6, 1), unit: 'km/h' }
}

export function trainingEffect(v) {
  if (v == null || !Number.isFinite(v)) return null
  const i = Math.floor(v)
  return i < 1 ? 'None' : i < 2 ? 'Minor' : i < 3 ? 'Maintaining' : i < 4 ? 'Improving' : i < 5 ? 'Highly improving' : 'Overreaching'
}

export const HR_ZONES = [
  { key: 1, label: 'Zone 1', note: 'Warm-up' }, { key: 2, label: 'Zone 2', note: 'Easy' }, { key: 3, label: 'Zone 3', note: 'Aerobic' },
  { key: 4, label: 'Zone 4', note: 'Threshold' }, { key: 5, label: 'Zone 5', note: 'Maximum' },
]

/** Acute:chronic load bands. */
export function loadBand(ratio) {
  if (ratio == null || !Number.isFinite(ratio)) return null
  return ratio < 0.8 ? { label: 'Detraining', tone: 'neutral' } : ratio <= 1.3 ? { label: 'Productive range', tone: 'good' }
    : ratio <= 1.5 ? { label: 'High', tone: 'warning' } : { label: 'Very high', tone: 'serious' }
}

/** Daily load map: the day record's training.load, else the sum of that day's activities. */
export function dailyLoadMap(days, activities) {
  const fromActs = {}
  for (const a of activities) if (a.trainingLoad != null && a.day) fromActs[a.day] = (fromActs[a.day] || 0) + a.trainingLoad
  const out = {}
  for (const d of Object.keys(days)) { const v = days[d]?.training?.load; if (typeof v === 'number') out[d] = v }
  for (const d of Object.keys(fromActs)) if (out[d] == null) out[d] = fromActs[d]
  return out
}

/**
 * Acute (7-day total) and chronic (28-day total ÷ 4 = average week) load for each day in [from, to].
 * Both are "load per week", so they share one scale. Ratio is null until the chronic window has a signal.
 */
export function loadSeries(map, from, to) {
  const all = eachDay(addDays(from, -27), to), vals = all.map(d => map[d] ?? 0)
  const pre = 27
  return eachDay(from, to).map((date, i) => {
    const k = i + pre
    let a = 0, c = 0
    for (let j = k - 6; j <= k; j += 1) a += vals[j]
    for (let j = k - 27; j <= k; j += 1) c += vals[j]
    const chronic = c / 4
    return { date, load: map[date] ?? null, acute: a, chronic, ratio: chronic > 0 ? a / chronic : null }
  })
}

/** Weeks (Monday keys) covering [from, to]. */
export function weekKeys(from, to) {
  const out = []
  for (let w = weekStart(from); w <= to; w = addDays(w, 7)) out.push(w)
  return out
}

/** Ordinal "nth this month" for the activity among same-group activities, and comparison to the group's average. */
export function activityContext(a, all) {
  const g = typeGroup(a.type), month = String(a.day).slice(0, 7)
  const same = all.filter(x => typeGroup(x.type) === g)
  const inMonth = same.filter(x => x.id !== a.id && String(x.day).slice(0, 7) === month && (x.startTs ?? 0) <= (a.startTs ?? 0))
  const nth = inMonth.length + 1
  const ordinal = n => { const v = n % 100; return n + (['th', 'st', 'nd', 'rd'][(v - 20) % 10] || ['th', 'st', 'nd', 'rd'][v] || 'th') }
  const recent = same.filter(x => x.id !== a.id && x.day && daysBetween(x.day, a.day) >= 0 && daysBetween(x.day, a.day) <= 180)
  const useDist = a.distanceM > 0 && recent.filter(x => x.distanceM > 0).length >= 3
  const key = useDist ? 'distanceM' : 'durationSec'
  const base = recent.filter(x => x[key] > 0), avg = base.length >= 3 ? base.reduce((s, x) => s + x[key], 0) / base.length : null
  let compare = null
  if (avg && a[key] > 0) {
    const pct = Math.round((a[key] / avg - 1) * 100), noun = 'longer'
    compare = Math.abs(pct) < 3 ? `about your average ${GROUP[g].label.toLowerCase()}` : `${Math.abs(pct)}% ${pct > 0 ? noun : 'shorter'} than your average ${GROUP[g].label.toLowerCase()}`
  }
  return { nth: ordinal(nth), group: g, compare }
}
