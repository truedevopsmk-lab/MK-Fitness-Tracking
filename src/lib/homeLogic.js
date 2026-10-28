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

const needOf = (s, sleepNeedHours) => s?.needSec > 0 ? s.needSec : sleepNeedHours * 3600

/** Everything the recovery score is built from, computed once for recoveryFor and recoveryBreakdown. */
function recoveryModel(days, asOf, { sleepNeedHours = 8, lookbackDays = 2 } = {}) {
  const opt = { asOf, lookbackDays }
  const sleep = latestValue(days, 'sleepScore', opt), hrv = latestValue(days, 'hrv', opt), bb = latestValue(days, 'bodyBatteryHigh', opt)
  const readiness = latestValue(days, 'readiness', { asOf, lookbackDays: Math.min(1, lookbackDays) })
  const comps = [], parts = [], missing = []
  let sleepInfo = null
  if (sleep) {
    // score blended with duration vs need, so a short night can't hide behind a decent score
    const dur = sleep.record.sleep?.durationSec, need = needOf(sleep.record.sleep, sleepNeedHours)
    const durPts = dur ? clamp(100 * dur / need, 0, 100) : null
    const b = METRICS.sleepScore.band(sleep.value)
    sleepInfo = { durationSec: dur || null, needSec: need, needSource: sleep.record.sleep?.needSec > 0 ? 'garmin' : 'setting' }
    comps.push({ key: 'sleep', w: .4, pts: durPts == null ? sleep.value : .6 * sleep.value + .4 * durPts, date: sleep.date, value: sleep.value, band: b, ...sleepInfo })
    parts.push({ key: 'sleep', text: `Sleep ${Math.round(sleep.value)} · ${b.label.toLowerCase()}`, tone: b.tone })
    if (dur && dur < need - 3600) parts.push({ key: 'short', text: `Short night · ${Math.floor(dur / 3600)}h ${String(Math.round(dur % 3600 / 60)).padStart(2, '0')}m`, tone: 'warning' })
  } else missing.push({ key: 'sleep', label: 'Sleep', reason: 'No sleep score for this night' })
  const hr = hrvRatio(days, hrv)
  if (hr) {
    // HRV near its own baseline is good; well below is a recovery signal. Above baseline is not
    // "extra" recovery, so it plateaus instead of pushing the score towards 100.
    const st = hrvStatusBand(days[hrv.date]?.hrv?.status)
    const text = st ? `HRV ${st.label.toLowerCase()}` : hr.ratio >= .95 ? 'HRV in range' : hr.ratio >= .85 ? 'HRV a bit low' : 'HRV below range'
    const tone = st ? st.tone : hr.ratio >= .95 ? 'good' : hr.ratio >= .85 ? 'warning' : 'serious'
    const band = st || { label: hr.ratio >= .95 ? 'In range' : hr.ratio >= .85 ? 'A bit low' : 'Below range', tone }
    comps.push({ key: 'hrv', w: .35, pts: hr.ratio >= 1 ? clamp(85 - (hr.ratio - 1.15) * 60 * (hr.ratio > 1.15), 70, 85) : clamp(85 - (1 - hr.ratio) * 300, 0, 85), date: hrv.date, value: hrv.value, base: hr.base, ratio: hr.ratio, status: days[hrv.date]?.hrv?.status ?? null, band })
    parts.push({ key: 'hrv', text, tone })
  } else if (hrv) {
    parts.push({ key: 'hrv', text: `HRV ${Math.round(hrv.value)} ms`, tone: 'neutral' })
    missing.push({ key: 'hrv', label: 'HRV', reason: 'Needs 3 nights in the previous 7 for a baseline' })
  } else missing.push({ key: 'hrv', label: 'HRV', reason: 'No HRV reading' })
  if (bb) {
    const b = METRICS.bodyBatteryHigh.band(bb.value)
    comps.push({ key: 'bb', w: .25, pts: bb.value, date: bb.date, value: bb.value, band: b })
    parts.push({ key: 'bb', text: `Body Battery high ${Math.round(bb.value)}`, tone: b.tone })
  } else missing.push({ key: 'bb', label: 'Body Battery', reason: 'No Body Battery data' })
  const out = { comps, parts, missing, sleep, hrv, bb, readiness, uncapped: null, cap: null, score: null, kind: null, date: null }
  if (readiness) return { ...out, score: Math.round(readiness.value), kind: 'garmin', date: readiness.date }
  if (comps.length < 2) return out
  const w = comps.reduce((a, c) => a + c.w, 0)
  out.uncapped = Math.round(comps.reduce((a, c) => a + c.w * c.pts, 0) / w)
  out.score = out.uncapped
  // A short night caps readiness however full Body Battery looks (Garmin's readiness behaves the same way)
  const dur = sleepInfo?.durationSec, need = sleepInfo?.needSec
  if (dur) {
    const limit = need - dur > 2.5 * 3600 ? 55 : need - dur > 3600 ? 70 : 100
    out.score = Math.min(out.uncapped, limit)
    if (out.uncapped > limit) out.cap = { limit, durationSec: dur, needSec: need, shortSec: need - dur }
  }
  return { ...out, kind: 'estimate', date: (sleep || hrv || bb).date }
}

