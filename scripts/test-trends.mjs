import assert from 'node:assert/strict'
const root = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const t = await import(`${root}/src/pages/trendLogic.js`)

assert.equal(t.defaultGranularity(7), 'day'); assert.equal(t.defaultGranularity(30), 'day')
assert.equal(t.defaultGranularity(60), 'week'); assert.equal(t.defaultGranularity(120), 'week'); assert.equal(t.defaultGranularity(365), 'month')
assert.deepEqual(t.allowedGranularities(7), ['day']); assert.deepEqual(t.allowedGranularities(30), ['day', 'week'])
assert.deepEqual(t.allowedGranularities(120), ['day', 'week', 'month'])

// window math across month and year boundaries (and leap day)
assert.deepEqual(t.windowFor('2026-10-30', 30), { from: '2026-10-01', to: '2026-10-30' })
assert.deepEqual(t.windowFor('2026-01-05', 7), { from: '2025-12-30', to: '2026-01-05' })
assert.deepEqual(t.windowFor('2024-03-01', 7), { from: '2024-02-24', to: '2024-03-01' })
assert.deepEqual(t.windowFor('2026-10-25', 365), { from: '2025-10-26', to: '2026-10-25' })
// previous window is adjacent, equal length
for (const [end, r] of [['2026-10-30', 30], ['2026-01-05', 7], ['2026-03-02', 60], ['2026-10-25', 365]]) {
  const w = t.windowFor(end, r), p = t.previousWindow(w)
  const len = x => (Date.parse(x.to) - Date.parse(x.from)) / 86400000 + 1
  assert.equal(len(p), r); assert.equal(len(w), r)
  assert.equal(t.windowFor(p.to, 1).from, p.to); assert.equal(Date.parse(w.from) - Date.parse(p.to), 86400000)
}
assert.deepEqual(t.previousWindow({ from: '2026-10-01', to: '2026-10-30' }), { from: '2026-09-01', to: '2026-09-30' })
// shifting and bounds
assert.equal(t.shiftEnd('2026-10-20', 30, -1, '2026-10-25'), '2026-09-20')
assert.equal(t.shiftEnd('2026-10-20', 30, 1, '2026-10-25'), '2026-10-25')
assert.equal(t.canGoNext(t.windowFor('2026-10-25', 30), '2026-10-25'), false)
assert.equal(t.canGoNext(t.windowFor('2026-10-20', 30), '2026-10-25'), true)
assert.equal(t.canGoPrev({ from: '2026-10-01', to: '2026-10-30' }, '2026-10-01'), false)
assert.equal(t.canGoPrev({ from: '2026-10-02', to: '2026-10-31' }, '2026-10-01'), true)
assert.equal(t.canGoPrev({ from: '2026-10-02', to: '2026-10-31' }, null), false)
// param resolution
assert.deepEqual(t.resolveParams({}, '2026-10-25'), { range: 30, g: 'day', end: '2026-10-25' })
assert.deepEqual(t.resolveParams({ range: '365' }, '2026-10-25'), { range: 365, g: 'month', end: '2026-10-25' })
assert.deepEqual(t.resolveParams({ range: '7', g: 'month', end: '2030-01-01' }, '2026-10-25'), { range: 7, g: 'day', end: '2026-10-25' })
assert.deepEqual(t.resolveParams({ range: '60', g: 'day', end: '2026-09-01' }, '2026-10-25'), { range: 60, g: 'day', end: '2026-09-01' })
assert.equal(t.resolveParams({ range: '99', end: 'garbage' }, '2026-10-25').range, 30)
// labels, csv
assert.match(t.windowLabel({ from: '2026-10-01', to: '2026-10-30' }), /^1 Oct – 30 Oct 2026$/)
assert.match(t.windowLabel({ from: '2025-12-30', to: '2026-01-05' }), /2025.*2026/)
assert.equal(t.csvFilename('steps', { from: '2026-10-01', to: '2026-10-30' }), 'mk-fitness-steps-2026-10-01-to-2026-10-30.csv')
assert.deepEqual(t.csvRows([{ date: '2026-10-01', value: 1234.5678 }, { date: '2026-10-02', value: null }], 'day'), [{ date: '2026-10-01', value: 1234.568 }, { date: '2026-10-02', value: '' }])
assert.deepEqual(t.csvRows([{ date: '2026-09-28', value: 5, coverage: 0.857142 }], 'week'), [{ date: '2026-09-28', value: 5, coverage: 0.86 }])
assert.equal(t.csvColumns('day').length, 2); assert.equal(t.csvColumns('month').length, 3)
console.log('trends tests passed')
