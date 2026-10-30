// Workout lab analysis from FIT workouts: splits, efficiency, best efforts, run shape, coverage and recovery. Pure, tested in scripts/test-fitanalysis.mjs.
// Works on FitWorkout + FitSeries (schema.js). Time is timer time (pauses left out) unless a name says elapsed.
import { addDays } from './dates.js'
import { valueOf } from './metrics.js'
import { typeGroup } from './activities.js'
import { mean } from './stats.js'

export const ANALYSIS_VERSION = 1
export const RUN_SPEED = 1.8         // m/s (9:16 /km); slower samples are walking or standing
export const WARMUP_SEC = 300        // efficiency and pace-at-zone skip the first 5 min (heart rate lags pace)
export const MIN_STEADY_SEC = 300    // efficiency needs 5 min of running after the warm-up
export const MIN_ZONE_SEC = 180      // pace in a heart-rate zone needs 3 min in it
export const DRIFT_MIN_SEC = 1200    // heart-rate drift needs 20 min of steady running after the warm-up
export const MIN_RUNS = 4, WINDOW_RUNS = 6
export const MIN_EACH = 5            // recovery comparisons: runs needed on each side
export const BACK_PCT = 3            // HRV "back to normal" = within 3% of the run's 7-night baseline
export const BEST = [{ m: 1000, label: '1 km' }, { m: 5000, label: '5 km' }, { m: 10000, label: '10 km' }, { m: 21097.5, label: 'Half marathon' }]
export const RIEGEL = 1.06

const num = v => typeof v === 'number' && Number.isFinite(v)
const has = a => Array.isArray(a) && a.some(num)
const pair = (a, i) => a ? (num(a[i - 1]) && num(a[i]) ? (a[i - 1] + a[i]) / 2 : num(a[i]) ? a[i] : null) : null
const median = list => { const v = list.filter(num).sort((a, b) => a - b); return v.length ? (v.length % 2 ? v[v.length >> 1] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2) : null }
const pct = (a, b) => num(a) && num(b) && b !== 0 ? (a - b) / b * 100 : null

/** Calls fn(dt, i) for each sample interval (i − 1 → i) with timer time passing. */
function eachInterval(s, fn) {
  const tt = s.tt || []
  for (let i = 1; i < tt.length; i += 1) { const dt = tt[i] - tt[i - 1]; if (dt > 0) fn(dt, i) }
}

/** [{ d, t }] samples with both distance and timer time, distance never going backwards. */
function track(s) {
  const out = []
  for (let i = 0; i < (s.tt || []).length; i += 1) {
    const d = s.dist?.[i], t = s.tt[i]
    if (num(d) && num(t) && (!out.length || d >= out.at(-1).d)) out.push({ d, t, i })
  }
  return out
}

/** Timer time when the distance first reaches `m` (interpolated). */
function timeAt(pts, m) {
  let j = pts.findIndex(p => p.d >= m)
  if (j < 0) return null
  if (j === 0) return pts[0].t
  const a = pts[j - 1], b = pts[j]
  return b.d === a.d ? b.t : a.t + (b.t - a.t) * (m - a.d) / (b.d - a.d)
}

