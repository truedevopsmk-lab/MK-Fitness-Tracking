import assert from 'node:assert/strict'
import { recoveryFor, recoverySeries, weekGrid, intensityWeek, deltaVs7, headlineFor, latestActivity } from '../src/lib/homeLogic.js'

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
console.log('home tests passed')
