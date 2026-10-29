// Personal insights — trend observations, never medical conclusions.
// Each detector returns zero or one Insight and stays silent below its sample-size / effect-size floor.
import { addDays, parseDay, today } from './dates.js'
import { METRICS, valueOf } from './metrics.js'
import { mean, stdev } from './stats.js'

/**
 * @typedef {Object} Insight
 * @property {string} id          stable id, e.g. 'sleep-7h-bb'
 * @property {string} title       one sentence, plain language
 * @property {string} body        1–2 sentences with the numbers
 * @property {string} evidence    sample size/period, e.g. 'Based on 41 nights in the last 90 days'
 * @property {'positive'|'negative'|'neutral'} tone
 * @property {string[]} metrics   registry keys involved (src/lib/metrics.js)
 * @property {string} [href]      deep link, e.g. '#/trends/hrv?range=30'
 * @property {number} strength    0–1, used to rank (larger effect + more data = higher)
 */

/** Plain-language description of every detector and its thresholds (shown on the Insights page). */
export const DETECTORS_INFO = [
  { id: 'sleep-7h-bb', name: 'Sleep length and Body Battery', rule: 'Compares Body Battery gained overnight after nights of 7 hours or more with shorter nights, over the last 90 days. Needs 8 nights on each side and a gap of at least 5 points.' },
  { id: 'poor-sleep-stress', name: 'Poor sleep and stress', rule: 'Compares average stress on days after a sleep score under 60 (or under 6 hours) with other days, over the last 90 days. Needs 6 days on each side and a gap of at least 4 points.' },
  { id: 'hrv-below-baseline', name: 'HRV below baseline', rule: 'Counts the latest run of nights where HRV was under your Garmin balanced range (or your trailing 7-night average). Shown from 3 nights in a row.' },
  { id: 'steps-month', name: 'Steps this month', rule: 'Compares your average daily steps this month so far with last month. Needs 10 days of data in each and a change of at least 10%.' },
  { id: 'rhr-trend', name: 'Resting heart rate', rule: 'Compares the last 7 days with the 28 days before. Needs a difference of at least 3 bpm.' },
  { id: 'bedtime-consistency', name: 'Bedtime consistency', rule: 'Compares how much your bedtime varied over the last 14 nights with the 28 nights before. Needs a change of at least 15 minutes.' },
  { id: 'weekend-sleep', name: 'Weekend and weekday sleep', rule: 'Compares average sleep on Friday and Saturday nights with other nights over 60 days. Needs a difference of at least 45 minutes.' },
  { id: 'training-volume', name: 'Training volume', rule: 'Compares training time over the last 7 days with your average week over the 4 weeks before. Needs a change of at least 25%.' },
  { id: 'activity-streak', name: 'Activity streak', rule: 'Counts consecutive days with a logged activity. Shown from 5 days in a row.' },
  { id: 'stress-weekday', name: 'Stressful weekday', rule: 'Finds the weekday with the highest average stress over 90 days. Needs 6 days of data per weekday and at least 8 points above your overall average.' },
  { id: 'week-standout', name: 'Standout of the week', rule: 'Finds the metric where the last 7 days differ most from your 30-day norm (at least one standard deviation).' },
]

const WEEKDAYS = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays']
const clamp01 = v => Math.max(0, Math.min(1, v))
const rng = (asOf, from, to) => { const out = []; for (let i = from; i <= to; i += 1) out.push(addDays(asOf, -i)); return out } // days asOf-from … asOf-to (from ≤ to)
const present = values => values.filter(v => typeof v === 'number' && Number.isFinite(v))
const vals = (days, key, list) => present(list.map(d => valueOf(key, days[d])))
const hrs = sec => (sec / 3600).toFixed(1)
const r0 = v => Math.round(v)
const strengthOf = (effect, scale, n, target) => clamp01(effect / scale) * clamp01(n / target)
const trend = (key, range = 30) => `#/trends/${key}?range=${range}`
const cap = s => s[0].toUpperCase() + s.slice(1)