/** Kilometre splits (the last one partial): { n, distanceM, sec, pace, avgHr, maxHr, avgCad, elevM, partial }. */
export function kmSplits(s, every = 1000) {
  const pts = track(s)
  if (pts.length < 2) return []
  const total = pts.at(-1).d, marks = []
  for (let m = every; m < total - 1; m += every) marks.push(m)
  marks.push(total)
  const bounds = marks.map(m => timeAt(pts, m))
  const acc = marks.map(() => ({ w: 0, hr: 0, hw: 0, cad: 0, cw: 0, max: null }))
  const which = t => { const k = bounds.findIndex(b => t <= b + 1e-6); return k < 0 ? marks.length - 1 : k }
  eachInterval(s, (dt, i) => {
    const a = acc[which(s.tt[i])], h = pair(s.hr, i), c = pair(s.cad, i)
    if (h != null) { a.hr += h * dt; a.hw += dt }
    if (c != null && c > 0) { a.cad += c * dt; a.cw += dt }
    if (num(s.hr?.[i])) a.max = Math.max(a.max ?? 0, s.hr[i])
  })
  const altAt = t => { let best = null; for (let i = 0; i < s.tt.length; i += 1) { if (s.tt[i] > t) break; if (num(s.alt?.[i])) best = s.alt[i] } return best }
  let prevT = pts[0].t, prevM = 0
  return marks.map((m, k) => {
    const t = bounds[k], sec = t - prevT, distanceM = m - prevM, a = acc[k]
    const e0 = altAt(prevT), e1 = altAt(t)
    const row = { n: k + 1, distanceM, sec, pace: distanceM > 0 ? sec / distanceM * 1000 : null, avgHr: a.hw ? a.hr / a.hw : null, maxHr: a.max, avgCad: a.cw ? a.cad / a.cw : null, elevM: num(e0) && num(e1) ? e1 - e0 : null, partial: distanceM < every * 0.999 }
    prevT = t; prevM = m
    return row
  })
}

/** Metres per heartbeat over running time after the warm-up: { value, sec, speed, hr } or null under MIN_STEADY_SEC. */
export function efficiency(s, { from = WARMUP_SEC, to = Infinity } = {}) {
  let w = 0, sv = 0, hv = 0
  eachInterval(s, (dt, i) => {
    const t = s.tt[i], v = pair(s.speed, i), h = pair(s.hr, i)
    if (t <= from || t > to || v == null || h == null || v < RUN_SPEED || h <= 0) return
    w += dt; sv += v * dt; hv += h * dt
  })
  if (w < MIN_STEADY_SEC) return null
  const speed = sv / w, hr = hv / w
  return { value: speed * 60 / hr, sec: w, speed, hr }
}

/** Zone index for a heart rate against the watch's zone limits (FIT hrZoneHighBoundary): 0 below zone 1 … 6 above zone 5. */
export function zoneOf(hr, bounds) {
  for (let z = 0; z < bounds.length; z += 1) if (hr <= bounds[z]) return z
  return bounds.length
}

/** Seconds in each zone (7 slots, like the watch's) calculated from the heart-rate samples. */
export function zoneTimes(s, bounds) {
  if (!Array.isArray(bounds) || !bounds.length || !has(s.hr)) return null
  const out = Array(bounds.length + 1).fill(0)
  eachInterval(s, (dt, i) => { const h = pair(s.hr, i); if (h != null) out[zoneOf(h, bounds)] += dt })
  return out
}

/** Easy (zones 1–2 and below), moderate (zone 3), hard (zones 4–5 and above) from 7-slot zone seconds. */
export function intensityMix(secs) {
  if (!Array.isArray(secs) || secs.length < 6) return null
  const v = secs.map(x => num(x) ? x : 0), total = v.reduce((a, b) => a + b, 0)
  if (!(total > 0)) return null
  const easy = v[0] + v[1] + v[2], moderate = v[3], hard = v.slice(4).reduce((a, b) => a + b, 0)
  const share = { easy: easy / total, moderate: moderate / total, hard: hard / total }
  const kind = share.easy >= 0.7 ? 'easy' : share.hard >= 0.4 ? 'hard' : 'moderate'
  return { easy, moderate, hard, total, share, kind }
}

/** Running speed in each watch zone 1–5 after the warm-up: { [zone]: { speed|null, sec } }. */
export function speedByZone(s, bounds) {
  if (!Array.isArray(bounds) || bounds.length < 6) return null
  const acc = Array.from({ length: 7 }, () => ({ sec: 0, v: 0 }))
  eachInterval(s, (dt, i) => {
    const v = pair(s.speed, i), h = pair(s.hr, i)
    if (s.tt[i] <= WARMUP_SEC || v == null || h == null || v < RUN_SPEED) return
    const a = acc[zoneOf(h, bounds)]; a.sec += dt; a.v += v * dt
  })
  return Object.fromEntries([1, 2, 3, 4, 5].map(z => [z, { speed: acc[z].sec >= MIN_ZONE_SEC ? acc[z].v / acc[z].sec : null, sec: acc[z].sec }]))
}

