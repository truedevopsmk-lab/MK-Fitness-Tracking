import assert from 'node:assert/strict'
const root = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const { normalRange, rangeStatus, fmtRange, healthSeries, healthMonitor, monitorSummary, MIN_NIGHTS } = await import(`${root}/src/lib/health.js`)
const { addDays } = await import(`${root}/src/lib/dates.js`)
const { generateDemo } = await import(`${root}/src/data/demo.js`)

const ASOF = '2026-10-25'
const build = (n, fn, from = ASOF) => { const days = {}; for (let i = 0; i < n; i += 1) { const date = addDays(from, -i); const o = fn(i, date); if (o) days[date] = { date, ...o } } return days }
const rhr = v => ({ heartRate: { resting: v } })

// normalRange: alternating 54/56 over the 20 nights before ASOF
let days = build(20, i => rhr(i % 2 ? 54 : 56), addDays(ASOF, -1))
let r = normalRange(days, 'restingHr', ASOF)
assert.equal(r.source, 'own'); assert.equal(r.n, 20); assert.equal(r.avg, 55)
assert.equal(r.low, 54); assert.equal(r.high, 56) // sd 1.026 -> 53.97..56.03 rounds to 54..56
// the night itself is excluded
days[ASOF] = { date: ASOF, ...rhr(90) }
assert.deepEqual(normalRange(days, 'restingHr', ASOF), r)
// too few nights
const few = build(MIN_NIGHTS - 1, () => rhr(55), addDays(ASOF, -1))
r = normalRange(few, 'restingHr', ASOF); assert.equal(r.low, null); assert.equal(r.high, null); assert.equal(r.n, MIN_NIGHTS - 1)
assert.equal(normalRange(build(MIN_NIGHTS, () => rhr(55), addDays(ASOF, -1)), 'restingHr', ASOF).low, 54)
// Garmin HRV range wins
const hd = build(20, () => ({ hrv: { lastNight: 60 } }), addDays(ASOF, -1))
hd[ASOF] = { date: ASOF, hrv: { lastNight: 50, baselineLow: 55, baselineHigh: 70 } }
r = normalRange(hd, 'hrv', ASOF); assert.equal(r.source, 'garmin'); assert.equal(r.low, 55); assert.equal(r.high, 70)
assert.equal(normalRange(hd, 'hrv', addDays(ASOF, -1)).source, 'own')
// constant series: MIN_HALF applies
r = normalRange(build(20, () => rhr(52), addDays(ASOF, -1)), 'restingHr', ASOF); assert.equal(r.low, 51); assert.equal(r.high, 53)

// rangeStatus tones
const rg = { low: 52, high: 58 }
let s = rangeStatus('restingHr', 60, rg); assert.deepEqual([s.status, s.label, s.tone], ['above', 'Above range', 'warning'])
s = rangeStatus('restingHr', 50, rg); assert.deepEqual([s.status, s.tone], ['below', 'neutral'])
assert.equal(rangeStatus('hrv', 40, rg).tone, 'warning'); assert.equal(rangeStatus('hrv', 70, rg).tone, 'neutral')
assert.equal(rangeStatus('respiration', 20, rg).tone, 'warning'); assert.equal(rangeStatus('respiration', 1, rg).tone, 'warning')
s = rangeStatus('restingHr', 55, rg); assert.deepEqual([s.status, s.label, s.tone], ['within', 'Within range', 'good'])
assert.equal(rangeStatus('respiration', 14.96, { low: 13.8, high: 15 }).status, 'within')
assert.equal(rangeStatus('restingHr', null, rg), null); assert.equal(rangeStatus('restingHr', 55, { low: null, high: null }), null)

// fmtRange
assert.equal(fmtRange('restingHr', { low: 52, high: 58 }), '52–58 bpm')
assert.equal(fmtRange('respiration', { low: 13.8, high: 14.9 }), '13.8–14.9 br/min')
assert.equal(fmtRange('respiration', { low: 14, high: 15 }), '14.0–15.0 br/min')
assert.equal(fmtRange('spo2', { low: 94, high: 98 }), '94–98%')

