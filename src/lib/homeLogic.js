// Pure helpers for the Today and Morning pages (recovery estimate, week strip, deltas).
import { addDays, eachDay, weekStart } from './dates.js'
import { METRICS, hrvStatusBand, isMeaningfulDelta, valueOf } from './metrics.js'
import { mean } from './stats.js'
import { latestValue } from '../data/select.js'

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

export const headlineFor = score => score == null ? 'No recovery data yet' : score >= 75 ? 'Ready for a strong day' : score >= 50 ? 'Keep it steady' : 'Prioritize recovery'
export const recommendationFor = score => score == null ? 'Sync last night’s data to see how recovered you are.'
  : score >= 75 ? 'You look well recovered. A good day for a harder session if you feel like it.'
    : score >= 50 ? 'Recovery is middling. A steady workout or a lighter day suits it.'
      : 'Recovery is low. Favor rest, easy movement and an early night.'

/** HRV vs its own baseline: ratio of last night to the 7-day average (Garmin's weeklyAvg, else our own). */
export function hrvRatio(days, hrv) {
  if (!hrv) return null
  const rec = days[hrv.date]
  let base = rec?.hrv?.weeklyAvg
  if (base == null) {
    const prev = []
    for (let i = 1; i <= 7; i += 1) prev.push(valueOf('hrv', days[addDays(hrv.date, -i)]))
    base = prev.filter(v => v != null).length >= 3 ? mean(prev) : null
  }
  return base ? { ratio: hrv.value / base, base } : null
}

/**
 * Recovery for the hero. Garmin's training readiness when present, else an estimate from
 * sleep score (and length vs need), HRV vs baseline and Body Battery high. `parts` are the "why" chips.
 * `sleepNeedHours` is used when the night has no Garmin sleep need (always, on Personal keys).
 * @returns {{ score: number|null, kind: 'garmin'|'estimate'|null, date: string|null, parts: object[] }}
 */
export function recoveryFor(days, asOf, { sleepNeedHours = 8, lookbackDays = 2 } = {}) {
  const opt = { asOf, lookbackDays }
  const sleep = latestValue(days, 'sleepScore', opt), hrv = latestValue(days, 'hrv', opt), bb = latestValue(days, 'bodyBatteryHigh', opt)
  const readiness = latestValue(days, 'readiness', { asOf, lookbackDays: Math.min(1, lookbackDays) })
  const needOf = s => s?.needSec > 0 ? s.needSec : sleepNeedHours * 3600
  const comps = [], parts = []
  if (sleep) {
    // score blended with duration vs need, so a short night can't hide behind a decent score
    const dur = sleep.record.sleep?.durationSec, need = needOf(sleep.record.sleep)
    const durPts = dur ? clamp(100 * dur / need, 0, 100) : null
    comps.push([.4, durPts == null ? sleep.value : .6 * sleep.value + .4 * durPts])
    const b = METRICS.sleepScore.band(sleep.value)
    parts.push({ key: 'sleep', text: `Sleep ${Math.round(sleep.value)} · ${b.label.toLowerCase()}`, tone: b.tone })
    if (dur && dur < need - 3600) parts.push({ key: 'short', text: `Short night · ${Math.floor(dur / 3600)}h ${String(Math.round(dur % 3600 / 60)).padStart(2, '0')}m`, tone: 'warning' })
  }
  const hr = hrvRatio(days, hrv)
  if (hr) {
    // HRV near its own baseline is good; well below is a recovery signal. Above baseline is not
    // "extra" recovery, so it plateaus instead of pushing the score towards 100.
    comps.push([.35, hr.ratio >= 1 ? clamp(85 - (hr.ratio - 1.15) * 60 * (hr.ratio > 1.15), 70, 85) : clamp(85 - (1 - hr.ratio) * 300, 0, 85)])
    const st = hrvStatusBand(days[hrv.date]?.hrv?.status)
    const text = st ? `HRV ${st.label.toLowerCase()}` : hr.ratio >= .95 ? 'HRV in range' : hr.ratio >= .85 ? 'HRV a bit low' : 'HRV below range'
    parts.push({ key: 'hrv', text, tone: st ? st.tone : hr.ratio >= .95 ? 'good' : hr.ratio >= .85 ? 'warning' : 'serious' })
  } else if (hrv) parts.push({ key: 'hrv', text: `HRV ${Math.round(hrv.value)} ms`, tone: 'neutral' })
  if (bb) {
    comps.push([.25, bb.value])
    const b = METRICS.bodyBatteryHigh.band(bb.value)
    parts.push({ key: 'bb', text: `Body Battery high ${Math.round(bb.value)}`, tone: b.tone })
  }
  if (readiness) return { score: Math.round(readiness.value), kind: 'garmin', date: readiness.date, parts }
  if (comps.length < 2) return { score: null, kind: null, date: null, parts }
  const w = comps.reduce((a, [x]) => a + x, 0)
  let score = Math.round(comps.reduce((a, [x, s]) => a + x * s, 0) / w)
  // A short night caps readiness however full Body Battery looks (Garmin's readiness behaves the same way)
  const dur = sleep?.record.sleep?.durationSec, need = needOf(sleep?.record.sleep)
  if (dur) score = Math.min(score, need - dur > 2.5 * 3600 ? 55 : need - dur > 3600 ? 70 : 100)
  return { score, kind: 'estimate', date: (sleep || hrv || bb).date, parts }
}