/** Fastest timer time over any stretch of `m` metres: { sec, startT } or null when the workout is shorter. */
export function bestEffort(s, m) {
  const pts = track(s)
  if (pts.length < 2 || pts.at(-1).d - pts[0].d < m) return null
  let j = 1, best = null
  for (let i = 0; i < pts.length - 1; i += 1) {
    const target = pts[i].d + m
    if (target > pts.at(-1).d) break
    j = Math.max(j, i + 1)
    while (j < pts.length - 1 && pts[j].d < target) j += 1
    const a = pts[j - 1], b = pts[j]
    const t = b.d === a.d ? b.t : a.t + (b.t - a.t) * (target - a.d) / (b.d - a.d)
    if (!best || t - pts[i].t < best.sec) best = { sec: t - pts[i].t, startT: pts[i].t }
  }
  return best
}

/** Speed smoothed over ±`half` seconds of timer time (GPS speed is noisy second to second). */
export function smoothSpeed(s, half = 7) {
  const tt = s.tt || [], v = s.speed || [], out = Array(tt.length).fill(null)
  let lo = 0, hi = 0, sum = 0, n = 0
  for (let i = 0; i < tt.length; i += 1) {
    while (hi < tt.length && tt[hi] <= tt[i] + half) { if (num(v[hi])) { sum += v[hi]; n += 1 } hi += 1 }
    while (tt[lo] < tt[i] - half) { if (num(v[lo])) { sum -= v[lo]; n -= 1 } lo += 1 }
    out[i] = n ? sum / n : null
  }
  return out
}

/** Even / negative / positive split, progression or intervals: { kind, splitPct, thirds, reps }. splitPct > 0 = second half faster. */
export function runShape(s) {
  const pts = track(s)
  if (pts.length < 2 || pts.at(-1).d < 800) return null
  const total = pts.at(-1).d, t0 = pts[0].t, tEnd = pts.at(-1).t
  const tHalf = timeAt(pts, total / 2), tA = timeAt(pts, total / 3), tB = timeAt(pts, total * 2 / 3)
  const first = tHalf - t0, second = tEnd - tHalf, splitPct = first > 0 ? (first - second) / first * 100 : null
  const third = total / 3, thirds = [tA - t0, tB - tA, tEnd - tB].map(t => t / third * 1000)
  const sm = smoothSpeed(s, 15), run = median(sm.filter(v => num(v) && v >= RUN_SPEED))
  let reps = 0
  if (run) {
    let state = null, since = null
    for (let i = 0; i < sm.length; i += 1) {
      const v = sm[i]
      if (!num(v)) continue
      const next = v >= run * 1.12 ? 'fast' : v <= run * 0.88 ? 'slow' : state
      if (next !== state) { if (state === 'fast' && since != null && s.tt[i] - since >= 30) reps += 1; state = next; since = s.tt[i] }
    }
    if (state === 'fast' && since != null && s.tt.at(-1) - since >= 30) reps += 1
  }
  const progression = thirds[1] < thirds[0] && thirds[2] < thirds[1] && (thirds[0] - thirds[2]) / thirds[0] >= 0.05
  const kind = progression ? 'progression' : reps >= 4 ? 'intervals' : splitPct >= 2 ? 'negative' : splitPct <= -2 ? 'positive' : 'even'
  return { kind, splitPct, thirds, reps }
}

export const SHAPES = {
  intervals: { label: 'Intervals', text: 'Repeated fast stretches with easier ones between.' },
  progression: { label: 'Progression', text: 'Each third faster than the one before.' },
  negative: { label: 'Negative split', text: 'The second half was faster than the first.' },
  positive: { label: 'Positive split', text: 'The second half was slower than the first.' },
  even: { label: 'Even pace', text: 'Both halves within 2% of each other.' },
}
export const INTENSITY = { easy: 'Mostly easy', moderate: 'Mostly moderate', hard: 'Mostly hard' }

