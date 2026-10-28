// Day timeline: one day's sleep, workouts, heart rate and Body Battery on a single time axis.
// The window opens at last night's bedtime because Garmin counts that night as part of this day.
import { addDays, parseDay, toDay } from './dates.js'
import { mean } from './stats.js'

export const HOUR = 3600000
export const MIN_GAP = 30 * 60000

const num = v => typeof v === 'number' && Number.isFinite(v)
const floorToHour = ts => { const d = new Date(ts); d.setMinutes(0, 0, 0); return d.getTime() }
const ceilToHour = ts => { const f = floorToHour(ts); return f < ts ? f + HOUR : f }
const samplesOf = (rec, key) => (rec?.[key]?.samples?.length >= 2 ? rec[key].samples : null)

/** Sorted day keys whose record has detailed heart-rate or Body Battery samples. */
export const timelineDays = days => Object.keys(days || {}).filter(k => samplesOf(days[k], 'heartRate') || samplesOf(days[k], 'bodyBattery')).sort()

/** asOf if it has a timeline, else the latest timeline day before it, else null. */
export function defaultTimelineDay(days, asOf) {
  const list = timelineDays(days)
  if (list.includes(asOf)) return asOf
  return list.filter(d => d <= asOf).at(-1) ?? null
}

/** Round local hours inside [start, end]: every 3 hours for a span of 12h or less, else every 6. */
export function timeTicks(start, end) {
  const step = end - start <= 12 * HOUR ? 3 : 6, d = new Date(start)
  d.setMinutes(0, 0, 0)
  if (d.getTime() < start) d.setHours(d.getHours() + 1)
  while (d.getHours() % step !== 0) d.setHours(d.getHours() + 1)
  const ticks = []
  while (d.getTime() <= end) { ticks.push(d.getTime()); d.setHours(d.getHours() + step) }
  return ticks
}

/** Insert a null point between neighbours further apart than max(minGap, 3 x the median step), so lines break. */
export function withGaps(points, minGap = MIN_GAP) {
  if (points.length < 2) return points.slice()
  const steps = points.slice(1).map((p, i) => p.ts - points[i].ts).sort((a, b) => a - b)
  const limit = Math.max(minGap, 3 * steps[Math.floor(steps.length / 2)])
  const out = [points[0]]
  for (let i = 1; i < points.length; i += 1) {
    if (points[i].ts - points[i - 1].ts > limit) out.push({ ts: Math.round((points[i].ts + points[i - 1].ts) / 2), v: null })
    out.push(points[i])
  }
  return out
}

function merged(days, date, key, start, end) {
  const seen = new Set(), out = []
  for (const d of [addDays(date, -1), date]) {
    for (const [ts, v] of days[d]?.[key]?.samples || []) {
      if (!num(ts) || !num(v) || ts < start || ts >= end || seen.has(ts)) continue
      seen.add(ts); out.push({ ts, v })
    }
  }
  return out.sort((a, b) => a.ts - b.ts)
}

function segment(sleep, night, start, end) {
  if (!num(sleep?.startTs) || !num(sleep?.endTs)) return null
  const s = Math.max(sleep.startTs, start), e = Math.min(sleep.endTs, end)
  return e > s ? { start: s, end: e, realStart: sleep.startTs, night, durationSec: sleep.durationSec ?? null, score: sleep.score ?? null } : null
}

function extreme(points, pick) {
  let best = null
  for (const p of points) if (!best || pick(p.v, best.v)) best = p
  return best
}

