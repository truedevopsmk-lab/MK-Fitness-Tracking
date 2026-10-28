// Pure sleep calculations (no React) so they can be unit-tested in Node.
import { eachDay } from '../lib/dates.js'
import { mean, stdev, correlation } from '../lib/stats.js'

const ANCHOR_MIN = 18 * 60 // clock times are measured from 18:00 so 23:30 and 01:15 sit on one continuous axis
const num = v => typeof v === 'number' && Number.isFinite(v)
const pad = n => String(n).padStart(2, '0')

/** Epoch ms → minutes since 18:00 local (0..1439). 22:00 → 240, 01:00 → 420, 06:30 → 750. */
export function normMinutes(ts) {
  if (!num(ts)) return null
  const d = new Date(ts), m = d.getHours() * 60 + d.getMinutes()
  return (m - ANCHOR_MIN + 1440) % 1440
}

/** Inverse of normMinutes → '11:30 pm'. */
export function clockFromNorm(norm, short = false) {
  if (!num(norm)) return '—'
  const m = (Math.round(norm) + ANCHOR_MIN) % 1440, h = Math.floor(m / 60), mm = m % 60
  const h12 = h % 12 || 12, ap = h < 12 ? 'am' : 'pm'
  return short && mm === 0 ? `${h12} ${ap}` : `${h12}:${pad(mm)} ${ap}`
}

/** Stage split of a night. Percentages are of total time asleep + awake. */
export function stageBreakdown(sleep) {
  if (!sleep) return null
  const f = { deep: sleep.deepSec, light: sleep.lightSec, rem: sleep.remSec, awake: sleep.awakeSec }
  const total = Object.values(f).reduce((a, v) => a + (num(v) ? v : 0), 0)
  if (!total) return null
  return { total, items: Object.entries(f).map(([key, sec]) => ({ key, sec: num(sec) ? sec : null, pct: num(sec) ? (sec / total) * 100 : null })) }
}

/** Time in bed (s): wake − bedtime, else asleep + awake. */
export function timeInBedSec(sleep) {
  if (!sleep) return null
  if (num(sleep.startTs) && num(sleep.endTs) && sleep.endTs > sleep.startTs) return Math.round((sleep.endTs - sleep.startTs) / 1000)
  return num(sleep.durationSec) ? sleep.durationSec + (sleep.awakeSec || 0) : null
}

/** Garmin's sleep need when present, otherwise the user's setting (hours). */
export const needSecFor = (sleep, prefHours = 8) => num(sleep?.needSec) && sleep.needSec > 0 ? sleep.needSec : prefHours * 3600

/** One flat row per calendar day in [from, to]; nights without sleep have null fields. */
export function buildRows(days, from, to, prefHours = 8) {
  return eachDay(from, to).map(date => {
    const rec = days[date], s = rec?.sleep, has = num(s?.durationSec)
    const stages = has ? stageBreakdown(s) : null
    const pct = k => stages?.items.find(i => i.key === k)?.pct ?? null
    const need = has ? needSecFor(s, prefHours) : null
    const bedMin = has ? normMinutes(s.startTs) : null, wakeMin = has ? normMinutes(s.endTs) : null
    const bb = has ? (num(s.bodyBatteryChange) ? s.bodyBatteryChange : num(rec.bodyBattery?.charged) ? rec.bodyBattery.charged : null) : null
    return {
      date, has, score: has && num(s.score) ? s.score : null, dur: has ? s.durationSec : null,
      deep: has ? s.deepSec ?? null : null, light: has ? s.lightSec ?? null : null, rem: has ? s.remSec ?? null : null, awake: has ? s.awakeSec ?? null : null,
      deepPct: pct('deep'), remPct: pct('rem'), startTs: has ? s.startTs ?? null : null, endTs: has ? s.endTs ?? null : null,
      bedMin, wakeMin: wakeMin != null && bedMin != null && wakeMin <= bedMin ? null : wakeMin,
      need, balance: has ? s.durationSec - need : null,
      restingHr: has ? s.restingHr ?? rec.heartRate?.resting ?? null : null, hrv: has ? s.avgHrv ?? rec.hrv?.lastNight ?? null : null, bb,
    }
  })
}

/**
 * Sleep debt over the last `n` days of rows.
 * deficit = Σ max(0, need − actual); surplus = Σ max(0, actual − need), each night's surplus capped at `capSec`
 * (extra sleep only pays back so much). net = deficit − cappedSurplus; positive net = behind.
 */
export function sleepDebt(rows, n = 7, capSec = 3600) {
  const recent = rows.slice(-n).filter(r => r.has)
  let deficit = 0, surplus = 0
  for (const r of recent) { deficit += Math.max(0, -r.balance); surplus += Math.min(capSec, Math.max(0, r.balance)) }
  return { deficit, surplus, net: deficit - surplus, nights: recent.length }
}

/** Bedtime / wake-time variability in minutes (sample std dev) and mean clock position. */
export function consistency(rows) {
  const bed = rows.map(r => r.bedMin).filter(num), wake = rows.map(r => r.wakeMin).filter(num)
  return { bedSd: stdev(bed), wakeSd: stdev(wake), bedMean: mean(bed), wakeMean: mean(wake), nights: Math.min(bed.length, wake.length) }
}

/** Sleep duration (h) vs Body Battery gained overnight; split at `splitH` hours. */
export function recoveryPairs(rows, splitH = 7) {
  const pairs = rows.filter(r => r.has && num(r.bb)).map(r => ({ date: r.date, h: r.dur / 3600, bb: r.bb }))
  const long = pairs.filter(p => p.h > splitH), short = pairs.filter(p => p.h <= splitH)
  return { pairs, n: pairs.length, r: correlation(pairs.map(p => [p.h, p.bb])), longMean: mean(long.map(p => p.bb)), shortMean: mean(short.map(p => p.bb)), longN: long.length, shortN: short.length, splitH }
}

/** Window averages shown in the averages row. */
export function averages(rows) {
  const c = consistency(rows), g = k => mean(rows.map(r => r[k]))
  return { score: g('score'), dur: g('dur'), deepPct: g('deepPct'), remPct: g('remPct'), bedMean: c.bedMean, wakeMean: c.wakeMean, nights: rows.filter(r => r.has).length }
}

/** Awake periods / time to first deep sleep for the hypnogram caption. */
export function stageSummary(stages) {
  if (!stages?.length) return null
  const t0 = stages[0].start, awake = stages.filter(s => s.stage === 'awake' && s.end - s.start >= 60000)
  const firstDeep = stages.find(s => s.stage === 'deep')
  return { awakeCount: awake.length, firstDeepMin: firstDeep ? Math.round((firstDeep.start - t0) / 60000) : null }
}