/** Heart-rate drift: efficiency in the second half of steady running vs the first, as % (positive = heart rate rose against pace). */
export function hrDrift(s, shape = runShape(s)) {
  const end = s.tt?.at(-1)
  if (!num(end) || end - WARMUP_SEC < DRIFT_MIN_SEC) return { ready: false, reason: 'short' }
  if (shape && shape.kind !== 'even') return { ready: false, reason: 'shape' }
  const mid = WARMUP_SEC + (end - WARMUP_SEC) / 2
  const a = efficiency(s, { from: WARMUP_SEC, to: mid }), b = efficiency(s, { from: mid })
  if (!a || !b) return { ready: false, reason: 'short' }
  return { ready: true, pct: (a.value - b.value) / a.value * 100, first: a, second: b }
}

/** Time below, inside and above a workout step's speed or heart-rate target. */
export function targetAdherence(w, s) {
  const step = w.workout?.steps?.find(x => x.target && num(x.target.lo) && num(x.target.hi) && x.target.hi > x.target.lo)
  if (!step) return null
  const { kind, lo, hi } = step.target, src = kind === 'speed' ? smoothSpeed(s) : s.hr
  if (!src) return null
  const out = { kind, lo, hi, below: 0, within: 0, above: 0, sec: 0, name: w.workout.name }
  eachInterval(s, (dt, i) => {
    const v = kind === 'speed' ? src[i] : pair(src, i)
    if (!num(v)) return
    out.sec += dt
    if (v < lo) out.below += dt; else if (v > hi) out.above += dt; else out.within += dt
  })
  return out.sec > 0 ? out : null
}

/** Run/walk/stand time from the watch's run/walk detection, when the file has it. */
export function runWalk(w) {
  const by = Object.fromEntries((w.splitSummary || []).map(x => [x.type, x]))
  if (!by.walk && !by.run) return null
  const sec = ['run', 'walk', 'stand'].reduce((a, k) => a + (by[k]?.timerSec || 0), 0)
  return sec > 0 ? { run: by.run || null, walk: by.walk || null, stand: by.stand || null, sec, walkShare: (by.walk?.timerSec || 0) / sec } : null
}

const SAMPLE_GAP = s => median((s.tt || []).slice(1).map((t, i) => t - s.tt[i]).filter(d => d > 0))

