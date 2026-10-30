import assert from 'node:assert/strict'
import { decodeFit } from '../src/data/fit.js'
import { encodeFit } from '../src/data/fitEncode.js'
import { normalizeFit } from '../src/data/fitNormalize.js'
import { generateDemo } from '../src/data/demo.js'
import { generateDemoFitFiles } from '../src/data/demoFit.js'

// round trip
const msgs = [
  { num: 0, fields: { 0: ['enum', 4], 3: ['uint32z', 1234567890], 4: ['uint32', 1000] } },
  { num: 20, fields: { 253: ['uint32', 1000], 3: ['uint8', 120], 0: ['sint32', -123456], 4: ['uint8', null], 7: ['uint16', null] } },
  { num: 20, fields: { 3: ['uint8', 121], 0: ['sint32', 5] }, compressedTs: 1001 },
  { num: 20, fields: { 3: ['uint8', 122], 0: ['sint32', 6] }, compressedTs: 1015 },
  { num: 20, fields: { 3: ['uint8', 123], 0: ['sint32', 7] }, compressedTs: 1025 }, // crosses the 1024 boundary
  { num: 20, fields: { 3: ['uint8', 124], 0: ['sint32', 8] }, compressedTs: 1040 },
  { num: 216, fields: { 2: ['uint32', [1, 2, 3, null]], 6: ['uint8', [94, 113]], 10: ['enum', 1] } },
  { num: 18, fields: { 110: ['string', 'Run ü'], 16: ['sint16', -5], 17: ['float32', 1.5], 18: ['uint16z', 0], 19: ['byte', [1, 2]], 20: ['sint8', -3] } },
]
for (let i = 0; i < 40; i += 1) msgs.push({ num: 1000 + (i % 20), fields: { 0: ['uint8', i], [i % 20 + 1]: ['uint16', i] } })
const d = decodeFit(encodeFit(msgs))
assert.equal(d.crcOk, true); assert.deepEqual(d.errors, [])
assert.deepEqual(d.messages[0][0], { 0: 4, 3: 1234567890, 4: 1000 })
const r = d.messages[20]
assert.deepEqual(r[0], { 253: 1000, 3: 120, 0: -123456 })
assert.deepEqual(r.map(x => x[253]), [1000, 1001, 1015, 1025, 1040])
assert.deepEqual(r.map(x => x[3]), [120, 121, 122, 123, 124])
assert.deepEqual(d.messages[216][0], { 2: [1, 2, 3, null], 6: [94, 113], 10: 1 })
assert.deepEqual(d.messages[18][0], { 110: 'Run ü', 16: -5, 17: 1.5, 19: [1, 2], 20: -3 })
for (let i = 0; i < 40; i += 1) assert.deepEqual(d.messages[1000 + (i % 20)].find(m => m[0] === i), { 0: i, [i % 20 + 1]: i })
assert.throws(() => encodeFit([{ num: 20, fields: { 253: ['uint32', 1] }, compressedTs: 1 }]))

// demo files
const t0 = performance.now()
const g = generateDemo(), files = generateDemoFitFiles(g.activities)
const ms = performance.now() - t0
assert.ok(files.length >= 20, `files ${files.length}`)
const byId = new Map(g.activities.map(a => [`demo-${a.id}_ACTIVITY.fit`, a]))
for (const { name, bytes } of files) {
  const a = byId.get(name), dec = decodeFit(bytes)
  assert.ok(dec.crcOk && !dec.errors.length, name)
  const res = normalizeFit(dec, { fileName: name })
  assert.equal(res.workouts.length, 1, name)
  const { workout: w, series } = res.workouts[0]
  assert.ok(Math.abs(w.distanceM - a.distanceM) / a.distanceM < .03, `${name} dist ${w.distanceM} vs ${a.distanceM}`)
  assert.ok(Math.abs(w.avgHr - a.avgHr) <= 3, `${name} hr ${w.avgHr} vs ${a.avgHr}`)
  assert.equal(w.laps.length, Math.ceil(w.distanceM / 1000), name)
  assert.ok(Math.abs(w.zones.secs.reduce((x, y) => x + y, 0) - w.timerSec) / w.timerSec < .02, name)
  assert.ok(series.hr.length >= w.timerSec / 5, name)
  assert.equal(w.day, a.day, name)
}
console.log(`generated ${files.length} files in ${ms.toFixed(0)} ms`)
assert.ok(ms < 1500)
console.log('fitencode tests passed')
