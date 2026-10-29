import assert from 'node:assert/strict'
import { effortPoints, effortFor, effortTarget, effortStatus, statusText, effortSeries } from '../src/lib/effort.js'
import { addDays } from '../src/lib/dates.js'

const asOf = '2026-10-25'
const steps = total => ({ steps: { total } })
const history = (n, total) => { const d = {}; for (let i = 1; i <= n; i += 1) d[addDays(asOf, -i)] = steps(total); return d }

// usual day = 50, plus a 20-load workout = 75
let days = { ...history(28, 10000), [asOf]: steps(10000) }
let e = effortFor(days, [], asOf)
assert.equal(e.usual, 20); assert.equal(e.score, 50); assert.equal(e.reason, null)
e = effortFor(days, [{ day: asOf, trainingLoad: 20, steps: 0 }], asOf)
assert.equal(e.points, 40); assert.equal(e.score, 75)

// workout steps are subtracted
const p = effortPoints({ [asOf]: steps(10000) }, [{ day: asOf, steps: 4000 }])[asOf]
assert.equal(p.stepPoints, 12); assert.equal(p.everydaySteps, 6000); assert.equal(p.workouts, 1)

// not enough history
e = effortFor({ ...history(10, 10000), [asOf]: steps(10000) }, [], asOf)
assert.equal(e.score, null); assert.equal(e.reason, 'history'); assert.equal(e.n, 10)

// no record at all
e = effortFor(history(28, 10000), [], asOf)
assert.equal(e.reason, 'no-data'); assert.equal(e.score, null)

// scale floor
e = effortFor({ ...history(28, 1000), [asOf]: steps(1000) }, [], asOf)
assert.equal(e.usual, 2); assert.equal(e.score, Math.round(100 * (1 - 2 ** -0.2))); assert.equal(e.score, 13)

// load without steps still scores
const ld = history(28, 10000); ld[asOf] = { training: { load: 30 } }
e = effortFor(ld, [], asOf)
assert.equal(e.points, 30); assert.notEqual(e.score, null)

// target tiers
assert.deepEqual([75, 74, 50, 49].map(v => effortTarget(v).tier), ['strong', 'steady', 'steady', 'easy'])
assert.deepEqual(effortTarget(75), { lo: 60, hi: 80, tier: 'strong', label: 'Strong day' })
assert.deepEqual(effortTarget(49), { lo: 20, hi: 40, tier: 'easy', label: 'Easy day' })
assert.equal(effortTarget(null), null); assert.equal(effortTarget(undefined), null)

// status boundaries are inclusive
const t = effortTarget(60)
assert.deepEqual([39, 40, 60, 61].map(s => effortStatus(s, t)), ['below', 'in', 'in', 'above'])
assert.equal(effortStatus(null, t), null); assert.equal(effortStatus(50, null), null)
assert.equal(statusText('below'), 'Room for more today'); assert.equal(statusText('above', false), 'Above the target for this day')
assert.equal(statusText('in', false), 'In the target range for this day'); assert.equal(statusText(null), null)

// series: own recovery per day, no carry-over
const sd = { ...history(28, 10000), [asOf]: { ...steps(10000), readiness: { score: 80 }, training: { load: 20 } } }
const s = effortSeries(sd, [], addDays(asOf, -2), asOf)
assert.equal(s.length, 3)
assert.equal(s[2].lo, 60); assert.equal(s[2].hi, 80); assert.equal(s[2].recovery, 80); assert.equal(s[2].status, 'in')
assert.equal(s[1].lo, null); assert.equal(s[1].recovery, null)
// status days are left out of the usual
{
  const hd = { ...history(28, 10000), [asOf]: steps(10000) }
  const ex = new Set([addDays(asOf, -1), addDays(asOf, -2)])
  hd[addDays(asOf, -1)] = steps(40000); hd[addDays(asOf, -2)] = steps(40000)
  const a = effortFor(hd, [], asOf), b = effortFor(hd, [], asOf, undefined, { exclude: ex })
  assert.equal(a.n, 28); assert.equal(b.n, 26); assert.equal(b.usual, 20); assert.ok(a.usual > b.usual)
  assert.ok(b.score > a.score)
  assert.equal(effortSeries(hd, [], asOf, asOf, { exclude: ex })[0].usual, 20)
}
console.log('effort tests passed')
