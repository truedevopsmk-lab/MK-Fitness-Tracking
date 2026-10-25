// Garmin payload → normalised shapes (see schema.js). Garmin returns inconsistent shapes
// (arrays vs wrapped objects, calendarDate vs date, nested vs flat), so everything here is
// defensive: unknown/missing fields become null and junk never throws.
import { dayOf, toDay } from '../lib/dates.js'

const isObj = v => v != null && typeof v === 'object' && !Array.isArray(v)

/** Finite number from a number or numeric string, else null. */
export function num(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string' && v.trim() !== '') { const n = Number(v); return Number.isFinite(n) ? n : null }
  return null
}
/** First key of `obj` holding a numeric value. */
export function pickNumber(obj, keys) {
  if (!isObj(obj)) return null
  for (const k of keys) { const n = num(obj[k]); if (n != null) return n }
  return null
}
const pickString = (obj, keys) => { if (!isObj(obj)) return null; for (const k of keys) if (typeof obj[k] === 'string' && obj[k].trim()) return obj[k]; return null }
const scoreOf = v => num(v) ?? (isObj(v) ? num(v.value) ?? num(v.score) : null)
const nz = v => v == null ? null : v
const round = (n, d = 0) => n == null ? null : Math.round(n * 10 ** d) / 10 ** d
const has = rec => isObj(rec) && Object.values(rec).some(v => v != null && !(Array.isArray(v) && !v.length))

/** Epoch ms from epoch (s or ms) or a Garmin timestamp string. Zone-less strings are UTC ("GMT" fields). */
export function tsOf(v) {
  if (v == null || v === '') return null
  if (typeof v === 'number') return !Number.isFinite(v) ? null : v < 1e11 ? Math.round(v * 1000) : v
  let s = String(v).trim()
  if (/^\d+(\.\d+)?$/.test(s)) return tsOf(Number(s))
  s = s.replace(' ', 'T')
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += 'T00:00:00Z'
  else if (!/[zZ]$|[+-]\d{2}:?\d{2}$/.test(s)) s += 'Z'
  const t = Date.parse(s)
  return Number.isNaN(t) ? null : t
}

/** Rows from an array, or from the first array found under one of `keys`, else the object itself. */
export function rowsOf(json, keys = []) {
  if (Array.isArray(json)) return json.filter(r => r != null && typeof r === 'object')
  if (!isObj(json)) return []
  for (const k of keys) if (Array.isArray(json[k])) return json[k].filter(r => r != null && typeof r === 'object')
  return [json]
}

export const rowDay = row => isObj(row) ? dayOf(row.calendarDate ?? row.date ?? row.summaryDate ?? row.startDate ?? row.startTimeLocal ?? row.startTimestampLocal ?? row.startTimeGMT) : null

/** Depth-first search for the first numeric value under any of `keys` (v1's firstNumber). */
export function firstNumber(value, keys, depth = 0) {
  if (value == null || depth > 6) return null
  if (Array.isArray(value)) { for (const x of value) { const n = firstNumber(x, keys, depth + 1); if (n != null) return n } return null }
  if (!isObj(value)) return null
  const direct = pickNumber(value, keys)
  if (direct != null) return direct
  for (const v of Object.values(value)) { const n = firstNumber(v, keys, depth + 1); if (n != null) return n }
  return null
}

// ---- Sleep -------------------------------------------------------------------------------

const STAGE_BY_LEVEL = { 0: 'deep', 1: 'light', 2: 'rem', 3: 'awake' }

