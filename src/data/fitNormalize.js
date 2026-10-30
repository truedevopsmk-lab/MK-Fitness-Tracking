// Decoded FIT messages (fit.js) → a FitWorkout summary + a columnar FitSeries (see schema.js). Pure, tested in scripts/test-fit.mjs.
// Scales and field numbers follow Garmin's FIT profile. Anything missing stays null; nothing is guessed.
import { toDay } from '../lib/dates.js'
import { fitMs } from './fit.js'

export const FIT_PARSER_VERSION = 1

const M = { fileId: 0, userProfile: 3, zones: 7, sport: 12, session: 18, lap: 19, record: 20, event: 21, device: 23, workout: 26, step: 27, activity: 34, hrv: 78, timeInZone: 216, split: 312, splitSummary: 313 }
const sc = (v, s, o = 0) => typeof v === 'number' ? v / s - o : null
const deg = v => typeof v === 'number' ? Math.round(v * (180 / 2 ** 31) * 1e6) / 1e6 : null
const pos = v => typeof v === 'number' && v > 0 ? v : null
const r1 = v => v == null ? null : Math.round(v * 10) / 10

const SPORTS = { 0: 'generic', 1: 'running', 2: 'cycling', 4: 'fitness_equipment', 5: 'swimming', 10: 'training', 11: 'walking', 12: 'cross_country_skiing', 13: 'alpine_skiing', 15: 'rowing', 16: 'mountaineering', 17: 'hiking', 19: 'paddling', 21: 'e_biking', 25: 'golf', 31: 'rock_climbing', 37: 'stand_up_paddleboarding', 41: 'kayaking', 47: 'boxing', 62: 'hiit', 64: 'racket', 67: 'meditation', 83: 'dance', 84: 'jump_rope' }
const SUB_TYPES = { '1:1': 'treadmill_running', '1:3': 'trail_running', '1:4': 'track_running', '1:45': 'indoor_running', '2:5': 'indoor_cycling', '2:6': 'indoor_cycling', '2:7': 'road_biking', '2:8': 'mountain_biking', '2:46': 'gravel_cycling', '4:15': 'elliptical', '4:16': 'stair_climbing', '4:14': 'indoor_rowing', '5:17': 'lap_swimming', '5:18': 'open_water_swimming', '10:20': 'strength_training', '10:26': 'indoor_cardio', '10:43': 'yoga', '10:44': 'pilates', '11:27': 'indoor_walking' }
/** Garmin-style type key ('running', 'trail_running', …) from FIT sport/subSport numbers. */
export const typeKeyOf = (sport, sub) => SUB_TYPES[`${sport}:${sub}`] ?? SPORTS[sport] ?? 'activity'
const STRIDE_SPORTS = new Set([1, 11, 17]) // FIT stores strides/min for these; Garmin shows steps/min (×2)

export const SPLIT_TYPES = { 3: 'active', 4: 'rest', 5: 'warmup', 6: 'cooldown', 7: 'recovery', 12: 'run', 13: 'rest', 17: 'run', 18: 'walk', 22: 'stand' }
const LAP_TRIGGERS = ['manual', 'time', 'distance', 'position', 'position', 'position', 'position', 'end', 'equipment']
const LOCAL_SENSORS = { 0: 'GPS', 1: 'GPS', 2: 'GPS', 3: 'Accelerometer', 4: 'Barometer', 5: 'Temperature', 10: 'Wrist heart rate' }
const ANT_SENSORS = { 120: 'Heart-rate strap', 124: 'Foot pod', 11: 'Power meter', 121: 'Speed/cadence sensor', 122: 'Cadence sensor', 123: 'Speed sensor' }
const BLE_SENSORS = { 1: 'Heart-rate strap', 2: 'Power meter', 3: 'Speed/cadence sensor', 4: 'Speed sensor', 5: 'Cadence sensor', 6: 'Foot pod' }
const RECOVERY_HR = 21, TIMER = 0

/** Timer-running intervals [startTs, endTs] (ms) from timer start/stop events; the whole session when there are none. */
export function timerIntervals(events, startTs, endTs) {
  const out = []
  let on = null
  for (const e of events) {
    if (e[0] !== TIMER || e[253] == null) continue
    const t = fitMs(e[253])
    if (e[1] === 0) { if (on == null) on = t }
    else if ([1, 4, 8, 9].includes(e[1]) && on != null) { if (t > on) out.push([on, t]); on = null }
  }
  if (on != null && endTs > on) out.push([on, endTs])
  return out.length ? out : [[startTs, endTs]]
}

