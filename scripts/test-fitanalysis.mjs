import assert from 'node:assert/strict'
import {
  ANALYSIS_VERSION, VERDICTS, kmSplits, efficiency, zoneOf, zoneTimes, intensityMix, bestEffort, runShape, hrDrift, targetAdherence, runWalk,
  coverage, deriveWorkout, runsOf, isHard, whyFaster, bestEfforts, goalProgress, nightAfterRun, recoveryAfterRuns, fatigueCheck, matchActivity,
  chartRows, routePath, smoothSpeed,
} from '../src/lib/fitAnalysis.js'
import { decodeFit } from '../src/data/fit.js'
import { normalizeFit } from '../src/data/fitNormalize.js'
import { generateDemo } from '../src/data/demo.js'
import { generateDemoFitFiles } from '../src/data/demoFit.js'
import { addDays } from '../src/lib/dates.js'

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} ${a} vs ${b} (±${tol})`)

// Series from a time function: f(t) → { v, hr?, cad?, alt? }; distance integrates speed.
function byTime(dur, dt, f) {
  const s = { tt: [], t: [], dist: [], speed: [], hr: [], cad: [], alt: [], lat: [], lon: [] }
  let d = 0, prev = 0
  for (let t = 0; t <= dur + 1e-9; t += dt) {
    const p = f(t)
    if (t > 0) d += p.v * (t - prev)
    prev = t
    s.tt.push(t); s.t.push(t); s.dist.push(d); s.speed.push(p.v); s.hr.push(p.hr ?? null); s.cad.push(p.cad ?? null); s.alt.push(p.alt ?? null); s.lat.push(null); s.lon.push(null)
  }
  return s
}
// Same, but the speed is a function of the distance covered so far, until `total` metres.
function byDist(total, dt, f) {
  const s = { tt: [], t: [], dist: [], speed: [], hr: [], cad: [], alt: [], lat: [], lon: [] }
  let d = 0
  for (let t = 0; d < total + 1e-9; t += dt) {
    const p = f(d, t)
    s.tt.push(t); s.t.push(t); s.dist.push(d); s.speed.push(p.v); s.hr.push(p.hr ?? 150); s.cad.push(null); s.alt.push(null); s.lat.push(null); s.lon.push(null)
    d += p.v * dt
  }
  return s
}

// ---- kmSplits ----
{
  const s = byTime(1166, 2, () => ({ v: 3 }))
  s.tt.push(1166 + 2 / 3); s.t.push(1166 + 2 / 3); s.dist.push(3500); s.speed.push(3); s.hr.push(null); s.cad.push(null); s.alt.push(null); s.lat.push(null); s.lon.push(null)
  const sp = kmSplits(s)
  assert.equal(sp.length, 4)
  sp.slice(0, 3).forEach(x => { near(x.pace, 333.3, 0.5, 'pace'); assert.equal(x.partial, false); near(x.distanceM, 1000, 1e-6) })
  assert.equal(sp[3].partial, true); near(sp[3].distanceM, 500, 1, 'last'); assert.deepEqual(sp.map(x => x.n), [1, 2, 3, 4])
  assert.equal(sp[0].avgHr, null)
  // heart rate rising linearly: split 1 (t 0..333.3) averages the mean of its window
  const h = byTime(1166, 2, t => ({ v: 3, hr: 100 + t / 10 }))
  const hs = kmSplits(h)
  near(hs[0].avgHr, 100 + 333.3 / 20, 1, 'split 1 hr'); near(hs[1].avgHr, 100 + 333.3 * 1.5 / 10, 1, 'split 2 hr')
  assert.ok(hs[1].avgHr > hs[0].avgHr && hs[2].avgHr > hs[1].avgHr)
  near(hs[0].maxHr, 100 + 333 / 10, 1)
  // a null-HR stretch inside split 2 doesn't drag the average toward 0
  const g = byTime(1166, 2, t => ({ v: 3, hr: t >= 400 && t < 600 ? null : 150 }))
  const gs = kmSplits(g)
  gs.forEach(x => near(x.avgHr, 150, 0.01, 'null hr'))
  assert.deepEqual(kmSplits({ tt: [0], dist: [0] }), [])
}

// ---- efficiency ----
{
  const e = efficiency(byTime(1200, 1, () => ({ v: 3, hr: 150 })))
  near(e.value, 1.2, 0.01); near(e.sec, 900, 2); near(e.speed, 3, 0.01); near(e.hr, 150, 0.01)
  // 120 s of walking at 1.0 m/s is left out
  const w = efficiency(byTime(1200, 1, t => t >= 600 && t < 720 ? { v: 1, hr: 120 } : { v: 3, hr: 150 }))
  near(w.sec, 900 - 120, 3); near(w.value, 1.2, 0.01)
  assert.equal(efficiency(byTime(400, 1, () => ({ v: 3, hr: 150 }))), null) // only 100 s after warm-up
  assert.equal(efficiency(byTime(1200, 1, () => ({ v: 1.2, hr: 150 }))), null) // all walking
  assert.equal(efficiency(byTime(1200, 1, () => ({ v: 3 }))), null) // no heart rate
}

// ---- zoneOf / zoneTimes ----
{
  const b = [94, 113, 132, 150, 169, 188]
  assert.equal(zoneOf(90, b), 0); assert.equal(zoneOf(94, b), 0); assert.equal(zoneOf(95, b), 1); assert.equal(zoneOf(150, b), 3); assert.equal(zoneOf(151, b), 4); assert.equal(zoneOf(189, b), 6)
  const z = zoneTimes(byTime(600, 1, t => ({ v: 3, hr: t < 300 ? 120 : 160 })), b)
  assert.equal(z.length, 7); near(z.reduce((a, c) => a + c, 0), 600, 1e-6); near(z[2], 300, 1.5); near(z[4], 300, 1.5)
  const gap = zoneTimes(byTime(600, 1, t => ({ v: 3, hr: t >= 100 && t < 200 ? null : 120 })), b)
  assert.ok(gap.reduce((a, c) => a + c, 0) < 600)
  assert.equal(zoneTimes(byTime(60, 1, () => ({ v: 3 })), b), null); assert.equal(zoneTimes(byTime(60, 1, () => ({ v: 3, hr: 100 })), null), null)
}

// ---- intensityMix ----
{
  assert.equal(intensityMix([800, 100, 100, 0, 0, 0, 0]).kind, 'easy')
  assert.equal(intensityMix([700, 0, 0, 100, 100, 100, 0]).kind, 'easy') // exactly 0.7
  assert.equal(intensityMix([100, 100, 100, 300, 200, 200, 0]).kind, 'hard') // exactly 0.4 hard
  assert.equal(intensityMix([200, 100, 100, 400, 100, 100, 0]).kind, 'moderate')
  assert.equal(intensityMix([200, 100, 100, 100, 300, 100, 100]).kind, 'hard') // 0.5 hard
  const m = intensityMix([100, 100, 100, 300, 200, 200, 0])
  near(m.share.easy + m.share.moderate + m.share.hard, 1, 1e-9); assert.equal(m.total, 1000); assert.equal(m.hard, 400)
  assert.equal(intensityMix([1, 2, 3, 4, 5]), null); assert.equal(intensityMix([0, 0, 0, 0, 0, 0, 0]), null); assert.equal(intensityMix(null), null)
  assert.notEqual(intensityMix([1, 2, 3, 4, 5, 6]), null)
}

// ---- bestEffort ----
{
  const s = byDist(5200, 1, d => ({ v: d >= 2000 && d < 3000 ? 1000 / 150 : 1000 / 300 }))
  near(bestEffort(s, 1000).sec, 150, 2, '1 km'); near(bestEffort(s, 1000).startT, 2000 / (1000 / 300), 5)
  const five = bestEffort(s, 5000)
  near(five.sec, 4 * 300 + 150, 3, '5 km')
  assert.equal(bestEffort(s, 10000), null)
  assert.equal(bestEffort({ tt: [0], dist: [0] }, 1000), null)
}

// ---- runShape ----
{
  const even = runShape(byTime(1800, 2, () => ({ v: 3 })))
  assert.equal(even.kind, 'even'); near(even.splitPct, 0, 0.5); assert.equal(even.reps, 0)
  const twoHalves = k => runShape(byTime(1800, 2, t => ({ v: t < 900 ? 3 : 3 * k })))
  const neg = twoHalves(1.05), pos = twoHalves(0.95)
  assert.equal(neg.kind, 'negative'); assert.ok(neg.splitPct > 2)
  assert.equal(pos.kind, 'positive'); assert.ok(pos.splitPct < -2)
  const prog = runShape(byDist(5400, 1, d => ({ v: d < 1800 ? 3 : d < 3600 ? 3.3 : 3.63 })))
  assert.equal(prog.kind, 'progression'); assert.ok(prog.thirds[0] > prog.thirds[1] && prog.thirds[1] > prog.thirds[2])
  const iv = runShape(byTime(1080, 1, t => ({ v: Math.floor(t / 90) % 2 === 0 ? 4 : 2.5 })))
  assert.equal(iv.kind, 'intervals'); assert.ok(iv.reps >= 4, `reps ${iv.reps}`)
  assert.equal(runShape(byTime(200, 2, () => ({ v: 3 }))), null) // 600 m
  assert.equal(runShape({ tt: [], dist: [] }), null)
}

// ---- hrDrift ----
{
  const steady = byTime(2400, 2, t => ({ v: 3, hr: 140 + 0.1 * (t / 60) }))
  const d = hrDrift(steady)
  assert.equal(d.ready, true); assert.ok(d.pct > 0); assert.ok(d.second.hr > d.first.hr)
  const flat = hrDrift(byTime(2400, 2, () => ({ v: 3, hr: 150 })))
  assert.equal(flat.ready, true); near(flat.pct, 0, 0.01)
  const short = hrDrift(byTime(900, 2, t => ({ v: 3, hr: 140 + t / 600 })))
  assert.deepEqual(short, { ready: false, reason: 'short' })
  const progression = hrDrift(byDist(8000, 1, d => ({ v: d < 2700 ? 3 : d < 5400 ? 3.3 : 3.63, hr: 150 })))
  assert.deepEqual(progression, { ready: false, reason: 'shape' })
}

// ---- targetAdherence ----
{
  const w = { workout: { name: 'Base', steps: [{ target: { kind: 'speed', lo: 2, hi: 2.5 } }] } }
  const s = byTime(300, 1, t => ({ v: t < 100 ? 1.5 : t < 200 ? 2.2 : 3 }))
  const a = targetAdherence(w, s)
  near(a.below + a.within + a.above, a.sec, 1e-6); near(a.sec, 300, 1.5); assert.equal(a.name, 'Base'); assert.equal(a.kind, 'speed')
  near(a.below, 100, 10); near(a.within, 100, 10); near(a.above, 100, 10)
  assert.equal(targetAdherence({ workout: { name: 'x', steps: [{ target: null }] } }, s), null)
  assert.equal(targetAdherence({}, s), null)
  assert.equal(targetAdherence({ workout: { steps: [{ target: { kind: 'speed', lo: 2.5, hi: 2.5 } }] } }, s), null)
  const hw = { workout: { name: 'HR', steps: [{ target: { kind: 'heartRate', lo: 130, hi: 150 } }] } }
  const h = targetAdherence(hw, byTime(300, 1, t => ({ v: 3, hr: t < 100 ? 120 : t < 200 ? 140 : 160 })))
  near(h.below, 100, 3); near(h.within, 100, 3); near(h.above, 100, 3)
}

// ---- runWalk ----
{
  const r = runWalk({ splitSummary: [{ type: 'run', timerSec: 700 }, { type: 'walk', timerSec: 300 }] })
  assert.equal(r.sec, 1000); near(r.walkShare, 0.3, 1e-9); assert.equal(r.run.timerSec, 700); assert.equal(r.stand, null)
  assert.equal(runWalk({}), null); assert.equal(runWalk({ splitSummary: [] }), null); assert.equal(runWalk({ splitSummary: [{ type: 'stand', timerSec: 10 }] }), null)
}

// ---- coverage ----
{
  const s = byTime(100, 1, t => ({ v: 3, hr: 150, cad: 170, alt: 10 }))
  s.lat = s.t.map(t => 0.5 + t * 1e-5); s.lon = s.t.map(() => 0.5)
  const c = Object.fromEntries(coverage({ laps: [{}, {}], sensors: ['Barometer'], counts: { rrIntervals: 0 } }, s).map(x => [x.key, x]))
  for (const k of ['summary', 'hr', 'pace', 'gps', 'cad', 'alt', 'laps']) assert.equal(c[k].ok, true, k)
  assert.equal(c.alt.detail, 'Barometric altimeter'); assert.equal(c.laps.detail, '2 laps'); assert.match(c.hr.detail, /about every 1 s/)
  for (const k of ['power', 'dynamics', 'rr', 'resp', 'temp', 'runwalk', 'zones', 'recovery', 'target']) { assert.equal(c[k].ok, false, k); assert.equal(c[k].detail, null, k) }
  assert.ok(c.dynamics.hint && c.rr.hint)
  const none = coverage({}, { tt: [0, 1] })
  assert.equal(none.find(x => x.key === 'hr').ok, false); assert.equal(none.find(x => x.key === 'hr').detail, null)
  assert.ok(none.every(x => x.detail !== '0' && !/^0 /.test(x.detail || '')))
  const withData = Object.fromEntries(coverage({ workout: { name: 'Base' }, counts: { rrIntervals: 40 } }, { ...s, power: [200, 210], gct: [250, 251] }).map(x => [x.key, x]))
  assert.equal(withData.power.ok, true); assert.equal(withData.dynamics.ok, true); assert.equal(withData.rr.ok, true); assert.equal(withData.target.detail, '“Base”')
}

// ---- deriveWorkout ----
{
  const s = byTime(1500, 2, t => ({ v: 3, hr: 150 }))
  const d = deriveWorkout({ zones: { secs: [0, 0, 1100, 250, 150, 0, 0], bounds: [94, 113, 132, 150, 169, 188] } }, s)
  assert.deepEqual(Object.keys(d).sort(), ['best', 'drift', 'eff', 'effHr', 'effSec', 'effSpeed', 'gapSec', 'hrSamples', 'mix', 'shape', 'speedByZone', 'splitPct', 'version', 'walkShare'].sort())
  assert.equal(d.version, ANALYSIS_VERSION); near(d.eff, 1.2, 0.01); assert.equal(d.shape, 'even'); assert.equal(d.mix.source, 'watch'); assert.equal(d.mix.kind, 'easy')
  assert.deepEqual(Object.keys(d.best), ['1000', '5000', '10000', '21097.5']); assert.ok(d.best[1000] > 0); assert.equal(d.best[10000], null)
  assert.equal(d.gapSec, 2); assert.equal(d.hrSamples, s.hr.length); assert.equal(d.walkShare, null); near(d.drift, 0, 0.01)
  const noZones = deriveWorkout({ zones: { bounds: [94, 113, 132, 150, 169, 188] } }, s)
  assert.equal(noZones.mix.source, 'samples'); assert.equal(noZones.mix.kind, 'moderate')
  const bare = deriveWorkout({}, { tt: [0, 1, 2], dist: [0, 1, 2] })
  assert.equal(bare.eff, null); assert.equal(bare.mix, null); assert.equal(bare.speedByZone, null)
}

// ---- across runs ----
const mkRun = (i, o = {}) => ({ id: `r${i}`, type: 'running', day: addDays('2026-06-01', i * 2), startTs: Date.UTC(2026, 5, 1 + i * 2, 1), distanceM: 5000, aerobicTE: 2.5, avgTempC: 20, ...o, derived: { eff: 1.2, effSpeed: 3, effHr: 150, best: {}, mix: { kind: 'easy' }, ...o.derived } })
const eight = (recent, prev = {}) => Array.from({ length: 8 }, (_, i) => mkRun(i, { derived: i < 4 ? prev : recent }))

{ // whyFaster
  const few = whyFaster(Array.from({ length: 7 }, (_, i) => mkRun(i)))
  assert.deepEqual(few, { ready: false, n: 7, need: 8 })
  assert.equal(whyFaster([...Array.from({ length: 7 }, (_, i) => mkRun(i)), mkRun(7, { derived: { eff: null } })]).ready, false)
  const cases = {
    fitness: { effSpeed: 3.3, effHr: 150, eff: 1.32 },
    effort: { effSpeed: 3.3, effHr: 165, eff: 1.2 },
    both: { effSpeed: 3.3, effHr: 160, eff: 1.24 },
    cheaper: { effSpeed: 3, effHr: 140, eff: 1.29 },
    costlier: { effSpeed: 3, effHr: 160, eff: 1.12 },
    steady: { effSpeed: 3.03, effHr: 150.5, eff: 1.21 },
    easier: { effSpeed: 2.7, effHr: 135, eff: 1.2 },
    'slower-costlier': { effSpeed: 2.7, effHr: 150, eff: 1.08 },
  }
  for (const [verdict, derived] of Object.entries(cases)) {
    const w = whyFaster(eight(derived))
    assert.equal(w.ready, true); assert.equal(w.verdict, verdict); assert.ok(VERDICTS[verdict], verdict); assert.equal(w.k, 4); assert.equal(w.recent.n, 4)
  }
  assert.equal(whyFaster(eight(cases.fitness)).faster, true); assert.equal(whyFaster(eight(cases.cheaper)).faster, false)
  near(whyFaster(eight(cases.fitness)).dSpeed, 10, 1e-9)
  for (const k of Object.keys(VERDICTS)) assert.ok(VERDICTS[k].title && VERDICTS[k].text && VERDICTS[k].tone)
  const many = whyFaster(Array.from({ length: 20 }, (_, i) => mkRun(i)))
  assert.equal(many.k, 6); assert.equal(many.recent.to, mkRun(19).day)
}

{ // bestEfforts
  const runs = [
    mkRun(0, { derived: { best: { 1000: 270, 5000: 1500 } } }),
    mkRun(10, { derived: { best: { 1000: 280, 5000: 1450 } } }),
    mkRun(20, { derived: { best: { 1000: 290 } } }),
  ]
  const since = runs[1].day
  const b = bestEfforts(runs, since)
  assert.deepEqual(b[1000].all, { sec: 270, id: 'r0', day: runs[0].day }); assert.deepEqual(b[1000].recent, { sec: 280, id: 'r10', day: runs[1].day })
  assert.equal(b[5000].all.sec, 1450); assert.equal(b[5000].recent.id, 'r10')
  assert.equal(b[10000].all, null); assert.equal(b[10000].recent, null); assert.ok(21097.5 in b)
  assert.equal(bestEfforts(runs, '2099-01-01')[1000].recent, null)
}

{ // goalProgress
  const asOf = '2026-10-30', goal = { m: 10000, sec: 2940 }, recentDay = addDays(asOf, -10), oldDay = addDays(asOf, -120)
  const at = (day, best) => mkRun(0, { id: day, day, derived: { best } })
  const g10 = goalProgress([at(recentDay, { 10000: 3000, 5000: 1400 })], goal, asOf)
  assert.equal(g10.atGoal.sec, 3000); assert.equal(g10.gapSec, 60); near(g10.pace, 294, 1e-9); assert.equal(g10.estimate.fromM, 5000)
  const g5 = goalProgress([at(recentDay, { 5000: 1400 })], goal, asOf)
  assert.equal(g5.atGoal, null); near(g5.estimate.sec, 1400 * 2 ** 1.06, 1); assert.equal(g5.estimate.fromM, 5000); near(g5.gapSec, 1400 * 2 ** 1.06 - 2940, 1)
  const g1 = goalProgress([at(recentDay, { 1000: 240 })], goal, asOf)
  assert.equal(g1.estimate, null); assert.equal(g1.atGoal, null); assert.equal(g1.gapSec, null)
  const old = goalProgress([at(oldDay, { 5000: 1400, 10000: 2900 })], goal, asOf)
  assert.equal(old.estimate, null); assert.equal(old.atGoal, null); assert.equal(old.gapSec, null)
  assert.equal(goalProgress([at(recentDay, { 5000: 1400 })], goal, asOf).longest, 5000)
  assert.equal(goalProgress([], goal, asOf).longest, 0)
}

// days fixture: [from, to] with an hrv/rhr/sleep value each
const dayMap = (from, to, f) => { const out = {}; for (let d = from; d <= to; d = addDays(d, 1)) { const v = f(d); if (v) out[d] = { date: d, hrv: { lastNight: v.hrv }, heartRate: { resting: v.rhr }, sleep: { score: v.sleep } } } return out }

{ // nightAfterRun
  const run = '2026-09-10', next = '2026-09-11'
  const days = dayMap('2026-09-01', next, d => d === next ? { hrv: 55, rhr: 53, sleep: 80 } : { hrv: 50, rhr: 50, sleep: 70 })
  const n = nightAfterRun(days, { day: run }, { asOf: '2026-10-30' })
  assert.equal(n.pending, false); assert.equal(n.date, next); near(n.hrv.pct, 10, 1e-9); assert.equal(n.hrv.base, 50); assert.equal(n.rhr.diff, 3); assert.equal(n.sleepScore, 80)
  const gone = { ...days }; delete gone[next]
  assert.equal(nightAfterRun(gone, { day: run }, { asOf: next }).pending, true)
  assert.equal(nightAfterRun(gone, { day: run }, { asOf: addDays(next, 1) }).pending, false)
  assert.equal(nightAfterRun(gone, { day: run }, { asOf: addDays(next, 5) }).hrv, null)
  assert.equal(nightAfterRun(gone, { day: run }).pending, true)
  // fewer than 3 baseline nights → no baseline → pct null
  const thin = dayMap('2026-09-09', next, d => d === next ? { hrv: 55, rhr: 53 } : { hrv: 50, rhr: 50 })
  assert.equal(nightAfterRun(thin, { day: run }, { asOf: '2026-10-30' }).hrv.pct, null)
  // excluding a night leaves it out of the baseline
  const ex = { ...days, '2026-09-08': { date: '2026-09-08', hrv: { lastNight: 90 } } }
  assert.ok(nightAfterRun(ex, { day: run }, {}).hrv.base > 50)
  assert.equal(nightAfterRun(ex, { day: run }, { exclude: new Set(['2026-09-08']) }).hrv.base, 50)
}

{ // recoveryAfterRuns
  const START = '2026-06-01', runs = Array.from({ length: 12 }, (_, k) => mkRun(0, { id: `q${k}`, day: addDays(START, k * 3), aerobicTE: k % 2 === 0 ? 4 : 2, derived: { mix: { kind: 'easy' } } }))
  const hrvAt = {}
  runs.forEach((r, k) => { if (k % 2 === 0) { hrvAt[addDays(r.day, 1)] = 40; hrvAt[addDays(r.day, 2)] = 45; hrvAt[addDays(r.day, 3)] = 50 } else hrvAt[addDays(r.day, 1)] = 51 })
  const days = dayMap(addDays(START, -10), addDays(START, 45), d => ({ hrv: hrvAt[d] ?? 50, rhr: 50 }))
  const r = recoveryAfterRuns(runs, days)
  assert.equal(r.ready, true); assert.equal(r.hard.nHrv, 6); assert.equal(r.easy.nHrv, 6)
  assert.ok(r.hard.hrvPct < -10, `hard ${r.hard.hrvPct}`); assert.ok(r.easy.hrvPct > 0)
  assert.equal(r.back.median, 3); assert.equal(r.back.n, 6); assert.equal(r.back.dist[3], 6)
  // fewer than 5 nights each side → not ready
  assert.equal(recoveryAfterRuns(runs.slice(0, 7), days).ready, false)
  // an excluded run day (or its next night) is left out
  const ex = recoveryAfterRuns(runs, days, { exclude: new Set([runs[0].day]) })
  assert.equal(ex.hard.nHrv, 5); assert.equal(recoveryAfterRuns(runs, days, { exclude: new Set([addDays(runs[1].day, 1)]) }).easy.nHrv, 5)
  // hard by mix.kind even with low aerobic TE
  assert.equal(isHard(mkRun(0, { aerobicTE: 1, derived: { mix: { kind: 'hard' } } })), true); assert.equal(isHard(mkRun(0, { aerobicTE: 3.5 })), true)
  assert.equal(isHard(mkRun(0, { aerobicTE: 3.4 })), false); assert.equal(isHard({ derived: null }), false)
  // two runs on one day count once, the hard one
  const dup = recoveryAfterRuns([...runs, mkRun(0, { id: 'dup', day: runs[0].day, aerobicTE: 1 })], days)
  assert.equal(dup.hard.nHrv, 6); assert.equal(dup.easy.nHrv, 6)
  // HRV never recovers within 4 days → counted as 5+
  const lowDays = new Set(runs.filter(isHard).flatMap(r => [1, 2, 3, 4].map(i => addDays(r.day, i))))
  const flat = dayMap(addDays(START, -10), addDays(START, 45), d => ({ hrv: lowDays.has(d) ? 40 : 50 }))
  assert.ok(recoveryAfterRuns(runs, flat).back.dist['5+'] >= 1)
}

{ // fatigueCheck
  const asOf = '2026-10-30', recentFrom = addDays(asOf, -13), faster = { faster: true }
  const make = (recentHrv, recentRhr, { recentDays = 14, beforeDays = 28 } = {}) => dayMap(addDays(asOf, -41), asOf, d => {
    const rec = d >= recentFrom
    if (rec && d < addDays(asOf, -recentDays + 1)) return null
    if (!rec && d < addDays(asOf, -13 - beforeDays)) return null
    return { hrv: rec ? recentHrv : 50, rhr: rec ? recentRhr : 50 }
  })
  const f = fatigueCheck(make(46, 50), faster, asOf)
  assert.equal(f.flag, true); near(f.hrvPct, -8, 1e-9); assert.equal(f.hrv.nRecent, 14); assert.equal(f.hrv.nBefore, 28)
  assert.equal(fatigueCheck(make(50, 52), faster, asOf).flag, true) // RHR +2
  assert.equal(fatigueCheck(make(46, 50), { faster: false }, asOf).flag, false)
  assert.equal(fatigueCheck(make(46, 50), null, asOf).flag, false)
  assert.equal(fatigueCheck(make(48.5, 51), faster, asOf).flag, false) // HRV −3%, RHR +1
  assert.equal(fatigueCheck(make(46, 50, { recentDays: 9 }), faster, asOf).flag, false) // < 10 recent nights
  assert.equal(fatigueCheck(make(46, 50, { beforeDays: 19 }), faster, asOf).flag, false) // < 20 earlier nights
  assert.equal(fatigueCheck(make(46, 50), faster, asOf, { exclude: new Set(Array.from({ length: 6 }, (_, i) => addDays(asOf, -i))) }).hrv, null)
}

{ // matchActivity
  const T = Date.UTC(2026, 5, 1, 1, 0, 0)
  const acts = [{ id: 111, startTs: T + 3600000 }, { id: 222, startTs: T + 60000 }, { id: 333, startTs: T + 130000 }]
  assert.equal(matchActivity({ garminId: '111', startTs: T }, acts).id, 111)
  assert.equal(matchActivity({ garminId: null, startTs: T }, acts).id, 222)
  assert.equal(matchActivity({ garminId: '999', startTs: T }, acts).id, 222)
  assert.equal(matchActivity({ garminId: null, startTs: T }, [{ id: 333, startTs: T + 130000 }]), null)
  assert.equal(matchActivity({ garminId: null, startTs: T }, [{ id: 5, startTs: T + 120000 }]).id, 5)
  assert.equal(matchActivity({ garminId: null, startTs: T }, []), null)
}

// ---- chart helpers ----
{
  const s = byTime(1999, 1, t => ({ v: t >= 500 && t < 700 ? 0.5 : 3, hr: 140, cad: t < 100 ? 0 : 170, alt: 20 }))
  const rows = chartRows(s, 700)
  assert.ok(rows.length <= 700 && rows.length > 600, `rows ${rows.length}`)
  assert.equal(chartRows(s, 5000).length, 2000); assert.equal(chartRows(s, 10).length <= 10, true)
  const mid = rows.find(r => r.t === 600 || r.t === 601 || r.t === 599)
  assert.equal(mid.pace, null); near(rows.find(r => r.t >= 1000).pace, 333.3, 0.5)
  assert.equal(rows[0].cad, null); assert.equal(rows.at(-1).cad, 170); assert.equal(rows.at(-1).hr, 140); near(rows.at(-1).km, s.dist[rows.at(-1).i] / 1000, 1e-9)
  assert.deepEqual(chartRows({ tt: [] }), [])
  assert.equal(smoothSpeed({ tt: [0, 1, 2], speed: [1, null, 3] }, 1)[1], 2)
}
{
  assert.equal(routePath({ lat: [0.5], lon: [0.5] }), null); assert.equal(routePath({}), null); assert.equal(routePath({ lat: [0.5, null], lon: [0.5, 0.6] }), null)
  const n = 50, lat = Array.from({ length: n }, (_, i) => 0.5 + Math.sin(i / 8) * 0.002), lon = Array.from({ length: n }, (_, i) => 0.5 + i * 0.0001)
  lat[10] = null
  const r = routePath({ lat, lon }, 320, 220)
  assert.match(r.d, /^M/); assert.equal(r.pts.length, n); assert.equal(r.pts[10], null)
  for (const p of r.pts.filter(Boolean)) { assert.ok(p[0] >= 0 && p[0] <= 320 && p[1] >= 0 && p[1] <= 220, String(p)) }
  assert.deepEqual(r.start, r.pts[0]); assert.deepEqual(r.end, r.pts[n - 1])
  const tiny = routePath({ lat: [0.5, 0.5], lon: [0.5, 0.5] }, 100, 80, 10)
  assert.ok(tiny.pts.every(p => p[0] >= 0 && p[0] <= 100 && p[1] >= 0 && p[1] <= 80))
}

// ---- demo data ----
{
  const g = generateDemo(), files = generateDemoFitFiles(g.activities), ws = []
  for (const { name, bytes } of files) {
    const { workouts } = normalizeFit(decodeFit(bytes), { fileName: name })
    for (const { workout, series } of workouts) { workout.derived = deriveWorkout(workout, series); ws.push(workout) }
  }
  assert.ok(ws.length >= 20)
  for (const w of ws) { assert.ok(w.derived.eff >= 0.6 && w.derived.eff <= 2.5, `${w.id} eff ${w.derived.eff}`); assert.equal(w.derived.version, ANALYSIS_VERSION) }
  const shuffled = [...ws].reverse(), runs = runsOf(shuffled)
  assert.equal(runs.length, ws.length)
  assert.ok(runs.every((r, i) => i === 0 || r.startTs >= runs[i - 1].startTs))
  assert.equal(runsOf([{ type: 'cycling', derived: {}, startTs: 1 }, { type: 'running', startTs: 2 }]).length, 0)
}

console.log('fitanalysis tests passed')
