import assert from 'node:assert/strict'
import { normMinutes, clockFromNorm, stageBreakdown, timeInBedSec, needSecFor, sleepDebt, consistency, recoveryPairs, buildRows, stageSummary } from '../src/pages/sleepLogic.js'

const at = (d, h, m = 0) => new Date(2026, 9, d, h, m).getTime()
// bedtime normalisation wraps past midnight
assert.equal(normMinutes(at(1, 22)), 240)
assert.equal(normMinutes(at(2, 1)), 420)
assert.equal(normMinutes(at(2, 6, 30)), 750)
assert.ok(normMinutes(at(1, 23, 30)) < normMinutes(at(2, 0, 30)))
assert.equal(clockFromNorm(240), '10:00 pm')
assert.equal(clockFromNorm(420), '1:00 am')
assert.equal(clockFromNorm(240, true), '10 pm')
assert.equal(normMinutes(null), null)

// stage %
const b = stageBreakdown({ deepSec: 3600, lightSec: 14400, remSec: 5400, awakeSec: 1800 })
assert.equal(b.total, 25200)
assert.ok(Math.abs(b.items.reduce((a, i) => a + i.pct, 0) - 100) < 1e-9)
assert.equal(b.items[0].pct, (3600 / 25200) * 100)
assert.equal(stageBreakdown({}), null)

assert.equal(timeInBedSec({ startTs: at(1, 23), endTs: at(2, 7) }), 8 * 3600)
assert.equal(timeInBedSec({ durationSec: 7 * 3600, awakeSec: 1800 }), 7.5 * 3600)
assert.equal(needSecFor({ needSec: 7.5 * 3600 }, 8), 27000)
assert.equal(needSecFor({}, 8), 28800)

// debt: 3 short nights (-1h, -2h, -30m), 1 long (+3h → capped to 1h), 1 missing
const mk = (h, extra = {}) => ({ has: h != null, balance: h == null ? null : h * 3600, ...extra })
const d = sleepDebt([mk(-1), mk(-2), mk(null), mk(-0.5), mk(3)], 7, 3600)
assert.equal(d.deficit, 3.5 * 3600)
assert.equal(d.surplus, 3600)
assert.equal(d.net, 2.5 * 3600)
assert.equal(d.nights, 4)
assert.equal(sleepDebt([mk(1), mk(0.5)]).net, -1.5 * 3600) // ahead
assert.equal(sleepDebt([mk(-1), mk(-1), mk(-1)], 2).deficit, 2 * 3600) // only last n rows

// consistency across midnight: 23:30 and 00:30 are 60 min apart, not ~23h
const c = consistency([{ bedMin: normMinutes(at(1, 23, 30)), wakeMin: 750 }, { bedMin: normMinutes(at(2, 0, 30)), wakeMin: 750 }])
assert.ok(Math.abs(c.bedSd - 60 / Math.SQRT2 * Math.SQRT2 / Math.SQRT2 * Math.SQRT2) < 1e-6 || c.bedSd > 40 && c.bedSd < 45)
assert.equal(c.wakeSd, 0)
assert.equal(consistency([{ bedMin: 10, wakeMin: 20 }]).bedSd, null)

// recovery split
const rows = Array.from({ length: 10 }, (_, i) => ({ date: `d${i}`, has: true, dur: (i < 5 ? 6 : 8) * 3600, bb: i < 5 ? 40 : 60 }))
const r = recoveryPairs(rows)
assert.equal(r.n, 10); assert.equal(r.longMean, 60); assert.equal(r.shortMean, 40); assert.ok(r.r > 0.9)

// buildRows fallback for BB + need
const days = { '2026-10-24': { date: '2026-10-24', sleep: { durationSec: 7 * 3600, deepSec: 3600, lightSec: 3 * 3600, remSec: 3600, awakeSec: 1800, startTs: at(23, 23), endTs: at(24, 6), needSec: null }, bodyBattery: { charged: 55 } } }
const br = buildRows(days, '2026-10-23', '2026-10-24', 7.5)
assert.equal(br.length, 2); assert.equal(br[0].has, false); assert.equal(br[1].bb, 55); assert.equal(br[1].need, 27000); assert.equal(br[1].balance, 25200 - 27000)

// stage summary
const s = stageSummary([{ start: 0, end: 600000, stage: 'light' }, { start: 600000, end: 1200000, stage: 'deep' }, { start: 1200000, end: 1500000, stage: 'awake' }])
assert.deepEqual(s, { awakeCount: 1, firstDeepMin: 10 })
console.log('sleep logic ok')