/** Seconds of timer time before `ts` (ms). */
export function timerAt(intervals, ts) {
  let s = 0
  for (const [a, b] of intervals) { if (ts <= a) break; s += (Math.min(ts, b) - a) / 1000 }
  return s
}

function sensorsOf(devices) {
  const seen = new Set()
  for (const d of devices) {
    const label = d[25] === 5 ? LOCAL_SENSORS[d[1]] : d[25] === 1 || d[25] === 0 ? ANT_SENSORS[d[1]] : d[25] === 3 ? BLE_SENSORS[d[1]] : null
    if (label) seen.add(label)
  }
  return [...seen]
}

const ZONE_CALC = { 0: 'custom', 1: 'percentMaxHr', 2: 'percentHrr', 3: 'percentLthr' }
/** The watch's own time in HR zones for a session, with the boundaries it used. */
function zonesFrom(tiz, si) {
  const ses = tiz.filter(t => t[0] === M.session && Array.isArray(t[2]))
  const z = ses.find(t => (t[1] ?? 0) === si) ?? ses[0]
  const ref = Array.isArray(z?.[6]) ? z : tiz.find(t => Array.isArray(t[6]))
  if (!z && !ref) return null
  return { secs: z ? z[2].map(v => sc(v, 1000) ?? 0) : null, bounds: ref?.[6] ?? null, calc: ZONE_CALC[ref?.[10]] ?? null, maxHr: pos(ref?.[11]), restingHr: pos(ref?.[12]), thresholdHr: pos(ref?.[13]) }
}

