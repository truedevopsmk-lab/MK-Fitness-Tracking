import assert from 'node:assert/strict'
import { deflateRawSync } from 'node:zlib'
import { importFit, hashBytes } from '../src/data/fitImport.js'
import { generateDemo } from '../src/data/demo.js'
import { generateDemoFitFiles } from '../src/data/demoFit.js'
import { encodeFit } from '../src/data/fitEncode.js'

// Minimal zip writer (deflated entries) so the import runs end to end on a Garmin-export-like nesting
const CRC = (() => { const t = []; for (let n = 0; n < 256; n += 1) { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t.push(c >>> 0) } return t })()
const crc32 = u8 => { let c = 0xFFFFFFFF; for (const b of u8) c = CRC[(c ^ b) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0 }
function zip(files) {
  const parts = [], cds = []
  let off = 0
  for (const f of files) {
    const name = Buffer.from(f.name), body = deflateRawSync(f.data)
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(crc32(f.data), 14); lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(f.data.length, 22); lh.writeUInt16LE(name.length, 26)
    const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(8, 10); cd.writeUInt32LE(crc32(f.data), 16); cd.writeUInt32LE(body.length, 20); cd.writeUInt32LE(f.data.length, 24); cd.writeUInt16LE(name.length, 28); cd.writeUInt32LE(off, 42)
    parts.push(lh, name, body); cds.push(cd, name); off += 30 + name.length + body.length
  }
  const cd = Buffer.concat(cds), eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(files.length, 8); eocd.writeUInt16LE(files.length, 10); eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(off, 16)
  return new Uint8Array(Buffer.concat([...parts, cd, eocd]))
}

const g = generateDemo(), fits = generateDemoFitFiles(g.activities).slice(0, 5)
const monitoring = encodeFit([{ num: 0, fields: { 0: ['enum', 32], 4: ['uint32', 1100000000] } }])
const inner = zip([...fits.slice(0, 3).map(f => ({ name: `someone@example.com_${f.name}`, data: f.bytes })), { name: 'x_WELLNESS.fit', data: monitoring }])
const outer = zip([
  { name: 'DI_CONNECT/DI-Connect-Uploaded-Files/UploadedFiles_0-_Part1.zip', data: inner },
  { name: 'DI_CONNECT/DI-Connect-Wellness/sleepData.json', data: Buffer.from('{}') },
  { name: 'broken.fit', data: Buffer.from('not a fit file at all') },
])
const batches = []
const onBatch = async b => { batches.push(b) }
const r = await importFit([new File([outer], 'garmin_export.zip'), new File([fits[3].bytes], fits[3].name)], { onBatch, batchSize: 2 })
assert.equal(r.fit, 6, 'three in the nested zip, the monitoring file, the broken one, the loose one')
assert.equal(r.added, 4)
assert.equal(r.skipped, 1, 'monitoring file skipped')
assert.equal(r.errors.length, 1); assert.equal(r.errors[0].error, 'Not a readable FIT file')
assert.ok(r.files >= 7)
const ws = batches.flatMap(b => b.workouts), ss = batches.flatMap(b => b.series), fs = batches.flatMap(b => b.files)
assert.equal(ws.length, 4); assert.equal(ss.length, 4); assert.equal(fs.length, 4)
assert.ok(batches.length >= 2, 'batched')
for (const w of ws) {
  assert.ok(w.derived && w.derived.version >= 1, 'derived numbers stored with the summary')
  assert.ok(!JSON.stringify(w).includes('example.com'), 'e-mail prefix never stored')
  assert.ok(w.sha256 && fs.some(f => f.id === w.sha256 && f.workoutIds.includes(w.id)))
}
assert.ok(fs.every(f => f.bytes instanceof ArrayBuffer && f.bytes.byteLength === f.size), 'original bytes kept')
assert.ok(ss.every((s, i) => s.id === ws[i].id && Array.isArray(s.hr)))

// Second import of the same files: everything is a duplicate (by hash), nothing added
const known = { hashes: new Set(fs.map(f => f.id)), ids: new Set(ws.map(w => w.id)) }
const again = await importFit([new File([outer], 'garmin_export.zip'), new File([fits[3].bytes], fits[3].name)], { known, onBatch: async () => assert.fail('nothing to store') })
assert.equal(again.added, 0); assert.equal(again.duplicates, 4)

// Same workout re-exported (different bytes, same watch serial + start): duplicate by id
const copy = new Uint8Array(fits[4].bytes.length + 0); copy.set(fits[4].bytes)
const first = await importFit([new File([fits[4].bytes], 'a.fit')], { onBatch })
const dup = await importFit([new File([copy], 'b.fit')], { known: { hashes: new Set(), ids: new Set(batches.at(-1).workouts.map(w => w.id)) }, onBatch: async () => assert.fail('duplicate stored') })
assert.equal(first.added, 1); assert.equal(dup.added, 0); assert.equal(dup.duplicates, 1)

assert.equal((await hashBytes(new Uint8Array([1, 2, 3]))).length, 64)
const ctrl = new AbortController(); ctrl.abort()
assert.equal((await importFit([new File([outer], 'x.zip')], { signal: ctrl.signal, onBatch })).added, 0)
console.log('fitimport tests passed')
