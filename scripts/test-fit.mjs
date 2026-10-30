import assert from 'node:assert/strict'
import { decodeFit, fitCrc, isFit, fitMs, FIT_EPOCH } from '../src/data/fit.js'
import { encodeFit } from '../src/data/fitEncode.js'
import { normalizeFit, timerIntervals, timerAt, typeKeyOf, FIT_PARSER_VERSION } from '../src/data/fitNormalize.js'
import { generateDemo } from '../src/data/demo.js'
import { generateDemoFitFiles } from '../src/data/demoFit.js'

// ---- CRC, isFit, epoch ----
assert.equal(fitCrc(new TextEncoder().encode('123456789')), 0xBB3D)
assert.equal(isFit(encodeFit([{ num: 0, fields: { 0: ['enum', 4] } }])), true)
assert.equal(isFit(Uint8Array.from({ length: 40 }, (_, i) => (i * 37 + 11) & 0xFF)), false)
assert.equal(FIT_EPOCH, 631065600); assert.equal(fitMs(0), 631065600000); assert.equal(fitMs(null), null)
assert.equal(typeof FIT_PARSER_VERSION, 'number')

// ---- decoder on hand-assembled bytes ----
const be16 = v => [v >> 8, v & 255], le16 = v => [v & 255, v >> 8]
const be32 = v => [v >>> 24, (v >>> 16) & 255, (v >>> 8) & 255, v & 255], le32 = v => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, v >>> 24]
const str = s => [...new TextEncoder().encode(s)]
function wrap(...body) {
  const b = body.flat(Infinity), out = new Uint8Array(14 + b.length + 2), dv = new DataView(out.buffer)
  out[0] = 14; out[1] = 0x20; dv.setUint16(2, 2132, true); dv.setUint32(4, b.length, true); out.set([0x2E, 0x46, 0x49, 0x54], 8)
  dv.setUint16(12, fitCrc(out, 0, 12), true); out.set(b, 14)
  dv.setUint16(14 + b.length, fitCrc(out, 0, 14 + b.length), true)
  return out
}
const body = [
  // big-endian definition: uint16 + uint32
  0x40, 0, 1, be16(1000), 2, 0, 2, 0x84, 1, 4, 0x86,
  0, be16(0x1234), be32(0xDEADBEEF),
  // string with trailing NULs
  0x41, 0, 0, le16(1001), 1, 0, 8, 7,
  1, str('abc'), 0, 0, 0, 0, 0,
  // invalid values: uint8, uint16, sint32, uint32z → absent; uint8 5 stays
  0x42, 0, 0, le16(1002), 5, 0, 1, 0x02, 1, 2, 0x84, 2, 4, 0x85, 3, 4, 0x8C, 4, 1, 0x02,
  2, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0x7F, 0, 0, 0, 0, 5,
  // arrays: all invalid → absent, partly valid → nulls
  0x43, 0, 0, le16(1003), 3, 0, 3, 0x02, 1, 3, 0x02, 2, 1, 0x02,
  3, 0xFF, 0xFF, 0xFF, 1, 0xFF, 3, 9,
  // developer-data definition: one normal field, one developer field (index 0, num 5, 2 bytes)
  0x64, 0, 0, le16(1004), 1, 0, 1, 0x02, 1, 5, 2, 0,
  4, 7, 0xAA, 0xBB,
  4, 8, 1, 2,
]
const f = wrap(body), d = decodeFit(f)
assert.equal(d.crcOk, true); assert.deepEqual(d.errors, [])
assert.deepEqual(d.messages[1000], [{ 0: 0x1234, 1: 0xDEADBEEF }])
assert.deepEqual(d.messages[1001], [{ 0: 'abc' }])
assert.deepEqual(d.messages[1002], [{ 4: 5 }])
assert.deepEqual(d.messages[1003], [{ 1: [1, null, 3], 2: 9 }])
assert.deepEqual(d.messages[1004], [{ 0: 7 }, { 0: 8 }])
assert.deepEqual(d.devFields, { '0:5': 2 })