/** What the file recorded, channel by channel. Missing channels say so; they are never zeros. */
export function coverage(w, s) {
  const n = a => Array.isArray(a) ? a.filter(num).length : 0, gap = SAMPLE_GAP(s)
  const every = gap ? `, about every ${Math.round(gap)} s` : ''
  const rw = runWalk(w)
  return [
    { key: 'summary', label: 'Workout totals', ok: true, detail: 'Distance, time, heart rate and training effect from the watch' },
    { key: 'hr', label: 'Heart rate', ok: n(s.hr) > 0, detail: n(s.hr) ? `${n(s.hr)} readings${every}` : null },
    { key: 'pace', label: 'Pace and distance', ok: n(s.speed) + n(s.dist) > 0, detail: n(s.speed) ? `${n(s.speed)} readings` : null },
    { key: 'gps', label: 'GPS route', ok: n(s.lat) > 1, detail: n(s.lat) > 1 ? `${n(s.lat)} points` : null },
    { key: 'cad', label: 'Cadence', ok: n(s.cad) > 0, detail: n(s.cad) ? 'Steps per minute' : null },
    { key: 'alt', label: 'Elevation', ok: n(s.alt) > 0, detail: n(s.alt) ? (w.sensors?.includes('Barometer') ? 'Barometric altimeter' : 'Recorded') : null },
    { key: 'temp', label: 'Temperature', ok: n(s.temp) > 0, detail: n(s.temp) ? 'Watch sensor (reads warm on the wrist)' : null },
    { key: 'laps', label: 'Laps', ok: (w.laps || []).length > 0, detail: (w.laps || []).length ? `${w.laps.length} ${w.laps.length === 1 ? 'lap' : 'laps'}` : null },
    { key: 'runwalk', label: 'Run/walk detection', ok: !!rw, detail: rw ? `${(w.splits || []).length} segments` : null },
    { key: 'zones', label: 'Heart-rate zones', ok: !!w.zones?.secs, detail: w.zones?.secs ? 'Time in zones from the watch' : w.zones?.bounds ? 'Zone limits only' : null },
    { key: 'recovery', label: 'Recovery heart rate', ok: (w.recovery || []).length > 0, detail: (w.recovery || []).length ? `${w.recovery.length} after stops` : null },
    { key: 'target', label: 'Workout target', ok: !!w.workout, detail: w.workout?.name ? `“${w.workout.name}”` : w.workout ? 'Recorded' : null },
    { key: 'dynamics', label: 'Running dynamics', ok: n(s.gct) + n(s.vo) > 0, detail: n(s.gct) + n(s.vo) ? 'Ground contact time, vertical oscillation' : null, hint: 'Ground contact and vertical oscillation need a chest strap or running pod that records them' },
    { key: 'power', label: 'Running power', ok: n(s.power) > 0, detail: n(s.power) ? `${n(s.power)} readings` : null },
    { key: 'rr', label: 'Beat-to-beat (HRV) data', ok: (w.counts?.rrIntervals || 0) > 0, detail: w.counts?.rrIntervals ? `${w.counts.rrIntervals} intervals` : null, hint: 'Recorded only when beat-to-beat logging is switched on in the watch settings' },
    { key: 'resp', label: 'Breathing rate', ok: n(s.resp) > 0, detail: n(s.resp) ? 'Breaths per minute' : null },
  ]
}

/** Per-workout numbers kept with the summary so the across-runs view needs no samples. */
export function deriveWorkout(w, s) {
  const eff = efficiency(s), shape = runShape(s), secs = w.zones?.secs ?? zoneTimes(s, w.zones?.bounds)
  const mix = intensityMix(secs), drift = hrDrift(s, shape), rw = runWalk(w)
  return {
    version: ANALYSIS_VERSION,
    eff: eff?.value ?? null, effSec: eff?.sec ?? null, effSpeed: eff?.speed ?? null, effHr: eff?.hr ?? null,
    speedByZone: speedByZone(s, w.zones?.bounds),
    best: Object.fromEntries(BEST.map(b => [b.m, bestEffort(s, b.m)?.sec ?? null])),
    shape: shape?.kind ?? null, splitPct: shape?.splitPct ?? null,
    mix: mix ? { kind: mix.kind, easy: mix.share.easy, moderate: mix.share.moderate, hard: mix.share.hard, source: w.zones?.secs ? 'watch' : 'samples' } : null,
    drift: drift.ready ? drift.pct : null, walkShare: rw?.walkShare ?? null,
    gapSec: SAMPLE_GAP(s), hrSamples: Array.isArray(s.hr) ? s.hr.filter(num).length : 0,
  }
}

// ---- Across runs --------------------------------------------------------------------------------

/** Runs with derived numbers, oldest first. */
export const runsOf = workouts => workouts.filter(w => typeGroup(w.type) === 'run' && w.derived).sort((a, b) => a.startTs - b.startTs)

export const isHard = r => (r.aerobicTE ?? 0) >= 3.5 || r.derived?.mix?.kind === 'hard'