// healthMonitor: three nights above range, a missing night breaks the streak
const mk = (hi, extra = () => ({})) => build(40, (i, date) => {
  if (i < 3 && hi) return { heartRate: { resting: 70 }, hrv: { lastNight: 60 }, sleep: { avgRespiration: 15 }, ...extra(i) }
  return { heartRate: { resting: 54 + (i % 2) * 2 }, hrv: { lastNight: 60 + (i % 2) * 2 }, sleep: { avgRespiration: 15 + (i % 2) * .4 }, ...extra(i) }
})
days = mk(true)
let m = healthMonitor(days, ASOF)
assert.equal(m.total, 3); assert.equal(m.pending.length, 0); assert.equal(m.date, ASOF)
assert.deepEqual(m.vitals.map(v => v.key), ['restingHr', 'hrv', 'respiration'])
const rv = m.vitals[0]; assert.equal(rv.status, 'above'); assert.equal(rv.streak, 3); assert.equal(rv.statusLabel, 'Above range'); assert.equal(rv.tone, 'warning')
assert.equal(m.vitals[1].streak, 0); assert.equal(m.outside, 1); assert.equal(m.tone, 'warning')
const brk = { ...days }; delete brk[addDays(ASOF, -1)]
assert.equal(healthMonitor(brk, ASOF).vitals[0].streak, 1)
// spo2 appears only with data
assert.ok(!m.vitals.some(v => v.key === 'spo2') && !m.pending.some(p => p.key === 'spo2'))
m = healthMonitor(mk(false, () => ({ sleep: { avgRespiration: 15, avgSpo2: 96 } })), ASOF)
assert.equal(m.vitals.find(v => v.key === 'spo2').value, 96)
// all within -> good
m = healthMonitor(mk(false), ASOF); assert.equal(m.outside, 0); assert.equal(m.tone, 'good')
// pending reasons
m = healthMonitor(build(5, () => rhr(55)), ASOF)
assert.equal(m.total, 0); assert.equal(m.tone, null); assert.equal(m.date, null)
assert.deepEqual(m.pending.map(p => [p.key, p.reason]), [['restingHr', 'no-range'], ['hrv', 'no-value'], ['respiration', 'no-value']])
assert.equal(m.pending[0].n, 4)
m = healthMonitor(mk(false), addDays(ASOF, 10)); assert.equal(m.total, 0); assert.ok(m.pending.every(p => p.reason === 'no-value'))
// neutral tone: RHR below range
const low = build(40, i => rhr(i === 0 ? 40 : 55 + (i % 2)))
m = healthMonitor(low, ASOF); assert.equal(m.vitals[0].status, 'below'); assert.equal(m.tone, 'neutral')

// healthSeries
const hs = healthSeries(mk(true), 'restingHr', addDays(ASOF, -4), ASOF)
assert.equal(hs.length, 5); assert.equal(hs[0].date, addDays(ASOF, -4))
assert.deepEqual(hs.map(p => p.out), [false, false, true, true, true])
assert.ok(hs.every(p => p.low != null && p.high != null && p.low < p.high))
const gap = healthSeries({}, 'restingHr', addDays(ASOF, -1), ASOF)
assert.deepEqual(gap.map(p => [p.value, p.low, p.status, p.out]), [[null, null, null, false], [null, null, null, false]])

// monitorSummary
assert.equal(monitorSummary(healthMonitor({}, ASOF)), null)
let su = monitorSummary(healthMonitor(mk(false), ASOF))
assert.deepEqual(su, { tone: 'good', title: 'All 3 vitals within your normal range', sub: 'Resting HR, HRV and breathing rate', sentence: 'All 3 vitals within your normal range: resting HR, HRV and breathing rate.' })
su = monitorSummary(healthMonitor(mk(true), ASOF))
assert.deepEqual(su, { tone: 'warning', title: 'Resting HR above your normal range', sub: '3 nights in a row', sentence: 'Resting HR above your normal range for 3 nights in a row.' })
su = monitorSummary(healthMonitor(low, ASOF)); assert.equal(su.title, 'Resting HR below your normal range'); assert.match(su.sub, /^Normal \d+–\d+ bpm$/); assert.match(su.sentence, /^Resting HR below your normal range of \d+–\d+ bpm\.$/)
const two = mk(false); two[ASOF] = { ...two[ASOF], heartRate: { resting: 70 }, hrv: { lastNight: 30 } }
su = monitorSummary(healthMonitor(two, ASOF))
assert.deepEqual(su, { tone: 'warning', title: '2 of 3 vitals outside your normal range', sub: 'Resting HR above · HRV below', sentence: '2 of 3 vitals outside your normal range: resting HR above and HRV below.' })
assert.equal(monitorSummary({ total: 1, outside: 0, tone: 'good', vitals: [{ key: 'hrv', status: 'within' }] }).title, 'HRV within your normal range')

// demo smoke test
const demo = generateDemo(), dd = {}
for (const d of demo.days) dd[d.date] = d
const end = Object.keys(dd).sort().at(-1)
m = healthMonitor(dd, end)
assert.equal(m.total, 3); assert.equal(m.pending.length, 0); assert.ok(!m.vitals.some(v => v.key === 'spo2'))
assert.ok(m.vitals.every(v => v.range.low != null && v.range.low < v.range.high))
console.log('health: ok')
