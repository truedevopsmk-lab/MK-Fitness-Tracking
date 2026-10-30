// Small FIT writer for tests and demo data. Little-endian only; definitions are emitted whenever a message's layout differs from the one bound to its local type.
import { fitCrc } from './fit.js'

// type → [base type byte, width, invalid value (float32: NaN bits)]
const TYPES = {
  enum: [0x00, 1, 0xFF], sint8: [0x01, 1, 0x7F], uint8: [0x02, 1, 0xFF], sint16: [0x83, 2, 0x7FFF], uint16: [0x84, 2, 0xFFFF],
  sint32: [0x85, 4, 0x7FFFFFFF], uint32: [0x86, 4, 0xFFFFFFFF], string: [0x07, 1, 0], float32: [0x88, 4, 0xFFFFFFFF],
  uint8z: [0x0A, 1, 0], uint16z: [0x8B, 2, 0], uint32z: [0x8C, 4, 0], byte: [0x0D, 1, 0xFF],
}
const SET = { enum: 'setUint8', sint8: 'setInt8', uint8: 'setUint8', sint16: 'setInt16', uint16: 'setUint16', sint32: 'setInt32', uint32: 'setUint32', float32: 'setFloat32', uint8z: 'setUint8', uint16z: 'setUint16', uint32z: 'setUint32', byte: 'setUint8' }

/**
 * @param {Array<{ num: number, fields: Object<number, [string, any]>, compressedTs?: number }>} messages
 *   compressedTs (FIT seconds) replaces field 253 with a compressed-timestamp header; the caller must keep it
 *   within 31 s after the previous timestamp-carrying message (and not use it for ts-less messages).
 */
export function encodeFit(messages) {
  let buf = new Uint8Array(4096), dv = new DataView(buf.buffer), n = 14
  const need = k => { if (n + k > buf.length) { const b = new Uint8Array(Math.max(buf.length * 2, n + k)); b.set(buf); buf = b; dv = new DataView(b.buffer) } }
  const slots = Array(16).fill(null), used = Array(16).fill(0), utf8 = new TextEncoder()
  let tick = 0
  for (const m of messages) {
    const comp = m.compressedTs != null
    if (comp && 253 in m.fields) throw new Error('Compressed messages cannot carry field 253')
    const fields = Object.entries(m.fields).map(([num, [type, value]]) => {
      const t = TYPES[type]
      if (!t) throw new Error(`Unknown FIT type ${type}`)
      const bytes = type === 'string' ? utf8.encode(value ?? '') : null
      return { num: +num, type, value, bytes, base: t[0], size: bytes ? bytes.length + 1 : Array.isArray(value) ? value.length * t[1] : t[1] }
    })
    const key = `${m.num}:${fields.map(f => `${f.num}.${f.size}.${f.base}`).join(',')}`
    let slot = slots.indexOf(key)
    if (comp && slot > 3) slot = -1
    if (slot < 0) {
      const lo = comp ? 0 : 4, hi = comp ? 4 : 16
      slot = lo
      for (let i = lo; i < hi; i += 1) if (used[i] < used[slot]) slot = i
      slots[slot] = key
      need(6 + 3 * fields.length)
      buf[n++] = 0x40 | slot; buf[n++] = 0; buf[n++] = 0
      dv.setUint16(n, m.num, true); n += 2
      buf[n++] = fields.length
      for (const f of fields) { buf[n++] = f.num; buf[n++] = f.size; buf[n++] = f.base }
    }
    used[slot] = ++tick
    need(1 + fields.reduce((s, f) => s + f.size, 0))
    buf[n++] = comp ? 0x80 | (slot << 5) | (m.compressedTs & 0x1F) : slot
    for (const f of fields) {
      if (f.bytes) { buf.set(f.bytes, n); n += f.bytes.length; buf[n++] = 0; continue }
      const w = TYPES[f.type][1], vals = Array.isArray(f.value) ? f.value : [f.value]
      for (const v of vals) {
        if (v == null) { if (f.type === 'float32') dv.setUint32(n, 0xFFFFFFFF, true); else dv[SET[f.type]](n, TYPES[f.type][2], true) }
        else dv[SET[f.type]](n, v, true)
        n += w
      }
    }
  }
  buf[0] = 14; buf[1] = 0x20
  dv.setUint16(2, 2132, true); dv.setUint32(4, n - 14, true)
  buf.set([0x2E, 0x46, 0x49, 0x54], 8)
  dv.setUint16(12, fitCrc(buf, 0, 12), true)
  need(2)
  dv.setUint16(n, fitCrc(buf, 0, n), true)
  return buf.slice(0, n + 2)
}