function minutesOfBed(ts) {
  if (typeof ts !== 'number') return null
  const d = new Date(ts), m = d.getHours() * 60 + d.getMinutes()
  return m < 12 * 60 ? m + 1440 : m // after-midnight bedtimes sort after evening ones
}
const clock = m => { const x = ((Math.round(m) % 1440) + 1440) % 1440; return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}` }
const bedtimes = (days, list) => present(list.map(d => minutesOfBed(days[d]?.sleep?.startTs)))
const nightBB = r => r?.sleep?.bodyBatteryChange ?? r?.bodyBattery?.charged ?? null

function sleepBodyBattery(days, asOf) {
  const long = [], short = []
  for (const d of rng(asOf, 0, 89)) {
    const dur = days[d]?.sleep?.durationSec, bb = nightBB(days[d])
    if (typeof dur !== 'number' || typeof bb !== 'number') continue
    ;(dur >= 7 * 3600 ? long : short).push(bb)
  }
  if (long.length < 8 || short.length < 8) return null
  const a = mean(long), b = mean(short), diff = a - b
  if (diff < 5) return null
  return {
    id: 'sleep-7h-bb', tone: 'positive', metrics: ['sleepDuration', 'bodyBatteryCharged'], href: trend('bodyBatteryCharged', 90),
    title: 'Your Body Battery recovered better after nights with more than 7 hours of sleep.',
    body: `On nights of 7 hours or more you gained +${r0(a)} on average, versus +${r0(b)} on shorter nights.`,
    evidence: `Based on ${long.length + short.length} nights in the last 90 days`,
    strength: strengthOf(diff, 25, Math.min(long.length, short.length), 20),
  }
}

function poorSleepStress(days, asOf) {
  const poor = [], rest = []
  for (const d of rng(asOf, 0, 89)) {
    const r = days[d], stress = r?.stress?.avg, s = r?.sleep
    if (typeof stress !== 'number' || !s) continue
    const isPoor = (typeof s.score === 'number' && s.score < 60) || (typeof s.durationSec === 'number' && s.durationSec < 6 * 3600)
    const known = typeof s.score === 'number' || typeof s.durationSec === 'number'
    if (!known) continue
    ;(isPoor ? poor : rest).push(stress)
  }
  if (poor.length < 6 || rest.length < 6) return null
  const a = mean(poor), b = mean(rest), diff = a - b
  if (diff < 4) return null
  return {
    id: 'poor-sleep-stress', tone: 'negative', metrics: ['sleepScore', 'stressAvg'], href: trend('stressAvg', 90),
    title: 'Stress was higher on days following poor sleep.',
    body: `Average stress was ${r0(a)} after a sleep score under 60 (or under 6 hours), compared with ${r0(b)} on other days.`,
    evidence: `Based on ${poor.length + rest.length} days in the last 90 days`,
    strength: strengthOf(diff, 15, Math.min(poor.length, rest.length), 15),
  }
}

function hrvBelowBaseline(days, asOf) {
  const list = rng(asOf, 0, 20) // newest first
  let streak = 0, latest = null, gaps = 0, deficit = []
  for (let i = 0; i < list.length; i += 1) {
    const v = valueOf('hrv', days[list[i]])
    if (v == null) { if (streak === 0 && i <= 2) continue; if (++gaps > 2) break; continue }
    const low = days[list[i]]?.hrv?.baselineLow
    let base = typeof low === 'number' ? low : null
    if (base == null) { const prior = present(list.slice(i + 1, i + 8).map(d => valueOf('hrv', days[d]))); base = prior.length >= 4 ? mean(prior) : null }
    if (base == null || v >= base) break
    if (latest == null) latest = list[i]
    streak += 1; deficit.push(base - v)
  }
  if (streak < 3) return null
  return {
    id: 'hrv-below-baseline', tone: 'negative', metrics: ['hrv'], href: trend('hrv', 30),
    title: `Your HRV has been below its recent baseline for ${streak} days.`,
    body: `Overnight HRV has been about ${r0(mean(deficit))} ms under its baseline on average over this stretch. Short dips are common after hard training, travel or a late night.`,
    evidence: `Based on the last ${streak} nights with HRV data`,
    strength: strengthOf(streak, 7, streak, 3) * 0.9,
  }
}

function stepsMonth(days, asOf) {
  const thisKey = asOf.slice(0, 7), first = `${thisKey}-01`
  const prevEnd = addDays(first, -1), prevKey = prevEnd.slice(0, 7)
  const cur = [], prev = []
  for (const d of Object.keys(days)) {
    const v = valueOf('steps', days[d])
    if (v == null || v <= 0 || d > asOf) continue
    if (d.startsWith(thisKey)) cur.push(v)
    else if (d.startsWith(prevKey)) prev.push(v)
  }
  if (cur.length < 10 || prev.length < 10) return null
  const a = mean(cur), b = mean(prev), change = ((a - b) / b) * 100
  if (Math.abs(change) < 10) return null
  const up = change > 0
  return {
    id: 'steps-month', tone: up ? 'positive' : 'neutral', metrics: ['steps'], href: trend('steps', 60),
    title: `Your average steps ${up ? 'increased' : 'decreased'} ${r0(Math.abs(change))}% this month.`,
    body: `You are averaging ${r0(a).toLocaleString('en-GB')} steps a day so far this month, compared with ${r0(b).toLocaleString('en-GB')} last month.`,
    evidence: `Based on ${cur.length} days this month and ${prev.length} days last month`,
    strength: strengthOf(Math.abs(change), 40, Math.min(cur.length, prev.length), 20),
  }
}

function restingHrTrend(days, asOf) {
  const recent = vals(days, 'restingHr', rng(asOf, 0, 6)), prior = vals(days, 'restingHr', rng(asOf, 7, 34))
  if (recent.length < 4 || prior.length < 14) return null
  const a = mean(recent), b = mean(prior), diff = a - b
  if (Math.abs(diff) < 3) return null
  const up = diff > 0
  return {
    id: 'rhr-trend', tone: up ? 'negative' : 'positive', metrics: ['restingHr'], href: trend('restingHr', 60),
    title: `Your resting heart rate has been ${up ? 'higher' : 'lower'} over the past week.`,
    body: `The last 7 days averaged ${r0(a)} bpm, ${Math.abs(diff).toFixed(1)} bpm ${up ? 'above' : 'below'} the ${r0(b)} bpm average of the 28 days before.`,
    evidence: `Based on ${recent.length} days this week and ${prior.length} days before`,
    strength: strengthOf(Math.abs(diff), 8, recent.length + prior.length, 25),
  }
}

function bedtimeConsistency(days, asOf) {
  const recent = bedtimes(days, rng(asOf, 0, 13)), prior = bedtimes(days, rng(asOf, 14, 41))
  if (recent.length < 10 || prior.length < 14) return null
  const a = stdev(recent), b = stdev(prior)
  if (a == null || b == null || Math.abs(a - b) < 15) return null
  const worse = a > b
  return {
    id: 'bedtime-consistency', tone: worse ? 'negative' : 'positive', metrics: ['sleepDuration'], href: '#/sleep',
    title: worse ? 'Your bedtime has been less regular lately.' : 'Your bedtime has been more regular lately.',
    body: `Over the last 14 nights your bedtime varied by about ±${r0(a)} min, compared with ±${r0(b)} min in the 28 nights before.`,
    evidence: `Based on ${recent.length} recent and ${prior.length} earlier nights`,
    strength: strengthOf(Math.abs(a - b), 60, recent.length + prior.length, 30),
  }
}

function weekendSleep(days, asOf) {
  const weekend = [], week = []
  for (const d of rng(asOf, 0, 59)) {
    const dur = days[d]?.sleep?.durationSec
    if (typeof dur !== 'number') continue
    const dow = parseDay(d).getDay() // woke on Sat/Sun = Fri/Sat night
    ;(dow === 6 || dow === 0 ? weekend : week).push(dur)
  }
  if (weekend.length < 8 || week.length < 15) return null
  const a = mean(weekend), b = mean(week), diffMin = (a - b) / 60
  if (Math.abs(diffMin) < 45) return null
  const more = diffMin > 0
  return {
    id: 'weekend-sleep', tone: 'neutral', metrics: ['sleepDuration'], href: trend('sleepDuration', 60),
    title: `You tend to sleep ${more ? 'longer' : 'less'} on weekend nights.`,
    body: `Friday and Saturday nights averaged ${hrs(a)} h, compared with ${hrs(b)} h on other nights (${r0(Math.abs(diffMin))} min ${more ? 'more' : 'less'}).`,
    evidence: `Based on ${weekend.length + week.length} nights in the last 60 days`,
    strength: strengthOf(Math.abs(diffMin), 120, Math.min(weekend.length * 2, week.length), 20),
  }
}

function trainingVolume(days, activities, asOf) {
  if (!activities?.length) return null
  const sumRange = (from, to) => {
    const set = new Set(rng(asOf, from, to)); let sec = 0, n = 0
    for (const a of activities) if (set.has(a.day) && typeof a.durationSec === 'number') { sec += a.durationSec; n += 1 }
    return { sec, n }
  }
  const cur = sumRange(0, 6), prior = sumRange(7, 34)
  const weekly = prior.sec / 4
  if (prior.n < 6 || weekly <= 0) return null
  const change = ((cur.sec - weekly) / weekly) * 100
  if (Math.abs(change) < 25) return null
  const up = change > 0
  return {
    id: 'training-volume', tone: 'neutral', metrics: ['trainingLoad'], href: '#/reports/training-load',
    title: `Your training time this week was ${r0(Math.abs(change))}% ${up ? 'above' : 'below'} your recent average.`,
    body: `You trained for ${hrs(cur.sec)} h over the last 7 days, compared with ${hrs(weekly)} h in an average week of the previous four.`,
    evidence: `Based on ${cur.n + prior.n} activities in the last 5 weeks`,
    strength: strengthOf(Math.abs(change), 100, cur.n + prior.n, 12),
  }
}

function activityStreak(days, activities, asOf) {
  if (!activities?.length) return null
  const set = new Set(activities.map(a => a.day))
  let d = set.has(asOf) ? asOf : addDays(asOf, -1), n = 0
  while (set.has(d) && n < 60) { n += 1; d = addDays(d, -1) }
  if (n < 5) return null
  return {
    id: 'activity-streak', tone: 'positive', metrics: ['trainingLoad'], href: '#/activities',
    title: `You have logged an activity ${n} days in a row.`,
    body: 'A streak like this can be a good moment to plan an easier day, if you have not already.',
    evidence: `Based on activities from the last ${n} days`,
    strength: strengthOf(n, 14, n, 5) * 0.7,
  }
}

function stressWeekday(days, asOf) {
  const by = Array.from({ length: 7 }, () => []), all = []
  for (const d of rng(asOf, 0, 89)) {
    const v = valueOf('stressAvg', days[d])
    if (v == null) continue
    by[parseDay(d).getDay()].push(v); all.push(v)
  }
  if (all.length < 42) return null
  const overall = mean(all)
  let best = -1, bestDiff = 0
  by.forEach((list, i) => { if (list.length >= 6) { const diff = mean(list) - overall; if (diff > bestDiff) { bestDiff = diff; best = i } } })
  if (best < 0 || bestDiff < 8) return null
  return {
    id: 'stress-weekday', tone: 'negative', metrics: ['stressAvg'], href: trend('stressAvg', 90),
    title: `Stress tends to be higher on ${WEEKDAYS[best]}.`,
    body: `${cap(WEEKDAYS[best])} averaged a stress score of ${r0(mean(by[best]))}, ${r0(bestDiff)} points above your overall average of ${r0(overall)}.`,
    evidence: `Based on ${all.length} days in the last 90 days`,
    strength: strengthOf(bestDiff, 20, by[best].length, 12),
  }
}

const STANDOUT_KEYS = ['sleepScore', 'sleepDuration', 'hrv', 'restingHr', 'steps', 'stressAvg', 'bodyBatteryHigh']
function weekStandout(days, asOf) {
  let best = null
  for (const key of STANDOUT_KEYS) {
    const week = vals(days, key, rng(asOf, 0, 6)), norm = vals(days, key, rng(asOf, 7, 36))
    if (week.length < 5 || norm.length < 20) continue
    const sd = stdev(norm), m = mean(norm), a = mean(week)
    if (!sd || sd < 1e-6) continue
    const z = (a - m) / sd
    if (Math.abs(z) >= 1 && (!best || Math.abs(z) > Math.abs(best.z))) best = { key, z, a, m, n: week.length + norm.length }
  }
  if (!best) return null
  const { key, z, a, m } = best, met = METRICS[key]
  const up = z > 0, better = met.better ? (up === (met.better === 'up')) : null
  const fmt = v => met.format(v)
  return {
    id: 'week-standout', tone: better == null ? 'neutral' : better ? 'positive' : 'negative', metrics: [key], href: trend(key, 30),
    title: `${met.label} stood out this week: ${up ? 'higher' : 'lower'} than your usual.`,
    body: `The last 7 days averaged ${fmt(a)}, compared with ${fmt(m)} over the 30 days before.`,
    evidence: `Based on ${best.n} days of data`,
    strength: strengthOf(Math.abs(z), 3, best.n, 27) * 0.8,
  }
}

/**
 * @param {Record<string, object>} days   store day map
 * @param {object[]} activities
 * @param {{ asOf?: string, exclude?: Set<string> }} [opts]  exclude: dates (status days) left out of every detector
 * @returns {Insight[]} sorted by strength, strongest first
 */
export function computeInsights(days, activities, opts = {}) {
  const asOf = opts.asOf || today(), acts = activities || []
  const all = days || {}, ex = opts.exclude
  const d = ex?.size ? Object.fromEntries(Object.entries(all).filter(([k]) => !ex.has(k))) : all
  const detectors = [
    () => sleepBodyBattery(d, asOf), () => poorSleepStress(d, asOf), () => hrvBelowBaseline(d, asOf),
    () => stepsMonth(d, asOf), () => restingHrTrend(d, asOf), () => bedtimeConsistency(d, asOf),
    () => weekendSleep(d, asOf), () => trainingVolume(d, acts, asOf), () => activityStreak(d, acts, asOf),
    () => stressWeekday(d, asOf), () => weekStandout(d, asOf),
  ]
  const out = []
  for (const run of detectors) {
    try { const r = run(); if (r && Number.isFinite(r.strength)) out.push({ ...r, strength: Math.round(r.strength * 1000) / 1000 }) } catch { /* a bad record must not hide the other insights */ }
  }
  // "Standout of the week" is a catch-all: drop it when a specific detector already covers that metric
  const covered = new Set(out.filter(i => i.id !== 'week-standout').flatMap(i => i.metrics))
  return out.filter(i => i.id !== 'week-standout' || !i.metrics.some(k => covered.has(k)))
    .sort((x, y) => y.strength - x.strength)
}