/**
 * Recovery for the hero. Garmin's training readiness when present, else an estimate from
 * sleep score (and length vs need), HRV vs baseline and Body Battery high. `parts` are the "why" chips.
 * `sleepNeedHours` is used when the night has no Garmin sleep need (always, on Personal keys).
 * @returns {{ score: number|null, kind: 'garmin'|'estimate'|null, date: string|null, parts: object[] }}
 */
export function recoveryFor(days, asOf, opts) {
  const { score, kind, date, parts } = recoveryModel(days, asOf, opts)
  return { score, kind, date, parts }
}

const LABELS = { sleep: ['Sleep', 'sleep'], hrv: ['HRV', 'hrv'], bb: ['Body Battery', 'battery'] }

/** Mean of the `n` days before `date` for a metric, needing at least 3 (null otherwise). */
function priorMean(days, key, date) {
  const prev = []
  for (let i = 1; i <= 7; i += 1) prev.push(valueOf(key, days[addDays(date, -i)]))
  const have = prev.filter(v => v != null)
  return have.length >= 3 ? { base: mean(have), n: have.length } : null
}

/**
 * recoveryFor plus the working: each scored input's points and share of the score, inputs that
 * could not be counted, the short-night cap, the biggest drag, inputs watched but not scored, and the change vs the day before.
 * Same opts as recoveryFor.
 */
export function recoveryBreakdown(days, asOf, opts = {}) {
  const m = recoveryModel(days, asOf, opts)
  const { score, kind, date, missing } = m
  const w = m.comps.reduce((a, c) => a + c.w, 0)
  const factors = m.comps.map(c => {
    const { w: weight, pts, key, ...rest } = c, share = weight / w
    return { key, label: LABELS[key][0], hue: LABELS[key][1], weight, share, points: Math.round(pts), contribution: share * pts, ...rest, _pts: pts }
  })
  const est = kind === 'estimate'
  let drag = null, worst = 0
  if (est) for (const f of factors) { const loss = f.share * (100 - f._pts); if (loss >= 6 && loss > worst) { worst = loss; drag = f.key } }
  for (const f of factors) delete f._pts
  const context = []
  if (score != null) {
    const rec = days[date]
    const rhr = valueOf('restingHr', rec)
    if (rhr != null) {
      const g = rec?.heartRate?.resting7d
      const own = g == null ? priorMean(days, 'restingHr', date) : null
      if (g != null) context.push({ key: 'restingHr', label: 'Resting heart rate', value: rhr, base: g, delta: rhr - g, n: 7, source: 'garmin' })
      else if (own) context.push({ key: 'restingHr', label: 'Resting heart rate', value: rhr, base: own.base, delta: rhr - own.base, n: own.n, source: 'own' })
    }
    const resp = valueOf('respiration', rec), rb = resp != null ? priorMean(days, 'respiration', date) : null
    if (rb) context.push({ key: 'respiration', label: 'Overnight respiration', value: resp, base: rb.base, delta: resp - rb.base, n: rb.n, source: 'own' })
  }
  let change = null
  if (score != null) {
    const prev = recoveryFor(days, addDays(date, -1), { ...opts, lookbackDays: 0 })
    if (prev.score != null) change = { delta: score - prev.score, prevScore: prev.score, prevDate: prev.date }
  }
  return { score, kind, date, factors, missing, uncapped: est ? m.uncapped : null, cap: est ? m.cap : null, drag, context, change }
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
