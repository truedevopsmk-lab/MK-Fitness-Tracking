// ZIP reader that only ever slices the Blob (tail, central directory, one entry) — a 1 GB account export must never be loaded whole.
const u16 = (v, o) => v.getUint16(o, true), u32 = (v, o) => v.getUint32(o, true), u64 = (v, o) => Number(v.getBigUint64(o, true))
const bad = () => new Error('Not a zip file')

export async function listZip(blob) {
  const tail = new DataView(await blob.slice(Math.max(0, blob.size - 65557 - 20 - 56)).arrayBuffer())
  let e = tail.byteLength - 22
  while (e >= 0 && u32(tail, e) !== 0x06054b50) e -= 1
  if (e < 0) throw bad()
  let count = u16(tail, e + 10), size = u32(tail, e + 12), off = u32(tail, e + 16)
  if (count === 0xFFFF || size === 0xFFFFFFFF || off === 0xFFFFFFFF) {
    if (e < 20 || u32(tail, e - 20) !== 0x07064b50) throw bad()
    const at = u64(tail, e - 12), rec = new DataView(await blob.slice(at, at + 56).arrayBuffer())
    if (rec.byteLength < 56 || u32(rec, 0) !== 0x06064b50) throw bad()
    count = u64(rec, 32); size = u64(rec, 40); off = u64(rec, 48)
  }
  if (off + size > blob.size) throw bad()
  const buf = await blob.slice(off, off + size).arrayBuffer(), cd = new DataView(buf), utf8 = new TextDecoder(), out = []
  for (let p = 0, i = 0; i < count; i += 1) {
    if (p + 46 > cd.byteLength || u32(cd, p) !== 0x02014b50) throw bad()
    const n = u16(cd, p + 28), x = u16(cd, p + 30), c = u16(cd, p + 32)
    const entry = { name: utf8.decode(new Uint8Array(buf, p + 46, n)), method: u16(cd, p + 10), compressedSize: u32(cd, p + 20), size: u32(cd, p + 24), offset: u32(cd, p + 42), crc: u32(cd, p + 16) }
    for (let q = p + 46 + n, end = q + x; q + 4 <= end; q += 4 + u16(cd, q + 2)) {
      if (u16(cd, q) !== 1) continue
      let z = q + 4 // ZIP64 extra: only the fields that were 0xFFFFFFFF, in this order
      for (const k of ['size', 'compressedSize', 'offset']) if (entry[k] === 0xFFFFFFFF) { entry[k] = u64(cd, z); z += 8 }
    }
    p += 46 + n + x + c
    if (!entry.name.endsWith('/')) out.push(entry)
  }
  return out
}

export async function readEntry(blob, entry) {
  const head = new DataView(await blob.slice(entry.offset, entry.offset + 30).arrayBuffer())
  if (head.byteLength < 30 || u32(head, 0) !== 0x04034b50) throw bad()
  const start = entry.offset + 30 + u16(head, 26) + u16(head, 28), data = blob.slice(start, start + entry.compressedSize)
  if (entry.method === 0) return new Uint8Array(await data.arrayBuffer())
  if (entry.method !== 8) throw new Error('Unsupported compression')
  return new Uint8Array(await new Response(data.stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer())
}

/** Leaf files of loose files and (nested) zips: fit items carry read(); `depth` = how many zip levels may be opened. */
export async function* walkFiles(blobs, { depth = 2 } = {}) {
  for (const blob of blobs) yield* walk(blob.name ?? 'file', async () => blob, async () => new Uint8Array(await blob.arrayBuffer()), depth)
}

async function* walk(path, getBlob, read, depth) {
  const low = path.toLowerCase()
  if (low.endsWith('.fit')) yield { path, kind: 'fit', read }
  else if (low.endsWith('.zip') && depth > 0) {
    let blob, entries
    try { blob = await getBlob(); entries = await listZip(blob) } catch (e) { yield { path, kind: 'error', error: e.message }; return }
    for (const en of entries) yield* walk(`${path}/${en.name}`, async () => new Blob([await readEntry(blob, en)]), () => readEntry(blob, en), depth - 1)
  } else yield { path, kind: 'other' }
}