/** One Garmin sleep payload (wrapped `{dailySleepDTO}` or flat) → `{ day, sleep }` or null. */
export function sleepFrom(raw) {
  if (!isObj(raw)) return null
  const dto = isObj(raw.dailySleepDTO) ? raw.dailySleepDTO : raw
  const scores = dto.sleepScores ?? raw.sleepScores
  const score = scoreOf(scores?.overall) ?? scoreOf(scores?.overallScore) ?? scoreOf(dto.overallSleepScore) ?? scoreOf(dto.sleepScore) ?? scoreOf(raw.sleepScore) ?? scoreOf(dto.score)
  const deepSec = pickNumber(dto, ['deepSleepSeconds']), lightSec = pickNumber(dto, ['lightSleepSeconds'])
  const remSec = pickNumber(dto, ['remSleepSeconds']), awakeSec = pickNumber(dto, ['awakeSleepSeconds'])
  const stagesSum = [deepSec, lightSec, remSec].some(v => v != null) ? (deepSec || 0) + (lightSec || 0) + (remSec || 0) : null
  const startTs = tsOf(dto.sleepStartTimestampGMT ?? dto.sleepStartTimeGMT ?? dto.startTimeGMT), endTs = tsOf(dto.sleepEndTimestampGMT ?? dto.sleepEndTimeGMT ?? dto.endTimeGMT)
  const need = pickNumber(dto.sleepNeed, ['actual', 'baseline'])
  const sleep = {
    score: score != null && score >= 0 && score <= 100 ? score : null,
    qualifier: pickString(scores?.overall, ['qualifierKey']) ?? pickString(scores, ['qualifierKey']) ?? pickString(dto, ['sleepScoreQualifier', 'qualifier']),
    durationSec: pickNumber(dto, ['sleepTimeSeconds']) ?? stagesSum,
    deepSec, lightSec, remSec, awakeSec, startTs, endTs,
    needSec: need == null ? null : need <= 1440 ? need * 60 : need,
    restingHr: pickNumber(dto, ['restingHeartRate']) ?? pickNumber(raw, ['restingHeartRate']),
    avgHr: pickNumber(dto, ['avgHeartRate', 'averageHeartRate']),
    avgHrv: pickNumber(dto, ['avgOvernightHrv']) ?? pickNumber(raw, ['avgOvernightHrv']),
    avgRespiration: pickNumber(dto, ['averageRespirationValue', 'avgRespirationValue']),
    avgSpo2: pickNumber(dto, ['averageSpO2Value', 'avgSpo2']),
    bodyBatteryChange: pickNumber(raw, ['bodyBatteryChange']) ?? pickNumber(dto, ['bodyBatteryChange']),
  }
  const levels = Array.isArray(raw.sleepLevels) ? raw.sleepLevels : Array.isArray(dto.sleepLevels) ? dto.sleepLevels : []
  const stages = levels.map(l => ({ start: tsOf(l?.startGMT ?? l?.start), end: tsOf(l?.endGMT ?? l?.end), stage: STAGE_BY_LEVEL[Math.round(num(l?.activityLevel))] }))
    .filter(s => s.start != null && s.end != null && s.end > s.start && s.stage).sort((a, b) => a.start - b.start)
  if (stages.length) sleep.stages = stages
  if (sleep.score == null && sleep.durationSec == null && !stages.length) return null
  const day = dayOf(dto.calendarDate ?? raw.calendarDate ?? raw.date ?? dto.date) ?? (endTs != null ? toDay(new Date(endTs)) : null)
  return day ? { day, sleep } : null
}

export function sleepDays(json) {
  const rows = isObj(json) && (json.dailySleepDTO || json.sleepLevels) ? [json] : rowsOf(json, ['sleep', 'dailySleepSummaries', 'dailySleepDTOList', 'sleepSummaries'])
  const out = {}
  for (const r of rows) { const s = sleepFrom(r); if (s) out[s.day] = { sleep: s.sleep } }
  return out
}

// ---- Body Battery ------------------------------------------------------------------------

/** Garmin sample → [epochMs, level]. Accepts [ts, level] and [ts, 'MEASURED', level, version]. */
function bbSample(s) {
  if (Array.isArray(s)) {
    const level = typeof s[1] === 'string' && !/^\d+(\.\d+)?$/.test(s[1]) ? num(s[2]) : num(s[1])
    const ts = tsOf(s[0])
    return ts != null && level != null ? [ts, level] : null
  }
  if (isObj(s)) { const ts = tsOf(s.timestamp ?? s.startTimestampGMT ?? s.ts), level = num(s.level ?? s.value ?? s.bodyBatteryLevel); return ts != null && level != null ? [ts, level] : null }
  return null
}