/** Recovery per day for [from, to], each day on its own data (no carry-over). */
export const recoverySeries = (days, from, to, opts = {}) =>
  eachDay(from, to).map(date => { const r = recoveryFor(days, date, { ...opts, lookbackDays: 0 }); return { date, value: r.score, kind: r.kind } })

/** Mon–Sun of the week containing asOf, with sleep / steps / activity count per day. */
export function weekGrid(days, activities, asOf) {
  const start = weekStart(asOf), letters = 'MTWTFSS'
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, i), rec = days[date]
    return {
      date, letter: letters[i], future: date > asOf, isToday: date === asOf,
      sleep: valueOf('sleepScore', rec), steps: valueOf('steps', rec), goal: rec?.steps?.goal ?? null,
      acts: activities.filter(a => a.day === date).length,
    }
  })
}

/** This week's intensity minutes (Mon–today) vs the weekly goal. */
export function intensityWeek(days, asOf) {
  const start = weekStart(asOf)
  let total = 0, any = false
  for (let d = start; d <= asOf; d = addDays(d, 1)) { const v = valueOf('intensity', days[d]); if (v != null) { total += v; any = true } }
  let goal = 150
  for (let i = 0; i < 21; i += 1) { const g = days[addDays(asOf, -i)]?.intensity?.goal; if (g) { goal = g; break } }
  return { total, goal, any }
}

/** Latest value minus the mean of the 7 days before it (null when fewer than 3 prior days). */
export function deltaVs7(days, key, asOf) {
  const last = latestValue(days, key, { asOf })
  if (!last) return null
  const prev = []
  for (let i = 1; i <= 7; i += 1) prev.push(valueOf(key, days[addDays(last.date, -i)]))
  const have = prev.filter(v => v != null)
  if (have.length < 3) return null
  const delta = last.value - mean(have)
  return isMeaningfulDelta(key, delta) ? { delta, avg: mean(have) } : null
}

/** Body Battery level right now: newest sample, else the day's last level. */
export function bodyBatteryNow(record) {
  const bb = record?.bodyBattery
  if (!bb) return null
  const s = bb.samples?.at(-1)?.[1]
  return s ?? bb.end ?? null
}

export const latestActivity = activities => activities.reduce((best, a) => !best || (a.startTs ?? 0) > (best.startTs ?? 0) ? a : best, null)

import { ageLabel } from '../data/select.js'
import { fmtDay } from './format.js'

/** 'Last night' / 'Yesterday' / '21 Oct' for a value's date. */
export const whenLabel = (date, asOf, overnight = false) => ageLabel(date, { asOf, overnight }) || fmtDay(date)
export const greetingFor = (hour = new Date().getHours()) => hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