/** Local day of an instant, using the watch's UTC offset when the file has one. */
function localDayOf(ts, offsetMin) {
  if (offsetMin == null) return toDay(new Date(ts))
  const d = new Date(ts + offsetMin * 60000), p = n => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`
}

/** File name without folders or the e-mail prefix Garmin's account export puts on uploaded files. */
function safeName(name) {
  const base = String(name || '').split(/[\\/]/).pop()
  return base.includes('@') ? base.slice(base.lastIndexOf('_') + 1) : base || null
}

function workoutOf(workouts, steps) {
  if (!workouts.length && !steps.length) return null
  const w = workouts[0] || {}
  return {
    name: w[8] ?? null,
    steps: steps.map(s => {
      const type = s[3], durType = s[1]
      const lo = s[5], hi = s[6]
      const target = type === 0 && (lo || hi) ? { kind: 'speed', lo: sc(lo, 1000), hi: sc(hi, 1000) }
        : type === 1 && (lo || hi) ? { kind: 'heartRate', lo: lo > 100 ? lo - 100 : null, hi: hi > 100 ? hi - 100 : null, loPct: lo > 0 && lo <= 100 ? lo : null, hiPct: hi > 0 && hi <= 100 ? hi : null }
          : null
      return {
        index: s[254] ?? null, name: s[0] ?? null,
        durationSec: durType === 0 || durType === 28 ? sc(s[2], 1000) : null, durationM: durType === 1 ? sc(s[2], 100) : null,
        intensity: ['active', 'rest', 'warmup', 'cooldown', 'recovery', 'interval', 'other'][s[7]] ?? null, target,
      }
    }),
  }
}

/**
 * @param {{ messages: object }} decoded  from decodeFit()
 * @param {{ fileName?: string, size?: number, sha256?: string, importedAt?: number }} [file]
 * @returns {{ workouts: Array<{ workout: object, series: object }>, kind: string|null, skipped?: string }}
 *   One entry per session (multisport files have several). `kind` is the FIT file type ('activity', 'monitoring', …).
 */
export function normalizeFit(decoded, file = {}) {
  const m = decoded.messages, get = n => m[n] || []
  const fid = get(M.fileId)[0] || {}
  const kind = { 1: 'device', 2: 'settings', 3: 'sport', 4: 'activity', 5: 'workout', 6: 'course', 9: 'weight', 15: 'monitoring', 28: 'monitoring', 32: 'monitoring', 34: 'segment' }[fid[0]] ?? (fid[0] == null ? null : 'other')
  const sessions = get(M.session)
  if (kind !== 'activity' && !(kind == null && sessions.length)) return { workouts: [], kind, skipped: 'not-activity' }
  if (!sessions.length) return { workouts: [], kind, skipped: 'no-session' }

  const records = get(M.record).filter(r => r[253] != null).sort((a, b) => a[253] - b[253])
  const events = get(M.event).filter(e => e[253] != null).sort((a, b) => a[253] - b[253])
  const laps = get(M.lap), act = get(M.activity)[0] || {}, profile = get(M.userProfile)[0] || {}, zt = get(M.zones)[0] || {}
  const offsetMin = act[5] != null && act[253] != null ? Math.round((act[5] - act[253]) / 60) : null
  const sensors = sensorsOf(get(M.device)), workout = workoutOf(get(M.workout), get(M.step))
  const rr = get(M.hrv).reduce((n, h) => n + (Array.isArray(h[0]) ? h[0].filter(v => v != null).length : h[0] != null ? 1 : 0), 0)
  const fingerprint = `${fid[3] ?? 0}-${fid[4] ?? sessions[0][2] ?? 0}`

  const workouts = sessions.map((s, si) => {
    const startTs = fitMs(s[2] ?? records[0]?.[253]), elapsedSec = sc(s[7], 1000)
    const endTs = s[253] != null ? fitMs(s[253]) : startTs + (elapsedSec ?? 0) * 1000
    const recs = records.filter(r => { const t = fitMs(r[253]); return t >= startTs - 1000 && t <= endTs + 1000 })
    const intervals = timerIntervals(events.filter(e => { const t = fitMs(e[253]); return t >= startTs - 1000 && t <= endTs + 1000 }), startTs, endTs)
    const sport = s[5] ?? get(M.sport)[0]?.[0] ?? null, subSport = s[6] ?? get(M.sport)[0]?.[1] ?? null
    const cadX = STRIDE_SPORTS.has(sport) ? 2 : 1
    const cad = (whole, frac) => typeof whole === 'number' ? Math.round((whole + (sc(frac, 128) ?? 0)) * cadX * 10) / 10 : null
    const id = sessions.length > 1 ? `fit-${fingerprint}-${si}` : `fit-${fingerprint}`

    const first = s[25] ?? 0, n = s[26] ?? laps.length
    const lapList = (sessions.length > 1 ? laps.slice(first, first + n) : laps).map((l, i) => ({
      index: i, startTs: fitMs(l[2]), elapsedSec: sc(l[7], 1000), timerSec: sc(l[8], 1000), movingSec: sc(l[52], 1000), distanceM: sc(l[9], 100),
      avgSpeed: sc(l[110] ?? l[13], 1000), maxSpeed: sc(l[111] ?? l[14], 1000), avgHr: pos(l[15]), maxHr: pos(l[16]), minHr: pos(l[63]),
      avgCadence: cad(l[17], l[80]), avgPower: pos(l[19]), ascentM: l[21] ?? null, descentM: l[22] ?? null, calories: l[11] ?? null,
      trigger: LAP_TRIGGERS[l[24]] ?? null, intensity: ['active', 'rest', 'warmup', 'cooldown', 'recovery', 'interval', 'other'][l[23]] ?? null, stepIndex: l[71] ?? null,
    }))

    const splits = get(M.split).filter(x => SPLIT_TYPES[x[0]]).map(x => ({
      type: SPLIT_TYPES[x[0]], startTs: fitMs(x[9]), endTs: fitMs(x[27]), timerSec: sc(x[2], 1000), distanceM: sc(x[3], 100),
      avgSpeed: sc(x[4], 1000), avgHr: pos(x[15]), maxHr: pos(x[16]),
    })).filter(x => x.startTs >= startTs - 1000 && x.startTs <= endTs)
    const splitSummary = get(M.splitSummary).filter(x => SPLIT_TYPES[x[0]]).map(x => ({
      type: SPLIT_TYPES[x[0]], count: x[3] ?? null, timerSec: sc(x[4], 1000), distanceM: sc(x[5], 100), avgSpeed: sc(x[6], 1000), avgHr: pos(x[10]), maxHr: pos(x[11]),
    }))

    const recovery = events.filter(e => e[0] === RECOVERY_HR && e[1] === 3 && pos(e[3])).map(e => {
      const at = fitMs(e[253])
      const stop = [...events].reverse().find(x => x[0] === TIMER && [1, 4].includes(x[1]) && fitMs(x[253]) <= at && at - fitMs(x[253]) <= 150000)
      const stopTs = stop ? fitMs(stop[253]) : null
      const last = stopTs != null ? [...recs].reverse().find(r => fitMs(r[253]) <= stopTs && pos(r[3])) : null
      return { at, stopTs, hrAtStop: last ? last[3] : null, hrAfter: e[3], afterSec: stopTs != null ? Math.round((at - stopTs) / 1000) : null }
    }).filter(x => x.at >= startTs && x.at <= endTs + 180000)

    const series = { id, t: [], tt: [], dist: [], speed: [], hr: [], cad: [], alt: [], lat: [], lon: [], temp: [], power: [], vo: [], gct: [], stepLen: [], resp: [] }
    for (const r of recs) {
      const ts = fitMs(r[253])
      series.t.push(Math.round((ts - startTs) / 1000)); series.tt.push(Math.round(timerAt(intervals, ts) * 10) / 10)
      series.dist.push(sc(r[5], 100)); series.speed.push(sc(r[73] ?? r[6], 1000)); series.hr.push(pos(r[3]))
      series.cad.push(cad(r[4], r[53])); series.alt.push(r[78] != null ? r1(sc(r[78], 5, 500)) : r[2] != null ? r1(sc(r[2], 5, 500)) : null)
      series.lat.push(deg(r[0])); series.lon.push(deg(r[1])); series.temp.push(r[13] ?? null); series.power.push(r[7] ?? null)
      series.vo.push(sc(r[39], 10)); series.gct.push(sc(r[41], 10)); series.stepLen.push(sc(r[85], 10)); series.resp.push(sc(r[108], 100) ?? r[99] ?? null)
    }
    for (const k of Object.keys(series)) if (k !== 'id' && series[k].every(v => v == null)) series[k] = null

    const w = {
      id, source: 'fit', parser: FIT_PARSER_VERSION, fingerprint, sessionIndex: si,
      fileName: safeName(file.fileName),
      fileSize: file.size ?? null, sha256: file.sha256 ?? null, importedAt: file.importedAt ?? null, crcOk: decoded.crcOk !== false,
      garminId: (String(file.fileName || '').match(/(\d{8,})(?:_[A-Z]+)?\.fit$/i) || [])[1] ?? null, activityId: null,
      sport, subSport, type: typeKeyOf(sport, subSport), profileName: s[110] ?? get(M.sport)[0]?.[3] ?? null,
      startTs, endTs, day: localDayOf(startTs, offsetMin), utcOffsetMin: offsetMin,
      elapsedSec, timerSec: sc(s[8], 1000), movingSec: sc(s[59], 1000), distanceM: sc(s[9], 100),
      avgSpeed: sc(s[124] ?? s[14], 1000), maxSpeed: sc(s[125] ?? s[15], 1000), avgHr: pos(s[16]), maxHr: pos(s[17]), minHr: pos(s[64]),
      avgCadence: cad(s[18], s[92]), maxCadence: cad(s[19], s[93]), avgPower: pos(s[20]), maxPower: pos(s[21]),
      ascentM: s[22] ?? null, descentM: s[23] ?? null, calories: s[11] ?? null,
      aerobicTE: sc(s[24], 10), anaerobicTE: sc(s[137], 10), trainingLoad: s[168] != null ? Math.round(s[168] / 65536 * 10) / 10 : null,
      feel: s[192] ?? null, rpe: s[193] != null ? s[193] / 10 : null,
      avgTempC: s[57] ?? null, minTempC: s[150] ?? null, maxTempC: s[58] ?? null,
      avgStepLengthMm: sc(s[134], 10), avgVerticalOscMm: sc(s[89], 10), avgGroundContactMs: sc(s[91], 10), avgVerticalRatio: sc(s[132], 100), avgRespiration: sc(s[169], 100),
      maxHrSetting: pos(zt[1]) ?? pos(profile[11]), restingHrSetting: pos(profile[8]), thresholdHrSetting: pos(zt[2]),
      pauses: intervals.slice(1).map(([a], i) => ({ fromTs: intervals[i][1], toTs: a, sec: Math.round((a - intervals[i][1]) / 1000) })),
      laps: lapList, splits, splitSummary, zones: zonesFrom(get(M.timeInZone), si), workout, recovery, sensors,
      counts: { records: recs.length, events: events.length, laps: lapList.length, splits: splits.length, rrIntervals: rr, devFields: Object.values(decoded.devFields || {}).reduce((a, b) => a + b, 0) },
    }
    return { workout: w, series }
  })
  return { workouts, kind }
}