// compressed timestamp headers, including a rollover past a 32 s boundary (1000 % 32 = 8)
const comp = wrap(
  0x41, 0, 0, le16(20), 2, 253, 4, 0x86, 3, 1, 0x02, 0x40, 0, 0, le16(20), 1, 3, 1, 0x02,
  1, le32(1000), 100,
  0x80 | 12, 101, 0x80 | 31, 102, 0x80 | 2, 103, 0x80 | 10, 104,
)
const dc = decodeFit(comp)
assert.equal(dc.crcOk, true); assert.deepEqual(dc.errors, [])
assert.deepEqual(dc.messages[20].map(m => m[253]), [1000, 1004, 1023, 1026, 1034])
assert.deepEqual(dc.messages[20].map(m => m[3]), [100, 101, 102, 103, 104])

// CRC mismatch keeps the messages
const bad = f.slice(); bad[bad.length - 1] ^= 0xFF
const db = decodeFit(bad)
assert.equal(db.crcOk, false); assert.deepEqual(db.messages[1000], [{ 0: 0x1234, 1: 0xDEADBEEF }])
// truncated file: errors, no throw, earlier messages kept
const dt = decodeFit(f.slice(0, f.length - 14))
assert.ok(dt.errors.length > 0); assert.equal(dt.crcOk, false); assert.ok(dt.messages[1000])
assert.doesNotThrow(() => decodeFit(f.slice(0, 30)))
// not FIT
assert.throws(() => decodeFit(Uint8Array.from({ length: 50 }, (_, i) => i)), /Not a FIT file/)
assert.throws(() => decodeFit(new Uint8Array(3)), /Not a FIT file/)
// chained files
const two = new Uint8Array(f.length + comp.length); two.set(f); two.set(comp, f.length)
const dd = decodeFit(two)
assert.equal(dd.crcOk, true); assert.ok(dd.messages[1000] && dd.messages[20].length === 5)
// ArrayBuffer input works too
assert.ok(decodeFit(f.buffer.slice(f.byteOffset, f.byteOffset + f.length)).messages[1001])

