// FIT decoder: Garmin's binary activity format → messages of raw field values, keyed by global message number.
// Written from the public FIT protocol description (Garmin's SDK may not be redistributed). Pure, tested in scripts/test-fit.mjs.
// Values are unscaled; invalid values become null. Field meanings and scales live in fitNormalize.js.

export const FIT_EPOCH = 631065600 // FIT time 0 = 1989-12-31T00:00:00Z, in Unix seconds
export const fitMs = v => v == null ? null : (v + FIT_EPOCH) * 1000

// base type (low 5 bits of the base type byte) → [size, DataView getter, invalid value]
const BASE = [
  [1, 'getUint8', 0xFF], [1, 'getInt8', 0x7F], [1, 'getUint8', 0xFF], [2, 'getInt16', 0x7FFF], [2, 'getUint16', 0xFFFF],
  [4, 'getInt32', 0x7FFFFFFF], [4, 'getUint32', 0xFFFFFFFF], [1, null, 0], [4, 'getFloat32', NaN], [8, 'getFloat64', NaN],
  [1, 'getUint8', 0], [2, 'getUint16', 0], [4, 'getUint32', 0], [1, 'getUint8', 0xFF],
  [8, 'getBigInt64', 0x7FFFFFFFFFFFFFFFn], [8, 'getBigUint64', 0xFFFFFFFFFFFFFFFFn], [8, 'getBigUint64', 0n],
]
const STRING = 7, BYTE = 13
const CRC = [0x0000, 0xCC01, 0xD801, 0x1400, 0xF001, 0x3C00, 0x2800, 0xE401, 0xA001, 0x6C00, 0x7800, 0xB401, 0x5000, 0x9C01, 0x8801, 0x4400]
const utf8 = new TextDecoder()

/** FIT CRC-16 of bytes [from, to). */
export function fitCrc(u8, from = 0, to = u8.length) {
  let crc = 0
  for (let i = from; i < to; i += 1) {
    const b = u8[i]
    let t = CRC[crc & 0xF]; crc = (crc >> 4) & 0x0FFF; crc = crc ^ t ^ CRC[b & 0xF]
    t = CRC[crc & 0xF]; crc = (crc >> 4) & 0x0FFF; crc = crc ^ t ^ CRC[(b >> 4) & 0xF]
  }
  return crc
}

/** True when the bytes start with a FIT header. */
export const isFit = u8 => u8.length >= 12 && (u8[0] === 12 || u8[0] === 14) && u8[8] === 0x2E && u8[9] === 0x46 && u8[10] === 0x49 && u8[11] === 0x54

function readValue(view, at, size, base, little) {
  if (base === STRING) {
    const bytes = new Uint8Array(view.buffer, view.byteOffset + at, size), end = bytes.indexOf(0)
    const s = utf8.decode(end < 0 ? bytes : bytes.subarray(0, end))
    return s || null
  }
  const type = BASE[base]
  if (!type || size % type[0]) return null
  const [w, get, invalid] = type, n = size / w, out = []
  for (let i = 0; i < n; i += 1) {
    let v = view[get](at + i * w, little)
    if (typeof v === 'bigint') v = v === invalid ? null : Number(v)
    else if (Number.isNaN(v) || v === invalid) v = null
    out.push(v)
  }
  if (n === 1) return out[0]
  if (base === BYTE) return out.every(v => v === null) ? null : out.map(v => v ?? 0xFF)
  return out.every(v => v === null) ? null : out
}

/**
 * Decode a FIT file (chained files are read one after another).
 * @returns {{ messages: Object<number, object[]>, crcOk: boolean, errors: string[], devFields: Object<string, number> }}
 *   Each message is { [fieldNumber]: value }; timestamps (field 253) are FIT seconds, including compressed-header ones.
 *   devFields counts developer-field values by 'developerIndex:fieldNumber'.
 */
export function decodeFit(input) {
  const u8 = input instanceof Uint8Array ? input : new Uint8Array(input)
  const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength)
  const out = { messages: {}, crcOk: true, errors: [], devFields: {} }
  if (!isFit(u8)) throw new Error('Not a FIT file')
  let pos = 0
  while (pos + 12 <= u8.length && isFit(u8.subarray(pos))) {
    const start = pos + u8[pos], end = start + view.getUint32(pos + 4, true)
    if (end + 2 > u8.length) { out.errors.push('The file is cut short'); out.crcOk = false }
    else if (fitCrc(u8, pos, end) !== view.getUint16(end, true)) out.crcOk = false
    readRecords(u8, view, start, Math.min(end, u8.length), out)
    pos = end + 2
  }
  return out
}

function readRecords(u8, view, from, to, out) {
  const defs = []
  let p = from, lastTs = null
  const push = (def, at, ts) => {
    if (at + def.size > to) { out.errors.push('The last message is cut short'); return to }
    const msg = {}
    let q = at
    for (const f of def.fields) { const v = readValue(view, q, f.size, f.base, def.little); if (v != null) msg[f.num] = v; q += f.size }
    for (const f of def.dev) { const k = `${f.index}:${f.num}`; out.devFields[k] = (out.devFields[k] || 0) + 1; q += f.size }
    if (ts != null) msg[253] = ts
    else if (typeof msg[253] === 'number') lastTs = msg[253]
    ;(out.messages[def.num] ||= []).push(msg)
    return q
  }
  while (p < to) {
    const h = u8[p++]
    if (h & 0x80) { // compressed timestamp header: 2-bit local type, 5-bit offset from the last full timestamp
      const def = defs[(h >> 5) & 3], off = h & 0x1F
      if (!def) { out.errors.push('Data before its definition'); return }
      if (lastTs != null) lastTs = lastTs - (lastTs % 32) + off + (off < lastTs % 32 ? 32 : 0)
      p = push(def, p, lastTs)
    } else if (h & 0x40) { // definition message
      if (p + 5 > to) { out.errors.push('A definition is cut short'); return }
      const little = u8[p + 1] === 0, num = view.getUint16(p + 2, little), nf = u8[p + 4]
      p += 5
      const fields = [], dev = []
      for (let i = 0; i < nf; i += 1, p += 3) fields.push({ num: u8[p], size: u8[p + 1], base: u8[p + 2] & 0x1F })
      if (h & 0x20) { const nd = u8[p++]; for (let i = 0; i < nd; i += 1, p += 3) dev.push({ num: u8[p], size: u8[p + 1], index: u8[p + 2] }) }
      defs[h & 0x0F] = { num, little, fields, dev, size: [...fields, ...dev].reduce((a, f) => a + f.size, 0) }
    } else {
      const def = defs[h & 0x0F]
      if (!def) { out.errors.push('Data before its definition'); return }
      p = push(def, p, null)
    }
  }
}
