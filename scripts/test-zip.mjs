import assert from 'node:assert/strict'
import { deflateRawSync } from 'node:zlib'
import { listZip, readEntry, walkFiles } from '../src/data/zip.js'

const CRC = (() => { const t = []; for (let n = 0; n < 256; n += 1) { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t.push(c >>> 0) } return t })()
const crc32 = u8 => { let c = 0xFFFFFFFF; for (const b of u8) c = CRC[(c ^ b) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0 }
const enc = new TextEncoder()

// files: [{ name, data, store?, zip64? }]; zip64 puts size/offset in the 0x0001 extra field and the EOCD in ZIP64 form
function makeZip(files, { zip64 = false } = {}) {
  const parts = [], cds = []
  let off = 0
  for (const f of files) {
    const name = enc.encode(f.name), data = f.data ?? new Uint8Array(0), body = f.store || f.dir ? data : deflateRawSync(data)
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(f.store || f.dir ? 0 : 8, 8); lh.writeUInt32LE(crc32(data), 14)
    lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(3, 28)
    parts.push(lh, name, Buffer.from([9, 9, 0]), body) // odd local extra: differs from central directory
    const x = zip64 ? Buffer.alloc(28) : Buffer.alloc(0)
    if (zip64) { x.writeUInt16LE(1, 0); x.writeUInt16LE(24, 2); x.writeBigUInt64LE(BigInt(data.length), 4); x.writeBigUInt64LE(BigInt(body.length), 12); x.writeBigUInt64LE(BigInt(off), 20) }
    const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(f.store || f.dir ? 0 : 8, 10); cd.writeUInt32LE(crc32(data), 16)
    cd.writeUInt32LE(zip64 ? 0xFFFFFFFF : body.length, 20); cd.writeUInt32LE(zip64 ? 0xFFFFFFFF : data.length, 24)
    cd.writeUInt16LE(name.length, 28); cd.writeUInt16LE(x.length, 30); cd.writeUInt32LE(zip64 ? 0xFFFFFFFF : off, 42)
    cds.push(cd, name, x)
    off += 30 + name.length + 3 + body.length
  }
  const cdBuf = Buffer.concat(cds), tail = []
  if (zip64) {
    const rec = Buffer.alloc(56); rec.writeUInt32LE(0x06064b50, 0); rec.writeBigUInt64LE(44n, 4); rec.writeBigUInt64LE(BigInt(files.length), 24)
    rec.writeBigUInt64LE(BigInt(files.length), 32); rec.writeBigUInt64LE(BigInt(cdBuf.length), 40); rec.writeBigUInt64LE(BigInt(off), 48)
    const loc = Buffer.alloc(20); loc.writeUInt32LE(0x07064b50, 0); loc.writeBigUInt64LE(BigInt(off + cdBuf.length), 8); loc.writeUInt32LE(1, 16)
    tail.push(rec, loc)
  }
  const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(zip64 ? 0xFFFF : files.length, 10); eocd.writeUInt32LE(zip64 ? 0xFFFFFFFF : cdBuf.length, 12); eocd.writeUInt32LE(zip64 ? 0xFFFFFFFF : off, 16)
  return new Uint8Array(Buffer.concat([...parts, cdBuf, ...tail, eocd]))
}
const text = s => enc.encode(s)
const dec = u8 => new TextDecoder().decode(u8)
const collect = async it => { const o = []; for await (const x of it) o.push(x); return o }

const inner = makeZip([{ name: 'deep.fit', data: text('DEEP') }, { name: 'note.txt', data: text('n') }])
const outer = makeZip([
  { name: 'a.fit', data: text('A'.repeat(500)) }, { name: 'dir/', dir: true }, { name: 'dir/b.FIT', data: text('B'), store: true },
  { name: 'meta.json', data: text('{}') }, { name: 'ünï/ç.fit', data: text('U') }, { name: 'inner.zip', data: inner, store: true },
])

const list = await listZip(new Blob([outer]))
assert.deepEqual(list.map(e => e.name), ['a.fit', 'dir/b.FIT', 'meta.json', 'ünï/ç.fit', 'inner.zip'])
assert.deepEqual([list[0].method, list[1].method, list[0].size], [8, 0, 500])
assert.equal(dec(await readEntry(new Blob([outer]), list[0])), 'A'.repeat(500))
assert.equal(dec(await readEntry(new Blob([outer]), list[1])), 'B')
assert.equal(dec(await readEntry(new Blob([outer]), list[3])), 'U')
assert.equal(list[0].crc, crc32(text('A'.repeat(500))))
await assert.rejects(readEntry(new Blob([outer]), { ...list[0], method: 99 }), /Unsupported compression/)

const items = await collect(walkFiles([new File([outer], 'export.zip'), new File([text('LOOSE')], 'x.fit'), new File([text('t')], 'readme.txt')]))
assert.deepEqual(items.map(i => [i.path, i.kind]), [
  ['export.zip/a.fit', 'fit'], ['export.zip/dir/b.FIT', 'fit'], ['export.zip/meta.json', 'other'], ['export.zip/ünï/ç.fit', 'fit'],
  ['export.zip/inner.zip/deep.fit', 'fit'], ['export.zip/inner.zip/note.txt', 'other'], ['x.fit', 'fit'], ['readme.txt', 'other'],
])
assert.equal(dec(await items[0].read()), 'A'.repeat(500))
assert.equal(dec(await items[4].read()), 'DEEP')
assert.equal(dec(await items[6].read()), 'LOOSE')

const shallow = await collect(walkFiles([new File([outer], 'export.zip')], { depth: 1 }))
assert.deepEqual(shallow.filter(i => i.path.includes('inner.zip')).map(i => [i.path, i.kind]), [['export.zip/inner.zip', 'other']])
assert.deepEqual((await collect(walkFiles([new File([outer], 'e.zip')], { depth: 0 }))).map(i => i.kind), ['other'])
assert.equal((await collect(walkFiles([new Blob([text('x')])]))).at(0).path, 'file')

await assert.rejects(listZip(new Blob([text('definitely not a zip file')])), /Not a zip file/)
const bad = await collect(walkFiles([new File([text('garbage'.repeat(10))], 'bad.zip'), new File([text('F')], 'ok.fit')]))
assert.equal(bad[0].kind, 'error'); assert.equal(bad[0].error, 'Not a zip file'); assert.equal(bad[1].kind, 'fit')

// ZIP64
const z64 = new Blob([makeZip([{ name: 'p.fit', data: text('P'.repeat(100)) }, { name: 'q.fit', data: text('Q'), store: true }], { zip64: true })])
const l64 = await listZip(z64)
assert.deepEqual(l64.map(e => [e.name, e.size]), [['p.fit', 100], ['q.fit', 1]])
assert.equal(dec(await readEntry(z64, l64[0])), 'P'.repeat(100))
assert.equal(dec(await readEntry(z64, l64[1])), 'Q')

console.log('zip tests passed')
