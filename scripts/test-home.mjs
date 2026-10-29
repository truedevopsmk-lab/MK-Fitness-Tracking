import assert from 'node:assert/strict'
import { recoveryBreakdown, recoveryFor, recoverySeries, weekGrid, intensityWeek, deltaVs7, headlineFor, latestActivity } from '../src/lib/homeLogic.js'

const day = (date, o = {}) => ({ date, ...o })
const days = {}
for (let i = 1; i <= 8; i += 1) { const d = `2026-10-${String(24 - i).padStart(2, '0')}`; days[d] = day(d, { hrv: { lastNight: 60 }, heartHr: 1, heartRate: { resting: 50 + i } }) }
days['2026-10-24'] = day('2026-10-24', { sleep: { score: 85, avgHrv: 66 }, hrv: { lastNight: 66, weeklyAvg: 60 }, bodyBattery: { high: 80 }, intensity: { moderate: 30, vigorous: 10, goal: 150 }, steps: { total: 5000, goal: 10000 } })
let r = recoveryFor(days, '2026-10-24')
assert.equal(r.kind, 'estimate'); assert.ok(r.score >= 75 && r.score <= 100, `score ${r.score}`); assert.equal(r.parts.length, 3)
assert.equal(headlineFor(r.score), 'Ready for a strong day')
days['2026-10-24'].readiness = { score: 40 }
r = recoveryFor(days, '2026-10-24'); assert.equal(r.kind, 'garmin'); assert.equal(r.score, 40); assert.equal(headlineFor(40), 'Prioritize recovery')
assert.equal(recoveryFor({}, '2026-10-24').score, null)
const w = weekGrid(days, [{ day: '2026-10-24' }], '2026-10-25')
assert.equal(w.length, 7); assert.equal(w[0].date, '2026-10-19'); assert.equal(w[6].isToday, true); assert.equal(w[5].acts, 1); assert.equal(w[5].steps, 5000)
assert.deepEqual(intensityWeek(days, '2026-10-25'), { total: 50, goal: 150, any: true })
const d = deltaVs7(days, 'restingHr', '2026-10-24'); assert.ok(d && d.delta < 0)
assert.equal(latestActivity([{ startTs: 1 }, { startTs: 5 }]).startTs, 5)
// sleep need comes from the setting when the night has none: 6.5 h is short vs 8 h, fine vs 6.5 h
const nd = { ...days, '2026-10-24': { ...days['2026-10-24'], readiness: undefined, sleep: { score: 85, durationSec: 6.5 * 3600 } } }
assert.ok(recoveryFor(nd, '2026-10-24').parts.some(p => p.key === 'short'))
assert.ok(!recoveryFor(nd, '2026-10-24', { sleepNeedHours: 6.5 }).parts.some(p => p.key === 'short'))
assert.ok(recoveryFor(nd, '2026-10-24', { sleepNeedHours: 9.5 }).score <= 70)
// series: one value per day, no carry-over from earlier days
const rs = recoverySeries(nd, '2026-10-23', '2026-10-25')
assert.deepEqual(rs.map(p => p.date), ['2026-10-23', '2026-10-24', '2026-10-25'])
assert.equal(rs[2].value, null); assert.equal(rs[1].value, recoveryFor(nd, '2026-10-24').score)
// breakdown: same score as recoveryFor, shares and contributions add up
const sum = (a, f) => a.reduce((t, x) => t + f(x), 0)
const same = (dd, asOf, o) => { const a = recoveryFor(dd, asOf, o), b = recoveryBreakdown(dd, asOf, o); assert.equal(b.score, a.score); assert.equal(b.kind, a.kind); assert.equal(b.date, a.date); return b }
let bd = same(nd0(), '2026-10-24')
function nd0() { const x = JSON.parse(JSON.stringify(days)); delete x['2026-10-24'].readiness; return x }
assert.equal(bd.kind, 'estimate'); assert.equal(bd.cap, null); assert.equal(bd.score, bd.uncapped)
assert.deepEqual(bd.factors.map(f => f.key), ['sleep', 'hrv', 'bb'])
assert.ok(Math.abs(sum(bd.factors, f => f.share) - 1) < 1e-9); assert.equal(Math.round(sum(bd.factors, f => f.contribution)), bd.uncapped)
assert.ok(bd.factors.every(f => f.band?.label && f.date === '2026-10-24'))
bd = same(nd, '2026-10-24', { sleepNeedHours: 9.5 })
assert.ok(bd.cap); assert.equal(bd.cap.limit, 55)
assert.equal(bd.score, Math.min(bd.uncapped, bd.cap.limit)); assert.ok(bd.uncapped > bd.cap.limit)
assert.equal(bd.cap.shortSec, bd.cap.needSec - bd.cap.durationSec)
assert.equal(same(nd, '2026-10-24', { sleepNeedHours: 6.5 }).cap, null)
assert.equal(bd.factors[0].needSource, 'setting')
bd = same(days, '2026-10-24'); assert.equal(bd.kind, 'garmin'); assert.equal(bd.factors.length, 3)
assert.equal(bd.uncapped, null); assert.equal(bd.cap, null); assert.equal(bd.drag, null)
bd = same({}, '2026-10-24'); assert.deepEqual([bd.score, bd.factors, bd.context, bd.change], [null, [], [], null])
assert.deepEqual(bd.missing.map(m => m.key), ['sleep', 'hrv', 'bb'])
// HRV reading without a baseline is listed as not counted
const nb = { '2026-10-24': day('2026-10-24', { sleep: { score: 80 }, hrv: { lastNight: 60 }, bodyBattery: { high: 70 } }) }
bd = same(nb, '2026-10-24'); assert.ok(!bd.factors.some(f => f.key === 'hrv')); assert.match(bd.missing.find(m => m.key === 'hrv').reason, /3 nights/)
// context: Garmin 7-day resting HR when present, else our own mean; respiration needs 3 prior nights
const cx = nd0(); cx['2026-10-24'].heartRate = { resting: 52, resting7d: 55 }
let c = recoveryBreakdown(cx, '2026-10-24').context.find(x => x.key === 'restingHr')
assert.equal(c.source, 'garmin'); assert.equal(c.base, 55); assert.equal(c.delta, -3); assert.equal(c.n, 7)
delete cx['2026-10-24'].heartRate.resting7d
c = recoveryBreakdown(cx, '2026-10-24').context.find(x => x.key === 'restingHr')
assert.equal(c.source, 'own'); assert.equal(c.n, 7); assert.equal(c.base, 54); assert.equal(c.delta, 52 - c.base)
assert.ok(!recoveryBreakdown(cx, '2026-10-24').context.some(x => x.key === 'respiration'))
cx['2026-10-24'].sleep.avgRespiration = 15
for (const n of [23, 22]) cx[`2026-10-${n}`].sleep = { avgRespiration: 14 }
assert.ok(!recoveryBreakdown(cx, '2026-10-24').context.some(x => x.key === 'respiration'))
cx['2026-10-21'].sleep = { avgRespiration: 14 }
c = recoveryBreakdown(cx, '2026-10-24').context.find(x => x.key === 'respiration')
assert.equal(c.n, 3); assert.equal(c.base, 14); assert.equal(c.delta, 1); assert.equal(c.source, 'own')
// change vs the previous day
const cg = nd0(); cg['2026-10-23'] = day('2026-10-23', { sleep: { score: 60 }, hrv: { lastNight: 50, weeklyAvg: 60 }, bodyBattery: { high: 50 } })
bd = recoveryBreakdown(cg, '2026-10-24'); const pv = recoveryFor(cg, '2026-10-23', { lookbackDays: 0 })
assert.equal(bd.change.prevScore, pv.score); assert.equal(bd.change.delta, bd.score - pv.score); assert.equal(bd.change.prevDate, '2026-10-23')
// status days: left out of baselines
{
  const h = {}
  for (let i = 1; i <= 8; i += 1) { const d = `2026-10-${String(24 - i).padStart(2, '0')}`; h[d] = day(d, { hrv: { lastNight: 80 }, heartRate: { resting: 50 } }) }
  h['2026-10-23'].hrv.lastNight = 60
  h['2026-10-24'] = day('2026-10-24', { sleep: { score: 85 }, hrv: { lastNight: 66, weeklyAvg: 60 }, bodyBattery: { high: 80 }, heartRate: { resting: 52, resting7d: 55 } })
  const ex = new Set(['2026-10-23'])
  const plain = recoveryFor(h, '2026-10-24'), skip = recoveryFor(h, '2026-10-24', { exclude: ex })
  assert.ok(skip.score < plain.score, `${skip.score} < ${plain.score}`)
  assert.equal(recoveryFor(h, '2026-10-24', { exclude: new Set(['2020-01-01']) }).score, plain.score)
  const c1 = recoveryBreakdown(h, '2026-10-24').context.find(x => x.key === 'restingHr')
  assert.equal(c1.source, 'garmin')
  const c2 = recoveryBreakdown(h, '2026-10-24', { exclude: ex }).context.find(x => x.key === 'restingHr')
  assert.equal(c2.source, 'own'); assert.equal(c2.base, 50); assert.equal(c2.n, 6)
  assert.equal(recoverySeries(h, '2026-10-24', '2026-10-24', { exclude: ex })[0].value, skip.score)
  // deltaVs7 skips excluded dates
  const dv = { '2026-10-24': day('2026-10-24', { heartRate: { resting: 60 } }) }
  for (let i = 1; i <= 7; i += 1) { const d = `2026-10-${String(24 - i).padStart(2, '0')}`; dv[d] = day(d, { heartRate: { resting: i === 1 ? 80 : 50 } }) }
  assert.equal(deltaVs7(dv, 'restingHr', '2026-10-24').avg, (80 + 6 * 50) / 7)
  assert.equal(deltaVs7(dv, 'restingHr', '2026-10-24', { exclude: new Set(['2026-10-23']) }).avg, 50)
}
console.log('home tests passed')
