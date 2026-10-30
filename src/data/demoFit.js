// Synthetic FIT activity files for demo mode: one per demo run, built so session/laps/zones are computed from the same per-second series as the records.
import { addDays, daysBetween, today } from '../lib/dates.js'
import { FIT_EPOCH } from './fit.js'
import { encodeFit } from './fitEncode.js'

function rng(seed) { // mulberry32
  let a = seed >>> 0
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const BOUNDS = [94, 113, 132, 150, 169, 188], SEMI = 2 ** 31 / 180, M_PER_DEG = 111320

/** One FIT activity file per demo running activity in the last `days` days before `asOf`. */
export function generateDemoFitFiles(activities, { asOf = today(), days = 180, seed = 777 } = {}) {
  const rand = rng(seed), between = (a, b) => a + rand() * (b - a)
  const from = addDays(asOf, -days)
  return activities.filter(a => a.type === 'running' && a.day >= from && a.day <= asOf)
    .map(a => ({ name: `demo-${a.id}_ACTIVITY.fit`, bytes: runFile(a, rand, between, clamp((days - daysBetween(a.day, asOf)) / days, 0, 1)) }))
}

function runFile(a, rand, between, frac) {
  const T = Math.max(600, Math.round(a.movingSec || a.durationSec * .96)), D = a.distanceM || 5000
  const target = a.avgSpeed || D / T, kind = rand(), progression = kind < .25, interval = !progression && kind < .40
  const walks = []
  if (!interval && rand() < .3) {
    const n = Math.min(2 + Math.floor(rand() * 3), Math.floor((T - 540) / 110)), w = (T - 540) / Math.max(n, 1)
    for (let i = 0; i < n; i += 1) { const len = Math.round(between(30, 90)), s = Math.round(420 + i * w + rand() * (w - len - 10)); walks.push({ s, e: s + len, v: between(1.6, 1.8) }) }
  }
  const reps = interval ? Math.min(6 + Math.floor(rand() * 3), Math.floor((T - 480) / 240)) : 0
  const hasWorkout = !progression && !interval && rand() < .25, prog = 1.08 + rand() * .04

  // per-second speed profile (index = seconds of timer time), scaled so the run covers D
  const v = new Float64Array(T + 1), walk = new Uint8Array(T + 1)
  let sn = 0
  for (let t = 0; t <= T; t += 1) {
    sn = .97 * sn + .03 * (rand() * 2 - 1)
    let p = t < 360 ? .88 + .04 * t / 360 : 1 + .3 * sn
    if (progression && t >= T * .8) p = prog + .3 * sn
    if (interval && t >= 360 && t < 360 + reps * 240) p = (t - 360) % 240 < 120 ? 1.18 : .75
    v[t] = target * p
    const wk = walks.find(x => t > x.s && t <= x.e)
    if (wk) { v[t] = wk.v; walk[t] = 1 }
  }
  let walkD = 0, runD = 0
  for (let t = 1; t <= T; t += 1) if (walk[t]) walkD += v[t]; else runD += v[t]
  const onlyRun = D - walkD > runD * .3, k = onlyRun ? (D - walkD) / runD : D / (walkD + runD)
  for (let t = 0; t <= T; t += 1) if (!walk[t] || !onlyRun) v[t] *= k
  const cum = new Float64Array(T + 1)
  for (let t = 1; t <= T; t += 1) cum[t] = cum[t - 1] + v[t]

  // heart rate lags speed by ~25 s; base is solved so the time-weighted mean lands on avgHr (shifted ±2.5 bpm by fitness)
  const hrTarget = (a.avgHr || 150) + 2.5 * (1 - 2 * frac), maxHr = a.maxHr || 185
  const sm = new Float64Array(T + 1), hn = new Float64Array(T + 1), alpha = 1 - Math.exp(-1 / 25)
  let s = .55, hz = 0, meanS = 0, meanDrift = 0
  for (let t = 0; t <= T; t += 1) {
    s += (v[t] / target - s) * alpha; sm[t] = s
    hz = .7 * hz + .3 * (rand() * 4 - 2); hn[t] = clamp(hz * 1.8, -2, 2)
    if (t) { meanS += s; meanDrift += .08 * Math.max(0, t / 60 - 20) }
  }
  meanS /= T; meanDrift /= T
  const gain = clamp((hrTarget - 95 - meanDrift) / meanS, 10, 90), hr = new Uint8Array(T + 1)
  let base = hrTarget - gain * meanS - meanDrift
  for (let pass = 0; pass < 4; pass += 1) {
    let sum = 0
    for (let t = 0; t <= T; t += 1) { hr[t] = clamp(Math.round(base + gain * sm[t] + .08 * Math.max(0, t / 60 - 20) + hn[t]), 50, maxHr); if (t) sum += hr[t] }
    base += hrTarget - sum / T
  }
  const cad = new Float64Array(T + 1)
  for (let t = 0; t <= T; t += 1) cad[t] = walk[t] ? 55 : clamp(85 + 14 * (v[t] / target - 1) + hn[t] * .6, 79, 92)

  // course: an ellipse of 1.5–2.5 km in the Gulf of Guinea (0.5°N 0.5°E), never a real place
  const C = between(1500, 2500), ea = C / (2 * Math.PI) * 1.15, eb = C / (2 * Math.PI) * .85, cosLat = Math.cos(.5 * Math.PI / 180)
  const alt = new Uint32Array(T + 1)
  for (let t = 0; t <= T; t += 1) alt[t] = Math.round((900 + 6 * Math.sin(2 * Math.PI * cum[t] / C) + 500) * 5)
  const temp = Math.round(between(27, 31))
  const gps = (t, jx, jy) => { const th = 2 * Math.PI * (cum[t] % C) / C; return [Math.round((.5 + (eb * Math.sin(th) + jy) / M_PER_DEG) * SEMI), Math.round((.5 + (ea * Math.cos(th) + jx) / (M_PER_DEG * cosLat)) * SEMI)] }

  // pauses (35% of runs) in the middle third
  const pauses = []
  if (rand() < .35 && T > 900) {
    const two = rand() < .4
    pauses.push({ at: Math.round(between(T / 3, two ? T / 2 : T * 2 / 3)), len: Math.round(between(40, 150)) })
    if (two) pauses.push({ at: Math.round(between(T / 2 + 60, T * 2 / 3)), len: Math.round(between(40, 150)) })
  }
  const s0 = Math.floor(a.startTs / 1000) - FIT_EPOCH, totalPause = pauses.reduce((x, p) => x + p.len, 0)
  const wall = tt => s0 + tt + pauses.reduce((x, p) => x + (p.at < tt ? p.len : 0), 0), end = s0 + T + totalPause

  const agg = (t0, t1) => {
    const o = { dist: cum[t1] - cum[t0], hrSum: 0, hrMax: 0, vMax: 0, cadSum: 0, cadMax: 0, up: 0, down: 0, zones: Array(7).fill(0) }
    for (let t = t0 + 1; t <= t1; t += 1) {
      o.hrSum += hr[t]; o.hrMax = Math.max(o.hrMax, hr[t]); o.vMax = Math.max(o.vMax, v[t]); o.cadSum += cad[t]; o.cadMax = Math.max(o.cadMax, cad[t])
      const d = (alt[t] - alt[t - 1]) / 5
      if (d > 0) o.up += d; else o.down -= d
      o.zones[BOUNDS.filter(b => hr[t] >= b).length] += 1
    }
    const n = Math.max(t1 - t0, 1)
    return { ...o, secs: t1 - t0, hrAvg: Math.round(o.hrSum / n), cadAvg: Math.round(o.cadSum / n), speed: o.dist / n, up: Math.round(o.up), down: Math.round(o.down) }
  }

  const msgs = []
  const put = (num, fields, compressedTs) => msgs.push({ num, fields, compressedTs })
  const u32 = x => ['uint32', Math.round(x)]
  put(0, { 0: ['enum', 4], 1: ['uint16', 1], 2: ['uint16', 3289], 3: ['uint32z', 1234567890], 4: u32(s0) })
  ;[0, 4, 3, 10].forEach((type, i) => put(23, { 253: u32(s0), 0: ['uint8', i], 1: ['uint8', type], 25: ['enum', 5] }))
  if (hasWorkout) {
    put(26, { 8: ['string', 'Base'], 4: ['enum', 1], 6: ['uint16', 1] })
    put(27, { 1: ['enum', 0], 2: u32(T * 1000), 3: ['enum', 0], 5: u32(target * .9 * 1000), 6: u32(target * 1000), 7: ['enum', 5], 254: ['uint16', 0] })
  }
  const ev = (ts, type, event = 0, data = 0) => put(21, { 253: u32(ts), 0: ['enum', event], 1: ['enum', type], 3: u32(data), 4: ['uint8', 0] })
  ev(s0, 0)

  const times = new Set([0, T])
  for (let t = 0; t < T; t += 1 + Math.floor(rand() * 5)) times.add(t)
  for (const p of pauses) times.add(p.at)
  let lastTs = null, sinceFull = 0
  for (const t of [...times].sort((x, y) => x - y)) {
    const ts = wall(t), [lat, lon] = gps(t, Math.sin(t * .37) * 1.5, Math.cos(t * .29) * 1.5)
    const fields = {
      0: ['sint32', lat], 1: ['sint32', lon], 5: u32(cum[t] * 100), 73: u32(v[t] * 1000), 3: ['uint8', hr[t]], 4: ['uint8', Math.floor(cad[t])],
      53: ['uint8', cad[t] % 1 >= .5 ? 64 : 0], 78: ['uint32', alt[t]], 13: ['sint8', temp],
    }
    if (lastTs != null && sinceFull < 10 && ts - lastTs <= 31 && ts >= lastTs) { put(20, fields, ts); sinceFull += 1 }
    else { put(20, { 253: u32(ts), ...fields }); sinceFull = 0 }
    lastTs = ts
    const p = pauses.find(x => x.at === t)
    if (p) {
      ev(ts, 4, 0, 0)
      if (p.len > 120) ev(ts + 120, 3, 21, Math.round(hr[t] - between(18, 40)))
      ev(ts + p.len, 0)
      lastTs = ts + p.len
      sinceFull = 0
    }
  }
  ev(end, 4)

  const total = agg(0, T), distInt = Math.round(cum[T] * 100), nLaps = Math.ceil(distInt / 100 / 1000), cuts = [0]
  for (let t = 1, lap = 1; lap < nLaps; t += 1) if (cum[t] >= lap * 1000) { cuts.push(t); lap += 1 }
  cuts.push(T)
  const ms = x => ['uint32', Math.round(x * 1000)]
  const zoneMsg = (ref, idx, z, full) => put(216, { 0: ['uint16', ref], 1: ['uint16', idx], 2: ['uint32', z.map(x => x * 1000)], ...(full ? { 6: ['uint8', BOUNDS], 10: ['enum', 1], 11: ['uint8', 188] } : {}) })
  for (let i = 0; i < nLaps; i += 1) {
    const [t0, t1] = [cuts[i], cuts[i + 1]], g = agg(t0, t1)
    put(19, {
      253: u32(wall(t1)), 2: u32(wall(t0)), 7: ms(wall(t1) - wall(t0)), 8: ms(t1 - t0), 9: u32(g.dist * 100), 110: ms(g.speed), 111: ms(g.vMax), 15: ['uint8', g.hrAvg],
      16: ['uint8', g.hrMax], 17: ['uint8', g.cadAvg], 21: ['uint16', g.up], 22: ['uint16', g.down], 24: ['enum', i === nLaps - 1 ? 7 : 2], 254: ['uint16', i],
    })
  }
  zoneMsg(18, 0, total.zones, true)
  for (let i = 0; i < nLaps; i += 1) zoneMsg(19, i, agg(cuts[i], cuts[i + 1]).zones, false)

  if (walks.length) {
    const edges = [0, ...walks.flatMap(x => [x.s, x.e]), T], segs = []
    for (let i = 0; i + 1 < edges.length; i += 1) if (edges[i + 1] > edges[i]) segs.push({ t0: edges[i], t1: edges[i + 1], type: i % 2 ? 18 : 17 })
    const sum = { 17: { n: 0, secs: 0, dist: 0, hrW: 0, hrMax: 0 }, 18: { n: 0, secs: 0, dist: 0, hrW: 0, hrMax: 0 } }
    segs.forEach((x, i) => {
      const g = agg(x.t0, x.t1), q = sum[x.type]
      q.n += 1; q.secs += g.secs; q.dist += g.dist; q.hrW += g.hrSum; q.hrMax = Math.max(q.hrMax, g.hrMax)
      put(312, { 0: ['enum', x.type], 1: ms(wall(x.t1) - wall(x.t0)), 2: ms(g.secs), 3: u32(g.dist * 100), 4: ms(g.speed), 9: u32(wall(x.t0)), 27: u32(wall(x.t1)), 15: ['uint8', g.hrAvg], 16: ['uint8', g.hrMax], 254: ['uint16', i] })
    })
    for (const type of [17, 18]) {
      const q = sum[type]
      put(313, { 0: ['enum', type], 3: ['uint16', q.n], 4: ms(q.secs), 5: u32(q.dist * 100), 6: ms(q.dist / Math.max(q.secs, 1)), 10: ['uint8', Math.round(q.hrW / Math.max(q.secs, 1))], 11: ['uint8', q.hrMax] })
    }
  }

  put(18, {
    253: u32(end), 2: u32(s0), 5: ['enum', 1], 6: ['enum', 0], 7: ms(end - s0), 8: ms(T), 9: u32(distInt), 124: ms(distInt / 100 / T), 125: ms(total.vMax), 16: ['uint8', total.hrAvg],
    17: ['uint8', total.hrMax], 18: ['uint8', total.cadAvg], 19: ['uint8', Math.round(total.cadMax)], 22: ['uint16', total.up], 23: ['uint16', total.down], 11: ['uint16', a.calories ?? 0],
    24: ['uint8', Math.round((a.aerobicTE ?? 0) * 10)], 137: ['uint8', Math.round((a.anaerobicTE ?? 0) * 10)], 168: ['sint32', Math.round((a.trainingLoad ?? 0) * 65536)],
    110: ['string', 'Run'], 25: ['uint16', 0], 26: ['uint16', nLaps], ...(rand() < .5 ? { 193: ['uint8', 30 + 10 * Math.floor(rand() * 6)] } : {}),
  })
  put(34, { 253: u32(end), 0: ms(T), 1: ['uint16', 1], 2: ['enum', 0], 5: u32(end + 19800) })
  return encodeFit(msgs)
}
