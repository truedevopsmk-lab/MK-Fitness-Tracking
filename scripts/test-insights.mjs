import assert from 'node:assert/strict'
const root = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const { computeInsights, DETECTORS_INFO } = await import(`${root}/src/lib/insights.js`)
const { addDays, parseDay } = await import(`${root}/src/lib/dates.js`)
const { generateDemo } = await import(`${root}/src/data/demo.js`)

const ASOF = '2026-10-25' // a Sunday
const H = 3600
const build = (n, fn) => { const days = {}; for (let i = 0; i < n; i += 1) { const date = addDays(ASOF, -i); days[date] = { date, ...fn(i, date) } } return days }
const find = (list, id) => list.find(x => x.id === id)
const run = (days, acts = []) => computeInsights(days, acts, { asOf: ASOF })

// robustness
assert.deepEqual(run({}), []); assert.deepEqual(computeInsights(null, null, { asOf: ASOF }), [])
assert.doesNotThrow(() => run({ [ASOF]: {}, '2026-10-24': { sleep: null, stress: {} } }))

// 1 sleep -> body battery
let days = build(60, i => ({ sleep: { durationSec: (i % 2 ? 8 : 6) * H, bodyBatteryChange: i % 2 ? 60 : 45 } }))
let ins = find(run(days), 'sleep-7h-bb')
assert.ok(ins, 'sleep-bb fires'); assert.equal(ins.title, 'Your Body Battery recovered better after nights with more than 7 hours of sleep.')
assert.ok(ins.body.includes('+60') && ins.body.includes('+45')); assert.ok(ins.evidence.includes('60 nights'))
assert.ok(!find(run(build(60, i => ({ sleep: { durationSec: (i % 2 ? 8 : 6) * H, bodyBatteryChange: i % 2 ? 50 : 47 } }))), 'sleep-7h-bb'), 'small effect silent')
assert.ok(!find(run(build(12, i => ({ sleep: { durationSec: (i % 2 ? 8 : 6) * H, bodyBatteryChange: i % 2 ? 60 : 45 } }))), 'sleep-7h-bb'), 'sample guard (6 per side)')

// 2 poor sleep -> stress
days = build(60, i => ({ sleep: { score: i % 3 === 0 ? 50 : 80 }, stress: { avg: i % 3 === 0 ? 45 : 35 } }))
ins = find(run(days), 'poor-sleep-stress'); assert.ok(ins); assert.equal(ins.title, 'Stress was higher on days following poor sleep.')
assert.ok(!find(run(build(60, i => ({ sleep: { score: i % 3 === 0 ? 50 : 80 }, stress: { avg: i % 3 === 0 ? 37 : 35 } }))), 'poor-sleep-stress'))
assert.ok(!find(run(build(12, i => ({ sleep: { score: i % 3 === 0 ? 50 : 80 }, stress: { avg: i % 3 === 0 ? 45 : 35 } }))), 'poor-sleep-stress'), 'sample guard')

// 3 HRV streak
const hrvDays = low => build(30, i => ({ hrv: { lastNight: i < low ? 40 : 60, baselineLow: 50, baselineHigh: 70 } }))
ins = find(run(hrvDays(4)), 'hrv-below-baseline'); assert.ok(ins); assert.equal(ins.title, 'Your HRV has been below its recent baseline for 4 days.')
assert.ok(!find(run(hrvDays(2)), 'hrv-below-baseline'), 'two days is not a streak')
days = build(30, i => ({ hrv: { lastNight: i < 4 ? 40 : 60 } })) // no Garmin baseline: trailing average
assert.ok(find(run(days), 'hrv-below-baseline'), 'trailing baseline fallback')

// 4 steps month over month
const stepsDays = (cur, prev) => build(60, (i, date) => ({ steps: { total: date.startsWith('2026-10') ? cur : date.startsWith('2026-09') ? prev : 8000 } }))
ins = find(run(stepsDays(9440, 8000)), 'steps-month'); assert.ok(ins); assert.equal(ins.title, 'Your average steps increased 18% this month.')
assert.ok(!find(run(stepsDays(8400, 8000)), 'steps-month'), '5% is silent')
assert.ok(!find(run(build(15, (i, date) => ({ steps: { total: date.startsWith('2026-10') ? 12000 : 6000 } }))), 'steps-month'), 'needs 10 days last month')

// 5 resting HR
ins = find(run(build(40, i => ({ heartRate: { resting: i < 7 ? 62 : 56 } }))), 'rhr-trend'); assert.ok(ins && ins.tone === 'negative')
assert.ok(!find(run(build(40, i => ({ heartRate: { resting: i < 7 ? 58 : 56 } }))), 'rhr-trend'))