/** Last WINDOW_RUNS runs with efficiency against the same number before: did pace change through fitness or effort? */
export function whyFaster(runs) {
  const ok = runs.filter(r => num(r.derived?.eff))
  if (ok.length < 2 * MIN_RUNS) return { ready: false, n: ok.length, need: 2 * MIN_RUNS }
  const k = Math.min(WINDOW_RUNS, Math.floor(ok.length / 2)), recent = ok.slice(-k), prev = ok.slice(-2 * k, -k)
  const avg = (list, f) => mean(list.map(f).filter(num))
  const side = list => ({ n: list.length, speed: avg(list, r => r.derived.effSpeed), hr: avg(list, r => r.derived.effHr), eff: avg(list, r => r.derived.eff), temp: avg(list, r => r.avgTempC), from: list[0].day, to: list.at(-1).day })
  const a = side(prev), b = side(recent)
  const dSpeed = pct(b.speed, a.speed), dHr = pct(b.hr, a.hr), dEff = pct(b.eff, a.eff)
  const up = v => v >= 2, down = v => v <= -2
  const verdict = up(dSpeed) ? (up(dEff) ? (up(dHr) ? 'both' : 'fitness') : 'effort')
    : down(dSpeed) ? (down(dEff) ? 'slower-costlier' : 'easier')
      : up(dEff) ? 'cheaper' : down(dEff) ? 'costlier' : 'steady'
  return { ready: true, k, prev: a, recent: b, dSpeed, dHr, dEff, verdict, faster: up(dSpeed) }
}

export const VERDICTS = {
  fitness: { title: 'Faster at a similar heart rate', text: 'More distance per heartbeat than before. That is what improving aerobic fitness looks like.', tone: 'good' },
  both: { title: 'Faster: part fitness, part effort', text: 'More distance per heartbeat, and a higher heart rate too, so you also pushed harder.', tone: 'good' },
  effort: { title: 'Faster because you pushed harder', text: 'Your heart rate rose about as much as your pace. Distance per heartbeat hasn’t changed much.', tone: 'neutral' },
  cheaper: { title: 'Same pace, lower heart rate', text: 'More distance per heartbeat at about the same pace. A sign of improving aerobic fitness.', tone: 'good' },
  costlier: { title: 'Same pace, higher heart rate', text: 'Less distance per heartbeat than before. Heat, hills, tiredness or a hard week can all do this.', tone: 'warning' },
  easier: { title: 'Slower and easier', text: 'Lower pace at about the same distance per heartbeat, so these runs were simply easier.', tone: 'neutral' },
  'slower-costlier': { title: 'Slower, with less distance per heartbeat', text: 'Pace dropped more than heart rate. Heat, hills, tiredness or time off can all do this.', tone: 'warning' },
  steady: { title: 'About the same as before', text: 'Pace and distance per heartbeat are within 2% of the runs before.', tone: 'neutral' },
}

/** Running pace in watch zones 2–4: runs in the last `days` against the runs before (≥ MIN_RUNS runs with 3+ min in the zone each side). */
export function zonePace(runs, asOf, { days = 60 } = {}) {
  const since = addDays(asOf, -(days - 1))
  const side = (list, z) => {
    let sec = 0, v = 0, n = 0
    for (const r of list) { const x = r.derived?.speedByZone?.[z]; if (num(x?.speed)) { sec += x.sec; v += x.speed * x.sec; n += 1 } }
    return { n, speed: sec ? v / sec : null, pace: sec ? 1000 / (v / sec) : null }
  }
  return [2, 3, 4].map(z => {
    const recent = side(runs.filter(r => r.day >= since), z), before = side(runs.filter(r => r.day < since), z)
    const ready = recent.n >= MIN_RUNS && before.n >= MIN_RUNS
    return { zone: z, recent, before, ready, diffSec: ready ? recent.pace - before.pace : null }
  })
}

/** Fastest effort per distance, overall and since `since`: { [m]: { all: { sec, id, day }, recent } }. */
export function bestEfforts(runs, since) {
  const out = {}
  for (const b of BEST) {
    const pick = list => list.reduce((best, r) => { const sec = r.derived?.best?.[b.m]; return num(sec) && (!best || sec < best.sec) ? { sec, id: r.id, day: r.day } : best }, null)
    out[b.m] = { all: pick(runs), recent: pick(runs.filter(r => r.day >= since)) }
  }
  return out
}