export function dayTimeline(days, activities, date, now = Date.now()) {
  const midnight = parseDay(date).getTime(), next = parseDay(addDays(date, 1)).getTime()
  const rec = days[date] || {}, sleepRec = rec.sleep
  const start = num(sleepRec?.startTs) ? Math.max(midnight - 6 * HOUR, Math.min(midnight, floorToHour(sleepRec.startTs))) : midnight
  const isToday = date === toDay(new Date(now))
  const end = isToday ? Math.max(start + HOUR, ceilToHour(now)) : next

  const hrRaw = merged(days, date, 'heartRate', start, end), bbRaw = merged(days, date, 'bodyBattery', start, end)
  const hr = withGaps(hrRaw), bb = withGaps(bbRaw)
  const lastTs = Math.max(hrRaw.at(-1)?.ts ?? -Infinity, bbRaw.at(-1)?.ts ?? -Infinity)

  const tonight = days[addDays(date, 1)]?.sleep
  const segs = [segment(sleepRec, date, start, end), num(tonight?.startTs) && tonight.startTs < end ? segment(tonight, addDays(date, 1), start, end) : null].filter(Boolean)
  const sleep = segs.map(({ start: s, end: e, night, durationSec, score }) => ({ start: s, end: e, night, durationSec, score }))

  const acts = (activities || []).filter(a => num(a.startTs) && num(a.durationSec) && a.startTs < end && a.startTs + a.durationSec * 1000 > start)
    .map(a => ({ id: a.id, name: a.name, type: a.type, start: Math.max(a.startTs, start), end: Math.min(a.startTs + a.durationSec * 1000, end), durationSec: a.durationSec, avgHr: a.avgHr ?? null, maxHr: a.maxHr ?? null }))
    .sort((a, b) => a.start - b.start)

  const hrMin = extreme(hrRaw, (a, b) => a < b), hrMax = extreme(hrRaw, (a, b) => a > b)
  const bbHigh = extreme(bbRaw, (a, b) => a > b), bbLow = extreme(bbRaw, (a, b) => a < b)
  const stats = {
    asleepSec: sleepRec?.durationSec ?? null, sleepStart: sleepRec?.startTs ?? null, sleepEnd: sleepRec?.endTs ?? null, sleepScore: sleepRec?.score ?? null,
    workouts: acts.length, workoutSec: acts.reduce((a, x) => a + x.durationSec, 0),
    hrMin: hrMin?.v ?? null, hrMinTs: hrMin?.ts ?? null, hrMax: hrMax?.v ?? null, hrMaxTs: hrMax?.ts ?? null, resting: rec.heartRate?.resting ?? null,
    bbHigh: bbHigh?.v ?? null, bbHighTs: bbHigh?.ts ?? null, bbLow: bbLow?.v ?? null, bbLowTs: bbLow?.ts ?? null, bbLast: bbRaw.at(-1)?.v ?? null,
  }

  const hours = []
  for (let ts = start; ts < end; ts += HOUR) {
    const to = ts + HOUR, mid = ts + HOUR / 2
    const inHr = hrRaw.filter(p => p.ts >= ts && p.ts < to), inBb = bbRaw.filter(p => p.ts >= ts && p.ts < to)
    const act = acts.find(a => a.start < to && a.end > ts)
    hours.push({ ts, hr: inHr.length ? Math.round(mean(inHr.map(p => p.v))) : null, bb: inBb.at(-1)?.v ?? null, state: act ? act.name : sleep.some(s => mid >= s.start && mid < s.end) ? 'Asleep' : null })
  }

  const events = []
  if (num(sleepRec?.endTs) && sleepRec.endTs >= start && sleepRec.endTs <= end) events.push({ ts: sleepRec.endTs, kind: 'wake', night: date, durationSec: sleepRec.durationSec ?? null, score: sleepRec.score ?? null })
  for (const s of segs) if (s.realStart >= start && s.realStart <= end) events.push({ ts: s.realStart, kind: 'sleep' })
  for (const a of acts) events.push({ ts: a.start, kind: 'activity', act: { id: a.id, name: a.name, type: a.type, durationSec: a.durationSec, avgHr: a.avgHr, maxHr: a.maxHr } })
  if (hrMax) events.push({ ts: hrMax.ts, kind: 'hrMax', value: hrMax.v })
  if (bbHigh) events.push({ ts: bbHigh.ts, kind: 'bbHigh', value: bbHigh.v })
  if (bbLow) events.push({ ts: bbLow.ts, kind: 'bbLow', value: bbLow.v })
  events.sort((a, b) => a.ts - b.ts)

  return { date, start, end, isToday, sleep, acts, hr, bb, lastTs: Number.isFinite(lastTs) ? lastTs : null, stats, hours, events }
}