export function bodyBatteryFrom(raw) {
  if (!isObj(raw)) return null
  const samples = (Array.isArray(raw.bodyBatteryValuesArray) ? raw.bodyBatteryValuesArray : []).map(bbSample).filter(Boolean).sort((a, b) => a[0] - b[0])
  let charged = 0, drained = 0
  for (let i = 1; i < samples.length; i++) { const d = samples[i][1] - samples[i - 1][1]; if (d > 0) charged += d; else drained -= d }
  const levels = samples.map(s => s[1])
  const bb = {
    start: samples.length ? samples[0][1] : null,
    end: samples.length ? samples.at(-1)[1] : pickNumber(raw, ['bodyBatteryValue']),
    high: levels.length ? Math.max(...levels) : pickNumber(raw, ['bodyBatteryHighestValue']),
    low: levels.length ? Math.min(...levels) : pickNumber(raw, ['bodyBatteryLowestValue']),
    charged: pickNumber(raw, ['charged', 'bodyBatteryChargedValue']) ?? (samples.length > 1 ? charged : null),
    drained: pickNumber(raw, ['drained', 'bodyBatteryDrainedValue']) ?? (samples.length > 1 ? drained : null),
  }
  if (samples.length) bb.samples = samples
  const day = rowDay(raw) ?? (samples.length ? toDay(new Date(samples[0][0])) : null)
  return day && has({ ...bb, samples: undefined }) ? { day, bodyBattery: bb } : null
}

// ---- Simple daily rows -------------------------------------------------------------------

const valuesOf = row => isObj(row.values) ? { ...row, ...row.values } : row

export function stepsFrom(row) {
  if (!isObj(row)) return null
  const r = valuesOf(row), day = rowDay(row)
  const steps = { total: pickNumber(r, ['totalSteps', 'steps']), goal: pickNumber(r, ['stepGoal', 'dailyStepGoal']), distanceM: pickNumber(r, ['totalDistance', 'totalDistanceMeters']) }
  return day && steps.total != null ? { day, steps } : null
}

export function stressFrom(row) {
  if (!isObj(row)) return null
  const r = valuesOf(row), day = rowDay(row)
  const stress = {
    avg: pickNumber(r, ['overallStressLevel', 'averageStressLevel', 'avgStress']), max: pickNumber(r, ['maxStressLevel']),
    restSec: pickNumber(r, ['restStressDuration']), lowSec: pickNumber(r, ['lowStressDuration']), mediumSec: pickNumber(r, ['mediumStressDuration']), highSec: pickNumber(r, ['highStressDuration']),
  }
  // Garmin uses -1/-2 for "not enough data"
  if (stress.avg != null && stress.avg < 0) stress.avg = null
  if (stress.max != null && stress.max < 0) stress.max = null
  return day && has(stress) ? { day, stress } : null
}

export function hrvFrom(row) {
  if (!isObj(row)) return null
  const r = isObj(row.hrvSummary) ? { ...row, ...row.hrvSummary } : row, day = rowDay(r)
  const b = isObj(r.baseline) ? r.baseline : {}
  const hrv = {
    lastNight: pickNumber(r, ['lastNightAvg', 'lastNight', 'hrvValue']), weeklyAvg: pickNumber(r, ['weeklyAvg']), lastNightHigh: pickNumber(r, ['lastNight5MinHigh']),
    status: pickString(r, ['status']), baselineLow: pickNumber(b, ['balancedLow']), baselineHigh: pickNumber(b, ['balancedUpper']),
  }
  return day && has(hrv) ? { day, hrv } : null
}