/** Goal progress: the pace it needs, the best effort at that distance and a Riegel estimate from a 5 km+ effort in the last 90 days. */
export function goalProgress(runs, goal, asOf) {
  const since = addDays(asOf, -89), pace = goal.sec / goal.m * 1000
  const best = bestEfforts(runs, since)
  const atGoal = best[goal.m]?.recent ?? null
  let estimate = null
  for (const b of BEST) {
    const e = best[b.m]?.recent
    if (b.m < 5000 || !e || goal.m / b.m > 4.5 || goal.m / b.m < 0.22) continue
    const sec = e.sec * (goal.m / b.m) ** RIEGEL
    if (!estimate || sec < estimate.sec) estimate = { sec, fromM: b.m, fromSec: e.sec, day: e.day, id: e.id }
  }
  const ref = atGoal ? atGoal.sec : estimate?.sec
  return { pace, atGoal, estimate, gapSec: num(ref) ? ref - goal.sec : null, longest: Math.max(0, ...runs.map(r => r.distanceM || 0)) }
}

function baseline(days, key, date, exclude) {
  const v = []
  for (let i = 0; i < 7; i += 1) { const d = addDays(date, -i); if (!exclude?.has(d)) v.push(valueOf(key, days[d])) }
  const have = v.filter(num)
  return have.length >= 3 ? mean(have) : null
}

/** The night after a workout against the 7 nights up to it: { date, pending, hrv, rhr, sleepScore }. */
export function nightAfterRun(days, w, { exclude, asOf } = {}) {
  const next = addDays(w.day, 1), d = days[next]
  if (!d) return { date: next, pending: !asOf || next >= asOf, hrv: null, rhr: null, sleepScore: null }
  const hrv = valueOf('hrv', d), rhr = valueOf('restingHr', d), bh = baseline(days, 'hrv', w.day, exclude), br = baseline(days, 'restingHr', w.day, exclude)
  return {
    date: next, pending: false,
    hrv: num(hrv) ? { value: hrv, base: bh, pct: pct(hrv, bh) } : null,
    rhr: num(rhr) ? { value: rhr, base: br, diff: num(br) ? rhr - br : null } : null,
    sleepScore: valueOf('sleepScore', d),
  }
}

/** Next-morning HRV and resting HR after hard vs other runs, and how many nights HRV took to come back after hard ones. */
export function recoveryAfterRuns(runs, days, { exclude } = {}) {
  const byDay = new Map()
  for (const r of runs) { const prev = byDay.get(r.day); if (!prev || (isHard(r) && !isHard(prev))) byDay.set(r.day, r) }
  const rows = [...byDay.values()].filter(r => !exclude?.has(r.day) && !exclude?.has(addDays(r.day, 1))).map(r => ({ r, n: nightAfterRun(days, r, { exclude }) }))
  const group = list => {
    const h = list.map(x => x.n.hrv?.pct).filter(num), rh = list.map(x => x.n.rhr?.diff).filter(num)
    return { n: Math.min(h.length, list.length), hrvPct: h.length ? mean(h) : null, nHrv: h.length, rhrDiff: rh.length ? mean(rh) : null, nRhr: rh.length }
  }
  const hard = rows.filter(x => isHard(x.r)), easy = rows.filter(x => !isHard(x.r))
  const back = []
  for (const { r } of hard) {
    const base = baseline(days, 'hrv', r.day, exclude)
    if (!num(base)) continue
    let k = null
    for (let i = 1; i <= 4; i += 1) { const v = valueOf('hrv', days[addDays(r.day, i)]); if (num(v) && v >= base * (1 - BACK_PCT / 100)) { k = i; break } }
    if (k != null || num(valueOf('hrv', days[addDays(r.day, 4)]))) back.push(k ?? 5)
  }
  const dist = { 1: 0, 2: 0, 3: 0, 4: 0, '5+': 0 }
  back.forEach(k => { dist[k >= 5 ? '5+' : k] += 1 })
  return { hard: group(hard), easy: group(easy), back: { n: back.length, median: back.length ? median(back) : null, dist }, ready: group(hard).nHrv >= MIN_EACH && group(easy).nHrv >= MIN_EACH }
}

