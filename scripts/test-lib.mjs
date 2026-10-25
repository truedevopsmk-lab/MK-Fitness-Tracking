import assert from 'node:assert/strict'
const root = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const d = await import(`${root}/src/lib/dates.js`)
const s = await import(`${root}/src/lib/stats.js`)
const m = await import(`${root}/src/data/merge.js`)
const f = await import(`${root}/src/lib/format.js`)
const csv = await import(`${root}/src/lib/csv.js`)

assert.equal(d.toDay(new Date(2026, 9, 25, 0, 0)), '2026-10-25', 'local midnight stays same day')
assert.equal(d.addDays('2026-10-31', 1), '2026-11-01')
assert.equal(d.addDays('2026-03-01', -1), '2026-02-28')
assert.equal(d.daysBetween('2025-10-26', '2026-10-25'), 364)
const ch = d.chunkRange('2025-10-26', '2026-10-25', 27)
assert.equal(ch[0][0], '2025-10-26'); assert.equal(ch.at(-1)[1], '2026-10-25')
for (let i = 1; i < ch.length; i++) assert.equal(d.addDays(ch[i-1][1], 1), ch[i][0], 'contiguous, no overlap')
assert.equal(ch.length, Math.ceil(365 / 27))
assert.deepEqual(d.chunkRange('2026-10-31', '2026-11-01', 27), [['2026-10-31', '2026-11-01']])
assert.equal(d.eachDay('2026-10-30', '2026-11-02').length, 4)
assert.equal(d.weekStart('2026-10-25'), '2026-10-19', 'Sunday → previous Monday')
assert.equal(d.weekStart('2026-10-19'), '2026-10-19')
assert.equal(d.dayOf('2026-10-24T23:30:00.0'), '2026-10-24', 'garmin local ts keeps day')
assert.equal(d.dayOf('2026-10-24 06:12:00'), '2026-10-24')
assert.equal(d.dayOf('2026-10-24T20:00:00Z'), d.toDay(new Date('2026-10-24T20:00:00Z')), 'UTC instant → local day')

const days = { '2026-10-20': { sleep: { score: 80 } }, '2026-10-22': { sleep: { score: 60 } } }
const ser = s.dailySeries(days, '2026-10-20', '2026-10-23', r => r.sleep?.score)
assert.deepEqual(ser.map(p => p.value), [80, null, 60, null])
const sum = s.summarize(ser, [{ value: 50 }, { value: 50 }])
assert.equal(sum.avg, 70); assert.equal(sum.missing, 2); assert.equal(sum.change, 40); assert.equal(sum.delta, 20)
const wk = s.bucketSeries(s.dailySeries({}, '2026-10-19', '2026-11-01', () => 1), 'week', 'sum')
assert.equal(wk.length, 2); assert.equal(wk[0].value, null)
assert.ok(Math.abs(s.correlation([[1,2],[2,4],[3,6],[4,8],[5,10]]) - 1) < 1e-9)

// merge never deletes
const a = m.mergeDays({ '2026-10-20': { date: '2026-10-20', sleep: { score: 80, deepSec: 3600 }, steps: { total: 9000 } } },
  { '2026-10-20': { sleep: { score: null, remSec: 5400 }, steps: { total: 9500 } }, 'garbage': { x: 1 } })
assert.deepEqual(a.days['2026-10-20'], { date: '2026-10-20', sleep: { score: 80, deepSec: 3600, remSec: 5400 }, steps: { total: 9500 } })
assert.equal(a.changed.length, 1)
const acts = m.mergeActivities([{ id: '1', startTs: 1, name: 'old', avgHr: 140 }], [{ id: '1', startTs: 1, name: 'new', avgHr: null }, { id: '2', startTs: 5 }])
assert.deepEqual(acts.activities.map(x => x.id), ['2', '1']); assert.equal(acts.activities[1].avgHr, 140); assert.equal(acts.activities[1].name, 'new')

assert.equal(f.fmtDuration(27120), '7h 32m'); assert.equal(f.fmtDuration(2520), '42m')
assert.equal(csv.toCsv([{ a: 'x,y', b: 'q"t' }], [{ key: 'a' }, { key: 'b', label: 'B' }]), 'a,B\r\n"x,y","q""t"')
console.log('lib tests: all passed')