const gramsToKg = w => w == null ? null : round(w > 1000 ? w / 1000 : w, 2)
export function weightFrom(row) {
  if (!isObj(row)) return null
  const lw = isObj(row.latestWeight) ? row.latestWeight : row
  const kg = gramsToKg(pickNumber(lw, ['weight']) ?? pickNumber(row, ['weight']))
  const day = rowDay(lw) ?? rowDay(row)
  return day && kg != null && kg > 0 ? { day, weight: { kg } } : null
}

export function userSummaryFrom(row, fallbackDay) {
  if (!isObj(row)) return null
  const day = rowDay(row) ?? fallbackDay
  const out = {}
  const hr = { resting: pickNumber(row, ['restingHeartRate']), min: pickNumber(row, ['minHeartRate']), max: pickNumber(row, ['maxHeartRate']) }
  const intensity = { moderate: pickNumber(row, ['moderateIntensityMinutes']), vigorous: pickNumber(row, ['vigorousIntensityMinutes']), goal: pickNumber(row, ['intensityMinutesGoal']) }
  const stress = {
    avg: pickNumber(row, ['averageStressLevel']), max: pickNumber(row, ['maxStressLevel']), restSec: pickNumber(row, ['restStressDuration']), lowSec: pickNumber(row, ['lowStressDuration']),
    mediumSec: pickNumber(row, ['mediumStressDuration']), highSec: pickNumber(row, ['highStressDuration']),
  }
  if (stress.avg != null && stress.avg < 0) stress.avg = null
  if (stress.max != null && stress.max < 0) stress.max = null
  const bb = { high: pickNumber(row, ['bodyBatteryHighestValue']), low: pickNumber(row, ['bodyBatteryLowestValue']), charged: pickNumber(row, ['bodyBatteryChargedValue']), drained: pickNumber(row, ['bodyBatteryDrainedValue']) }
  const steps = { total: pickNumber(row, ['totalSteps']), goal: pickNumber(row, ['dailyStepGoal']), distanceM: pickNumber(row, ['totalDistanceMeters']) }
  if (has(hr)) out.heartRate = hr
  if (has(intensity)) out.intensity = intensity
  if (has(stress)) out.stress = stress
  if (has(bb)) out.bodyBattery = bb
  if (steps.total != null) out.steps = steps
  return day && Object.keys(out).length ? { day, ...out } : null
}

export function readinessFrom(row, fallbackDay) {
  if (!isObj(row)) return null
  const day = rowDay(row) ?? fallbackDay
  const readiness = { score: pickNumber(row, ['score', 'trainingReadinessScore']), level: pickString(row, ['level']), feedback: pickString(row, ['feedbackShort', 'feedbackLong', 'feedback']) }
  return day && readiness.score != null ? { day, readiness } : null
}

export function intensityFrom(row) {
  if (!isObj(row)) return null
  const r = valuesOf(row), day = rowDay(row)
  const intensity = { moderate: pickNumber(r, ['moderateValue', 'moderateIntensityMinutes', 'moderate']), vigorous: pickNumber(r, ['vigorousValue', 'vigorousIntensityMinutes', 'vigorous']), goal: pickNumber(r, ['weeklyGoal', 'intensityMinutesGoal', 'goal']) }
  return day && has(intensity) ? { day, intensity } : null
}

export function heartRateFrom(row, fallbackDay) {
  if (!isObj(row)) return null
  const day = rowDay(row) ?? fallbackDay
  const heartRate = { resting: pickNumber(row, ['restingHeartRate', 'restingHR']), min: pickNumber(row, ['minHeartRate']), max: pickNumber(row, ['maxHeartRate']) }
  return day && has(heartRate) ? { day, heartRate } : null
}

// ---- Activities & training ---------------------------------------------------------------