// 6 bedtime consistency
const bed = (i, date) => { const base = parseDay(date).getTime() - 3600000 * 1.5; const jitter = i < 14 ? (i % 2 ? 90 : -90) : (i % 2 ? 10 : -10); return { sleep: { startTs: base + jitter * 60000, durationSec: 7 * H } } }
ins = find(run(build(50, bed)), 'bedtime-consistency'); assert.ok(ins && ins.tone === 'negative', 'worse consistency')
assert.ok(!find(run(build(50, (i, date) => bed(20, date))), 'bedtime-consistency'))

// 7 weekend sleep
const wk = (i, date) => ({ sleep: { durationSec: [0, 6].includes(parseDay(date).getDay()) ? 8.5 * H : 7 * H } })
ins = find(run(build(70, wk)), 'weekend-sleep'); assert.ok(ins && ins.title.includes('longer'))
assert.ok(!find(run(build(70, () => ({ sleep: { durationSec: 7 * H } }))), 'weekend-sleep'))

// 8 training volume + streak
const act = (day, sec = 3600) => ({ id: day + sec, day, durationSec: sec })
const acts = []
for (let i = 0; i < 35; i += 1) if (i >= 7 && i % 4 === 0) acts.push(act(addDays(ASOF, -i)))
for (let i = 0; i < 7; i += 1) acts.push(act(addDays(ASOF, -i), 5400))
ins = find(run({}, acts), 'training-volume'); assert.ok(ins, 'volume up')
const steady = []; for (let i = 0; i < 35; i += 1) if (i % 7 === 0 || i % 7 === 3) steady.push(act(addDays(ASOF, -i)))
assert.ok(!find(run({}, steady), 'training-volume'), 'steady volume is silent')
ins = find(run({}, acts), 'activity-streak'); assert.ok(ins && ins.title.includes('7 days'))
assert.ok(!find(run({}, [act(ASOF), act(addDays(ASOF, -1))]), 'activity-streak'))

// 9 stress weekday
ins = find(run(build(90, (i, date) => ({ stress: { avg: parseDay(date).getDay() === 1 ? 52 : 36 } }))), 'stress-weekday'); assert.ok(ins && ins.title.includes('Mondays'))
assert.ok(!find(run(build(90, () => ({ stress: { avg: 36 } }))), 'stress-weekday'))

// 10 standout
days = build(40, (i, date) => ({ steps: { total: (i < 7 ? 14000 : 8000) + (i % 2 ? 300 : -300) } }))
// steps also trip the dedicated month-over-month detector, so the catch-all standout must stay silent
assert.ok(find(run(days), 'steps-month') || !find(run(days), 'week-standout'), 'standout never duplicates a specific detector')
assert.ok(!run(days).some(x => x.id === 'week-standout' && run(days).some(y => y.id !== 'week-standout' && y.metrics.includes(x.metrics[0]))))
days = build(40, (i, date) => ({ heartRate: { resting: (i < 7 ? 64 : 56) + (i % 2 ? 1 : -1) } }))
ins = find(run(days), 'week-standout'); assert.ok(!ins, 'RHR standout suppressed: rhr-trend covers it'); assert.ok(find(run(days), 'rhr-trend'))
assert.ok(!find(run(build(40, i => ({ steps: { total: 8000 + (i % 2 ? 300 : -300) } }))), 'week-standout'))

// language guard
for (const x of run(build(60, i => ({ sleep: { durationSec: (i % 2 ? 8 : 6) * H, bodyBatteryChange: i % 2 ? 60 : 45, score: i % 3 ? 80 : 50 }, stress: { avg: i % 3 ? 35 : 45 } })))) {
  assert.ok(!/\b(cause|causes|caused|diagnos|disease|doctor)\b/i.test(x.title + x.body), x.id)
  assert.ok(x.strength >= 0 && x.strength <= 1)
}
assert.ok(DETECTORS_INFO.length >= 10)

// demo
const demo = generateDemo()
const out = computeInsights(demo.days.reduce((m, d) => (m[d.date] = d, m), {}), demo.activities)
// status days are left out of every detector
{
  const rd = build(40, i => ({ heartRate: { resting: i < 7 ? 62 : 56 } }))
  assert.ok(find(run(rd), 'rhr-trend'))
  const ex = new Set(Array.from({ length: 4 }, (_, i) => addDays(ASOF, -i)))
  assert.ok(!find(computeInsights(rd, [], { asOf: ASOF, exclude: ex }), 'rhr-trend'), 'recent days excluded -> silent')
  assert.ok(find(computeInsights(rd, [], { asOf: ASOF, exclude: new Set() }), 'rhr-trend'))
}

console.log(`demo insights: ${out.length}`)
out.forEach(x => console.log(` [${x.strength.toFixed(2)}] ${x.tone.padEnd(8)} ${x.title}\n        ${x.body}\n        ${x.evidence}`))
assert.ok(out.length >= 2, 'demo yields insights')
assert.deepEqual(out.map(x => x.strength), out.map(x => x.strength).sort((a, b) => b - a))
console.log('insights tests ok')