// ---- synthetic run ----
const SEMI = 2 ** 31 / 180, fitT = unix => unix - 631065600
const u = (type, v) => [type, v]
function run({ start, samples, pauses = [], laps = [], zones, hrRecovery = true, workout = true, splits = true, sport = 1, sub = 0, localOffset = 19800 }) {
  const startF = fitT(start), shift = t => pauses.reduce((a, [at, len]) => a + (t > at ? len : 0), 0)
  const at = t => startF + t + shift(t), last = samples.at(-1)
  const elapsed = last.t + pauses.reduce((a, p) => a + p[1], 0), endF = startF + elapsed
  const ev = (ts, type, evType, extra = {}) => ({ num: 21, fields: { 253: u('uint32', ts), 0: u('enum', type), 1: u('enum', evType), ...extra } })
  const m = [{ num: 0, fields: { 0: u('enum', 4), 3: u('uint32z', 4242), 4: u('uint32', startF) } }]
  if (workout) {
    m.push({ num: 26, fields: { 8: u('string', 'Base') } })
    m.push({ num: 27, fields: { 1: u('enum', 0), 2: u('uint32', 1800000), 3: u('enum', 0), 5: u('uint32', 1900), 6: u('uint32', 2300), 7: u('enum', 5) } })
  }
  m.push(ev(startF, 0, 0))
  for (const s of samples) {
    m.push({ num: 20, fields: { 253: u('uint32', at(s.t)), 5: u('uint32', Math.round(s.d * 100)), 73: u('uint32', Math.round(s.v * 1000)), 3: u('uint8', s.hr), 4: u('uint8', s.cad), 53: u('uint8', 32), 78: u('uint16', Math.round((s.alt + 500) * 5)), 0: u('sint32', Math.round((0.5 + s.d / 1e6) * SEMI)), 1: u('sint32', Math.round(0.5 * SEMI)) } })
  }
  pauses.forEach(([pt, len], i) => {
    const stop = startF + pt + pauses.slice(0, i).reduce((a, p) => a + p[1], 0)
    m.push(ev(stop, 0, 4)); m.push(ev(stop + len, 0, 0))
    if (i === 0 && hrRecovery) m.push(ev(stop + 120, 21, 3, { 3: u('uint8', samples.find(s => s.t === pt).hr - 25) }))
  })
  m.push(ev(endF, 0, 4))
  laps.forEach((l, i) => m.push({ num: 19, fields: { 253: u('uint32', endF), 2: u('uint32', startF + l.from), 7: u('uint32', l.sec * 1000), 8: u('uint32', l.sec * 1000), 9: u('uint32', l.m * 100) } }))
  m.push({ num: 18, fields: { 253: u('uint32', endF), 2: u('uint32', startF), 7: u('uint32', elapsed * 1000), 8: u('uint32', last.t * 1000), 9: u('uint32', Math.round(last.d * 100)), 124: u('uint32', Math.round(last.d / last.t * 1000)), 16: u('uint8', 150), 17: u('uint8', 175), 5: u('enum', sport), 6: u('enum', sub), 18: u('uint8', 82), 92: u('uint8', 64), 24: u('uint8', 35), 137: u('uint8', 12), 168: u('uint32', Math.round(80.5 * 65536)), 193: u('uint8', 50) } })
  if (zones) m.push({ num: 216, fields: { 0: u('uint16', 18), 1: u('uint16', 0), 2: u('uint32', zones.map(x => x * 1000)), 6: u('uint8', [94, 113, 132, 150, 169, 188]), 10: u('enum', 1), 11: u('uint8', 190) } })
  if (splits) { m.push({ num: 313, fields: { 0: u('enum', 17), 4: u('uint32', 700000), 5: u('uint32', 190000), 6: u('uint32', 2700), 10: u('uint8', 152) } }); m.push({ num: 313, fields: { 0: u('enum', 18), 4: u('uint32', 180000), 5: u('uint32', 30000), 6: u('uint32', 1600), 10: u('uint8', 130) } }) }
  m.push({ num: 34, fields: { 253: u('uint32', endF), 5: u('uint32', endF + localOffset) } })
  return m
}
const samples = []
for (let t = 0; t <= 880; t += 5) samples.push({ t, d: t * 2.5, v: 2.5, hr: Math.round(120 + t / 20), cad: 80, alt: 50 + Math.round(10 * Math.sin(t / 100)) })
const start = Date.UTC(2026, 5, 10, 20, 0, 0) / 1000 // 20:00 UTC = 01:30 next day in IST
const zones = [10, 60, 300, 250, 200, 50, 10]
const laps = [{ from: 0, sec: 300, m: 750 }, { from: 300, sec: 300, m: 750 }, { from: 720, sec: 280, m: 700 }]
const bytes = encodeFit(run({ start, samples, pauses: [[300, 120], [600, 90]], laps, zones }))
const res = normalizeFit(decodeFit(bytes), { fileName: '12345678901_ACTIVITY.fit' })
assert.equal(res.kind, 'activity'); assert.equal(res.workouts.length, 1)
const { workout: w, series: s } = res.workouts[0]
assert.equal(w.day, '2026-06-11'); assert.equal(w.utcOffsetMin, 330)
assert.equal(w.elapsedSec, 1090); assert.equal(w.timerSec, 880); assert.equal(w.distanceM, 2200)
assert.ok(Math.abs(w.avgSpeed - 2.5) < 0.001)
assert.equal(w.avgHr, 150); assert.equal(w.maxHr, 175)
assert.equal(w.aerobicTE, 3.5); assert.equal(w.anaerobicTE, 1.2); assert.equal(w.trainingLoad, 80.5); assert.equal(w.rpe, 5)
assert.equal(w.avgCadence, 165); assert.equal(w.type, 'running'); assert.equal(w.source, 'fit'); assert.equal(w.sport, 1)
assert.equal(w.startTs, start * 1000); assert.equal(w.endTs, (start + 1090) * 1000)
assert.deepEqual(w.pauses.map(p => p.sec), [120, 90])
assert.equal(w.laps.length, 3); assert.equal(w.laps[0].distanceM, 750); assert.equal(w.laps[0].timerSec, 300)
assert.deepEqual(w.recovery.map(r => ({ hrAtStop: r.hrAtStop, hrAfter: r.hrAfter, afterSec: r.afterSec })), [{ hrAtStop: 135, hrAfter: 110, afterSec: 120 }])
assert.deepEqual(w.zones.secs, zones); assert.equal(w.zones.secs.length, 7)
assert.deepEqual(w.zones.bounds, [94, 113, 132, 150, 169, 188]); assert.equal(w.zones.calc, 'percentMaxHr'); assert.equal(w.zones.maxHr, 190)
assert.equal(w.workout.name, 'Base')
assert.deepEqual(w.workout.steps[0].target, { kind: 'speed', lo: 1.9, hi: 2.3 })
assert.equal(w.workout.steps[0].durationSec, 1800); assert.equal(w.workout.steps[0].intensity, 'interval')
assert.deepEqual(w.splitSummary.map(x => x.type), ['run', 'walk']); assert.equal(w.splitSummary[0].timerSec, 700)
assert.equal(w.garminId, '12345678901'); assert.equal(w.fileName, '12345678901_ACTIVITY.fit'); assert.equal(w.crcOk, true)
assert.equal(w.counts.records, samples.length)
for (const k of ['t', 'tt', 'dist', 'speed', 'hr', 'cad', 'alt', 'lat', 'lon']) assert.equal(s[k].length, samples.length, k)
for (const k of ['power', 'gct', 'vo', 'resp', 'temp', 'stepLen']) assert.equal(s[k], null, k)
assert.ok(Math.abs(s.tt.at(-1) - 880) < 1); assert.ok(Math.abs(s.t.at(-1) - 1090) < 1)
assert.ok(s.t.at(-1) - s.tt.at(-1) >= 209)
assert.ok(s.tt.every((v, i) => i === 0 || v >= s.tt[i - 1]))
assert.ok(Math.abs(s.lat[0] - 0.5) < 1e-4 && Math.abs(s.lon[0] - 0.5) < 1e-4)
assert.ok(s.lat.every(v => Math.abs(v - 0.5) < 0.01))
assert.equal(s.cad[0], 160.5); assert.equal(s.alt[0], 50); assert.equal(s.dist.at(-1), 2200); assert.equal(s.speed[0], 2.5)

