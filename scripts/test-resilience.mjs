import assert from 'node:assert/strict'
import { stateInfo, stateOf, resilienceFor, resilienceSeries, changeText, bounceText } from '../src/lib/resilience.js'
import { addDays } from '../src/lib/dates.js'

const asOf = '2026-10-25'
const ago = i => addDays(asOf, -i)

// 42 days: steady baseline, then the last 14 days at `recent` steps/load; readiness(i) gives days-ago -> score or undefined
function build({ recent = 10000, load = 0, readiness = () => undefined, loadOn = () => 0 } = {}) {
  const d = {}
  for (let i = 0; i <= 41; i += 1) {
    const rec = { steps: { total: i < 14 ? recent : 10000 } }
    const l = (i < 14 ? load : 0) + loadOn(i)
    if (l) rec.training = { load: l }
    const r = readiness(i)
    if (r != null) rec.readiness = { score: r }
    d[ago(i)] = rec
  }
  return d
}
const rd = v => i => i < 14 ? v : 70

// states
let r = resilienceFor(build({ recent: 10000, load: 30, readiness: rd(80) }), [], asOf)
assert.equal(r.state, 'strong'); assert.equal(r.n, 14); assert.equal(r.recovery, 80)
r = resilienceFor(build({ recent: 4000, readiness: rd(80) }), [], asOf)
assert.equal(r.state, 'fresh'); assert.equal(r.n, 14); assert.equal(r.recovery, 80)
r = resilienceFor(build({ recent: 10000, load: 30, readiness: rd(45) }), [], asOf)
assert.equal(r.state, 'stretched'); assert.equal(r.n, 14); assert.equal(r.recovery, 45)
r = resilienceFor(build({ recent: 4000, readiness: rd(50) }), [], asOf)
assert.equal(r.state, 'low'); assert.equal(r.n, 14); assert.equal(r.recovery, 50)
assert.equal(r.reason, null); assert.equal(r.points.length, 14); assert.equal(r.points[13].date, asOf)

// stateOf boundaries and info
assert.equal(stateOf(60, 50), 'strong'); assert.equal(stateOf(59.9, 50), 'stretched')
assert.equal(stateOf(60, 49.9), 'fresh'); assert.equal(stateOf(59.9, 49.9), 'low')
assert.equal(stateOf(null, 50), null); assert.equal(stateOf(60, null), null)
assert.equal(stateInfo('strong').short, 'Strong'); assert.equal(stateInfo('low').tone, 'warning')
assert.equal(stateInfo('nope'), null); assert.equal(stateInfo(null), null)

// history: only 5 recent days have readiness
r = resilienceFor(build({ readiness: i => i < 5 ? 80 : undefined }), [], asOf)
assert.equal(r.reason, 'history'); assert.equal(r.n, 5); assert.equal(r.state, null)
assert.equal(r.recovery, null); assert.equal(r.effort, null)

// change vs the 14 days before
r = resilienceFor(build({ readiness: i => i < 14 ? 70 : 80 }), [], asOf)
assert.equal(r.prev.recovery, 80); assert.equal(r.prev.n, 14); assert.equal(r.change, -10)
assert.ok(changeText(r.change).includes('10 points lower'))
r = resilienceFor(build({ readiness: i => i < 14 ? 70 : i < 20 ? 80 : undefined }), [], asOf)
assert.equal(r.prev.n, 6); assert.equal(r.prev.recovery, null); assert.equal(r.change, null)
assert.equal(changeText(null), null)
assert.equal(changeText(5), 'Recovery is 5 points higher than the 14 days before.')
assert.equal(changeText(-4.9), 'Recovery is about the same as the 14 days before.')

// bounce: hard days at 3, 8, 13 (days ago) -> the next day (2, 7, 12 ago) has readiness 55
const hard = [3, 8, 13, 18]
const bounce = n => resilienceFor(build({ readiness: i => hard.slice(0, n).includes(i + 1) ? 55 : 80, loadOn: i => hard.slice(0, n).includes(i) ? 120 : 0 }), [], asOf).bounce
let b = bounce(3)
assert.equal(b.ok, true); assert.equal(b.nAfter, 3); assert.equal(b.nOther, 24)
assert.equal(b.after, 55); assert.equal(b.other, 80); assert.equal(b.delta, -25)
assert.ok(bounceText(b).includes('recovery averaged 55, against 80'))
b = bounce(2)
assert.equal(b.ok, false); assert.equal(b.nAfter, 2); assert.equal(b.after, null); assert.equal(b.delta, null)
assert.ok(bounceText(b).includes('2 hard so far'))

// series matches resilienceFor and is null when the window is thin
const sd = build({ recent: 10000, load: 30, readiness: i => i < 14 ? 80 : undefined })
const f = resilienceFor(sd, [], asOf), [s] = resilienceSeries(sd, [], asOf, asOf)
assert.equal(s.recovery, f.recovery); assert.equal(s.effort, f.effort); assert.equal(s.n, f.n); assert.equal(s.state, f.state)
const early = resilienceSeries(sd, [], addDays(asOf, -30), addDays(asOf, -20))
assert.equal(early.length, 11)
assert.ok(early.every(x => x.n < 7 && x.recovery == null && x.effort == null && x.state == null))
console.log('resilience tests passed')