/** Pace improving while HRV falls or resting HR rises: 14 nights against the 28 before. */
export function fatigueCheck(days, why, asOf, { exclude } = {}) {
  const avg = (key, from, to) => {
    const v = []
    for (let d = from; d <= to; d = addDays(d, 1)) if (!exclude?.has(d)) v.push(valueOf(key, days[d]))
    const have = v.filter(num)
    return { value: have.length ? mean(have) : null, n: have.length }
  }
  const recentFrom = addDays(asOf, -13), beforeFrom = addDays(asOf, -41), beforeTo = addDays(asOf, -14)
  const side = key => { const a = avg(key, recentFrom, asOf), b = avg(key, beforeFrom, beforeTo); return a.n >= 10 && b.n >= 20 ? { recent: a.value, before: b.value, nRecent: a.n, nBefore: b.n } : null }
  const hrv = side('hrv'), rhr = side('restingHr')
  const hrvPct = hrv ? pct(hrv.recent, hrv.before) : null, rhrDiff = rhr ? rhr.recent - rhr.before : null
  return { hrv, rhr, hrvPct, rhrDiff, flag: !!why?.faster && ((num(hrvPct) && hrvPct <= -5) || (num(rhrDiff) && rhrDiff >= 2)) }
}

/** The synced Garmin activity this FIT workout belongs to: same Garmin id, else the same start within 2 minutes. */
export function matchActivity(w, activities) {
  return activities.find(a => w.garminId && String(a.id) === w.garminId)
    || activities.find(a => num(a.startTs) && Math.abs(a.startTs - w.startTs) <= 120000) || null
}

// ---- Chart helpers ------------------------------------------------------------------------------

/** Rows for the synced charts, at most `max` (every k-th sample): { i, t, km, pace, hr, cad, alt }. */
export function chartRows(s, max = 700) {
  const n = (s.tt || []).length, k = Math.max(1, Math.ceil(n / max)), sm = smoothSpeed(s), out = []
  for (let i = 0; i < n; i += k) {
    const v = sm[i]
    out.push({ i, t: s.tt[i], km: num(s.dist?.[i]) ? s.dist[i] / 1000 : null, pace: num(v) && v >= 1 ? 1000 / v : null, hr: s.hr?.[i] ?? null, cad: num(s.cad?.[i]) && s.cad[i] > 0 ? s.cad[i] : null, alt: s.alt?.[i] ?? null })
  }
  return out
}

/** SVG route: equirectangular projection fitted to w × h. Returns the path and each sample's [x, y] (null without GPS). */
export function routePath(s, w = 320, h = 220, pad = 12) {
  const lat = s.lat || [], lon = s.lon || [], idx = lat.map((v, i) => num(v) && num(lon[i]) ? i : -1).filter(i => i >= 0)
  if (idx.length < 2) return null
  const mid = mean(idx.map(i => lat[i])) * Math.PI / 180, kx = Math.cos(mid)
  const xs = idx.map(i => lon[i] * kx), ys = idx.map(i => lat[i])
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
  const scale = Math.min((w - 2 * pad) / Math.max(x1 - x0, 1e-9), (h - 2 * pad) / Math.max(y1 - y0, 1e-9))
  const ox = (w - (x1 - x0) * scale) / 2, oy = (h - (y1 - y0) * scale) / 2
  const pts = lat.map(() => null)
  idx.forEach((i, k) => { pts[i] = [Math.round((ox + (xs[k] - x0) * scale) * 10) / 10, Math.round((h - oy - (ys[k] - y0) * scale) * 10) / 10] })
  const d = idx.map((i, k) => `${k ? 'L' : 'M'}${pts[i][0]} ${pts[i][1]}`).join('')
  return { d, pts, start: pts[idx[0]], end: pts[idx.at(-1)], w, h }
}
