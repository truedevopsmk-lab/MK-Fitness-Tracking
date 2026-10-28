import assert from 'node:assert/strict'
import { normMinutes, clockFromNorm, stageBreakdown, timeInBedSec, needSecFor, sleepDebt, consistency, recoveryPairs, buildRows, stageSummary, SUB_SCORES, subScoreRows, subScoreSummary, subScoreTally } from '../src/pages/sleepLogic.js'

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
// sub-scores
const sub = (q, o = {}) => ({ value: null, qualifier: q, optimalLow: null, optimalHigh: null, ...o })
assert.equal(subScoreRows(null), null); assert.equal(subScoreRows({}), null); assert.equal(subScoreRows({ subScores: {} }), null)
assert.equal(subScoreRows({ subScores: { rem: sub('WEIRD'), deep: sub(null) } }), null)
const full = { durationSec: 7 * 3600 + 720, avgSleepStress: 18.2, awakeCount: 3, subScores: {
  rem: sub('POOR', { value: 12, optimalLow: 21, optimalHigh: 31 }), deep: sub('EXCELLENT', { value: 18, optimalLow: 16, optimalHigh: 33 }), light: sub('FAIR', { value: 60.4, optimalLow: 30, optimalHigh: 64 }),
  duration: sub('GOOD', { optimalLow: 27000, optimalHigh: 32400 }), stress: sub('FAIR', { optimalLow: 0, optimalHigh: 15 }), awakenings: sub('FAIR', { optimalLow: 0, optimalHigh: 1 }), restlessness: sub('GOOD', { optimalLow: 0, optimalHigh: 30 }), bogus: sub('GOOD') } }
const fr = subScoreRows(full)
assert.deepEqual(fr.map(r => r.key), ['duration', 'stress', 'awakenings', 'restlessness', 'deep', 'light', 'rem'])
assert.deepEqual(fr.map(r => r.tone), ['good', 'warning', 'warning', 'good', 'good', 'warning', 'serious'])
assert.equal(fr[0].qualLabel, 'Good'); assert.equal(fr[0].group, 'night'); assert.equal(fr[4].group, 'stages')
assert.equal(fr[0].detail, '7h 12m asleep · optimal 7.5–9 h')
assert.equal(fr[1].detail, 'Average 18 · optimal 15 or lower')
assert.equal(fr[2].detail, 'Woke 3 times · optimal 1 or fewer')
assert.equal(fr[3].detail, 'Movement while asleep')
assert.equal(fr[4].detail, '18% of sleep · optimal 16–33%')
const dOf = (key, sl, o) => subScoreRows({ ...sl, subScores: { [key]: sub('GOOD', o) } })[0].detail
assert.equal(dOf('awakenings', { awakeCount: 0 }, { optimalLow: 0, optimalHigh: 1 }), 'No awakenings · optimal 1 or fewer')
assert.equal(dOf('awakenings', { awakeCount: 1 }, { optimalLow: 2, optimalHigh: 4 }), 'Woke once · optimal 2–4')
assert.equal(dOf('stress', { avgSleepStress: 20 }, { optimalLow: 5, optimalHigh: 15 }), 'Average 20 · optimal 5–15')
assert.equal(dOf('duration', {}, { optimalLow: 27000, optimalHigh: 32400 }), 'Optimal 7.5–9 h')
assert.equal(dOf('stress', {}, {}), '')
// summary
assert.equal(subScoreSummary(null), null); assert.equal(subScoreSummary([]), null)
const sg = subScoreSummary(subScoreRows({ subScores: { deep: sub('GOOD'), rem: sub('EXCELLENT') } }))
assert.deepEqual(sg, { tone: 'good', held: [], text: 'Every part Garmin rated was good or better.' })
const sw = subScoreSummary(fr)
assert.deepEqual(sw.held, ['rem', 'stress', 'awakenings', 'light']); assert.equal(sw.tone, 'warning')
assert.equal(sw.text, 'REM sleep, sleep stress, awakenings and light sleep held your score back.')
const sm = k => subScoreSummary(subScoreRows({ subScores: k }))
assert.equal(sm({ rem: sub('FAIR') }).text, 'REM sleep held your score back.')
assert.equal(sm({ stress: sub('FAIR'), awakenings: sub('POOR') }).text, 'Awakenings and sleep stress held your score back.')
assert.equal(sm({ stress: sub('FAIR'), awakenings: sub('POOR'), rem: sub('POOR') }).text, 'Awakenings, REM sleep and sleep stress held your score back.')
// tally
const td = { a: { sleep: { subScores: { stress: sub('FAIR'), rem: sub('GOOD'), deep: sub('POOR') } } }, b: { sleep: { subScores: { stress: sub('GOOD'), rem: sub('POOR'), deep: sub('WEIRD') } } }, c: { sleep: {} }, d: { sleep: { subScores: { rem: sub(null) } } } }
const ty = subScoreTally(td, ['a', 'b', 'c', 'd', 'zz'])
assert.equal(ty.nights, 2)
assert.deepEqual(ty.items.map(i => [i.key, i.rated, i.low]), [['deep', 1, 1], ['stress', 2, 1], ['rem', 2, 1]])
assert.deepEqual(ty.items.map(i => i.key), ['deep', 'stress', 'rem'])
assert.equal(ty.text, 'Deep sleep rated fair or poor most often: 1 of 1 nights.'); assert.equal(ty.items[0].label, 'Deep sleep')
const tg = subScoreTally({ a: { sleep: { subScores: { rem: sub('GOOD') } } }, b: { sleep: { subScores: { rem: sub('EXCELLENT') } } } }, ['a', 'b'])
assert.equal(tg.text, 'Every part rated good or better on all 2 nights.')
const t0 = subScoreTally({}, ['a']); assert.equal(t0.nights, 0); assert.equal(t0.text, null); assert.deepEqual(t0.items, [])
assert.equal(SUB_SCORES.length, 7)
// demo smoke
const { generateDemo } = await import('../src/data/demo.js')
const { eachDay, addDays } = await import('../src/lib/dates.js')
const demo = generateDemo(), dm = {}
for (const d of demo.days) dm[d.date] = d
const lastDay = Object.keys(dm).sort().at(-1)
assert.equal(subScoreRows(dm[lastDay].sleep).length, 7)
const win = eachDay(addDays(lastDay, -29), lastDay)
assert.equal(subScoreTally(dm, win).nights, win.filter(x => dm[x]?.sleep?.subScores).length)
assert.ok(subScoreTally(dm, win).nights >= 28)
console.log('sleep logic ok')