// e-mail prefix and folders are stripped and never leak
const mail = JSON.stringify(normalizeFit(decodeFit(bytes), { fileName: 'DI_CONNECT/x/someone@example.com_12345678901.fit' }))
assert.ok(!mail.includes('someone') && !mail.includes('@') && !mail.includes('DI_CONNECT'))
assert.equal(normalizeFit(decodeFit(bytes), { fileName: 'DI_CONNECT/x/someone@example.com_12345678901.fit' }).workouts[0].workout.fileName, '12345678901.fit')
assert.equal(normalizeFit(decodeFit(bytes), { fileName: 'C:\\a\\b\\run.fit' }).workouts[0].workout.fileName, 'run.fit')
assert.equal(normalizeFit(decodeFit(bytes)).workouts[0].workout.garminId, null)

// no offset in the file → falls back to the device's local day (no throw, a valid date)
const noAct = run({ start, samples, laps, zones }).filter(x => x.num !== 34)
const w0 = normalizeFit(decodeFit(encodeFit(noAct))).workouts[0].workout
assert.equal(w0.utcOffsetMin, null); assert.match(w0.day, /^\d{4}-\d\d-\d\d$/); assert.deepEqual(w0.pauses, [])

// ---- type keys ----
assert.equal(typeKeyOf(1, 0), 'running'); assert.equal(typeKeyOf(1, 3), 'trail_running'); assert.equal(typeKeyOf(2, 6), 'indoor_cycling')
assert.equal(typeKeyOf(10, 20), 'strength_training'); assert.equal(typeKeyOf(999, 0), 'activity')