export function activityFrom(raw) {
  if (!isObj(raw)) return null
  const local = raw.startTimeLocal ?? raw.startDate ?? raw.startTimeGMT
  const day = dayOf(local)
  if (!day) return null
  const startTs = tsOf(raw.startTimeGMT) ?? tsOf(raw.beginTimestamp) ?? null
  const name = typeof raw.activityName === 'string' && raw.activityName.trim() ? raw.activityName : null
  const type = pickString(raw.activityType, ['typeKey']) ?? pickString(raw, ['activityTypeKey', 'typeKey']) ?? 'activity'
  const id = raw.activityId ?? raw.activityIdString ?? raw.id
  const zones = [1, 2, 3, 4, 5].map(i => num(raw[`hrTimeInZone_${i}`]))
  return {
    id: id != null ? String(id) : `${local}-${name || type}`,
    name: name || type.replace(/_/g, ' '),
    type, day, startTs,
    durationSec: pickNumber(raw, ['duration', 'elapsedDuration']), movingSec: pickNumber(raw, ['movingDuration']),
    distanceM: pickNumber(raw, ['distance', 'totalDistance']), calories: pickNumber(raw, ['calories']),
    avgHr: pickNumber(raw, ['averageHR', 'avgHr']), maxHr: pickNumber(raw, ['maxHR', 'maxHr']),
    elevationGainM: pickNumber(raw, ['elevationGain']), avgSpeed: pickNumber(raw, ['averageSpeed']),
    trainingLoad: pickNumber(raw, ['activityTrainingLoad']), aerobicTE: pickNumber(raw, ['aerobicTrainingEffect']), anaerobicTE: pickNumber(raw, ['anaerobicTrainingEffect']),
    steps: pickNumber(raw, ['steps']), hrZonesSec: zones.some(z => z != null) ? zones.map(z => z ?? 0) : null,
    raw,
  }
}

/** Group activities by day → `{ day: { count, durationSec, distanceM, calories, load } }`. */
export function trainingByDay(activities) {
  const out = {}
  for (const a of activities || []) {
    if (!a?.day) continue
    const t = out[a.day] ||= { count: 0, durationSec: 0, distanceM: 0, calories: 0, load: null }
    t.count += 1; t.durationSec += a.durationSec || 0; t.distanceM += a.distanceM || 0; t.calories += a.calories || 0
    if (a.trainingLoad != null) t.load = (t.load || 0) + a.trainingLoad
  }
  for (const t of Object.values(out)) { t.durationSec = Math.round(t.durationSec); t.distanceM = Math.round(t.distanceM); t.calories = Math.round(t.calories); if (t.load != null) t.load = round(t.load, 1) }
  return out
}

export function activitiesFrom(json) {
  const items = Array.isArray(json) ? json : (json?.activities ?? json?.summarizedActivities ?? json?.activityList ?? [])
  return (Array.isArray(items) ? items : []).map(activityFrom).filter(Boolean)
}

// ---- Profile -----------------------------------------------------------------------------

function findKey(value, keys, depth = 0) {
  if (!value || typeof value !== 'object' || depth > 4) return null
  for (const k of keys) if (value[k] != null && typeof value[k] !== 'object' && value[k] !== '') return value[k]
  for (const v of Object.values(value)) { const f = findKey(v, keys, depth + 1); if (f != null) return f }
  return null
}

export function profileFrom(raw) {
  if (!raw || typeof raw !== 'object') return null
  const sleepNeed = num(findKey(raw, ['sleepNeedMinutes']))
  const p = {
    displayName: nz(findKey(raw, ['displayName', 'userName'])), fullName: nz(findKey(raw, ['fullName'])),
    timeZone: nz(findKey(raw, ['timeZone', 'timezone', 'timeZoneId'])), stepGoal: num(findKey(raw, ['stepGoal', 'dailyStepGoal'])),
    sleepNeedSec: sleepNeed != null ? sleepNeed * 60 : null,
  }
  return Object.values(p).some(v => v != null) ? p : null
}

// ---- Helper for endpoint registries ------------------------------------------------------

/** Put `{day, ...sections}` results into a days map, merging sections that share a day. */
export function collect(results) {
  const days = {}
  for (const r of results) {
    if (!r?.day) continue
    const { day, ...sections } = r
    days[day] = { ...(days[day] || {}), ...sections }
  }
  return days
}