// ---- timer intervals ----
const ms = n => fitMs(n)
assert.deepEqual(timerIntervals([], 1000, 9000), [[1000, 9000]])
const evs = [{ 0: 0, 1: 0, 253: 100 }, { 0: 0, 1: 4, 253: 200 }, { 0: 0, 1: 0, 253: 260 }, { 0: 0, 1: 4, 253: 400 }]
const iv = timerIntervals(evs, ms(100), ms(400))
assert.deepEqual(iv, [[ms(100), ms(200)], [ms(260), ms(400)]])
assert.equal(timerAt(iv, ms(150)), 50); assert.equal(timerAt(iv, ms(230)), 100); assert.equal(timerAt(iv, ms(200)), 100)
assert.equal(timerAt(iv, ms(300)), 140); assert.equal(timerAt(iv, ms(90)), 0); assert.equal(timerAt(iv, ms(999)), 240)
assert.deepEqual(timerIntervals([{ 0: 0, 1: 0, 253: 100 }], ms(100), ms(150)), [[ms(100), ms(150)]]) // started, never stopped
assert.deepEqual(timerIntervals([{ 0: 3, 1: 0, 253: 100 }], 5, 9), [[5, 9]]) // other event types ignored

// ---- skipped files ----
const mon = normalizeFit(decodeFit(encodeFit([{ num: 0, fields: { 0: u('enum', 32) } }])))
assert.deepEqual(mon, { workouts: [], kind: 'monitoring', skipped: 'not-activity' })
const nos = normalizeFit(decodeFit(encodeFit([{ num: 0, fields: { 0: u('enum', 4) } }])))
assert.equal(nos.skipped, 'no-session'); assert.deepEqual(nos.workouts, [])

// ---- multisport: two sessions, records split by time ----
const A = fitT(start), rec = (t, hr) => ({ num: 20, fields: { 253: u('uint32', A + t), 3: u('uint8', hr), 5: u('uint32', t * 100) } })
const multi = [
  { num: 0, fields: { 0: u('enum', 4), 3: u('uint32z', 99), 4: u('uint32', A) } },
  rec(0, 100), rec(30, 110), rec(60, 120), rec(100, 130),
  { num: 18, fields: { 253: u('uint32', A + 100), 2: u('uint32', A), 7: u('uint32', 100000), 8: u('uint32', 100000), 5: u('enum', 5) } },
  rec(200, 140), rec(230, 150), rec(300, 160),
  { num: 18, fields: { 253: u('uint32', A + 300), 2: u('uint32', A + 200), 7: u('uint32', 100000), 8: u('uint32', 100000), 5: u('enum', 2), 6: u('enum', 6) } },
]
const mr = normalizeFit(decodeFit(encodeFit(multi)))
assert.equal(mr.workouts.length, 2)
assert.ok(mr.workouts[0].workout.id.endsWith('-0')); assert.ok(mr.workouts[1].workout.id.endsWith('-1'))
assert.notEqual(mr.workouts[0].workout.id, mr.workouts[1].workout.id)
assert.deepEqual(mr.workouts[0].series.hr, [100, 110, 120, 130]); assert.deepEqual(mr.workouts[1].series.hr, [140, 150, 160])
assert.equal(mr.workouts[0].workout.type, 'swimming'); assert.equal(mr.workouts[1].workout.type, 'indoor_cycling')
assert.deepEqual(mr.workouts[1].series.t, [0, 30, 100])

// ---- demo files ----
const files = generateDemoFitFiles(generateDemo().activities)
assert.ok(files.length > 0)
for (const { name, bytes: b } of files) {
  const dec = decodeFit(b), r = normalizeFit(dec, { fileName: name })
  assert.equal(r.workouts.length, 1, name)
  const { workout: dw, series: ds } = r.workouts[0]
  assert.equal(dw.crcOk, true, name)
  assert.ok(ds.tt.every((v, i) => i === 0 || v >= ds.tt[i - 1]), `${name} tt non-decreasing`)
}
console.log('fit tests passed')
