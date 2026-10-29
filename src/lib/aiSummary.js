// "Copy for AI": a plain-text summary of a date range to paste into an AI assistant. Pure, tested in scripts/test-aisummary.mjs.
// Leaves out the display name, Garmin ids, workout titles (Garmin's default titles name the city) and raw payloads.
import { addDays, daysBetween, eachDay, today } from './dates.js'
import { METRICS, hrvStatusBand, valueOf } from './metrics.js'
import { fmtClock, fmtDay, fmtDuration, fmtNumber } from './format.js'
import { fmtKm, paceOrSpeed, typeName } from './activities.js'
import { entryText, statusSummary } from './journal.js'
import { recoverySeries } from './homeLogic.js'
import { effortSeries } from './effort.js'
import { healthMonitor, fmtRange, PRECISION } from './health.js'
import { computeInsights } from './insights.js'
import { mean } from './stats.js'

export const MAX_DAYS = 365, BASE_DAYS = 30, MIN_BASE = 5, MAX_INSIGHTS = 6
const COMPARE = ['sleepScore', 'sleepDuration', 'deepSleep', 'remSleep', 'hrv', 'restingHr', 'respiration', 'bodyBatteryHigh', 'stressAvg', 'steps', 'intensity', 'trainingLoad']

const num = v => typeof v === 'number' && Number.isFinite(v)
const pad = n => String(n).padStart(2, '0')
const longDay = d => fmtDay(d, { day: 'numeric', month: 'short', year: 'numeric' })
const weekday = d => fmtDay(d, { weekday: 'short' })
const fmt = (key, v) => v == null ? null : METRICS[key].format(v)
const cell = s => String(s).replace(/\|/g, '/')
const nDays = n => `${n} ${n === 1 ? 'day' : 'days'}`

function utcOffset(now) {
  const off = -now.getTimezoneOffset(), a = Math.abs(off)
  return `UTC${off < 0 ? '-' : '+'}${pad(Math.floor(a / 60))}:${pad(a % 60)}`
}

/** Daily columns: [label, metric key | (row) => text|null]. Columns with no value in the range are dropped. */
const COLS = [
  ['sleepScore'], ['sleepDuration'],
  ['Asleep → woke', r => num(r.d?.sleep?.startTs) && num(r.d?.sleep?.endTs) ? `${fmtClock(r.d.sleep.startTs)} → ${fmtClock(r.d.sleep.endTs)}` : null],
  ['deepSleep'], ['remSleep'], ['awakeTime'],
  ['hrv', r => { const v = valueOf('hrv', r.d), s = hrvStatusBand(r.d?.hrv?.status); return v == null ? null : s ? `${fmt('hrv', v)} (${s.label})` : fmt('hrv', v) }],
  ['restingHr'], ['respiration'], ['spo2'], ['bodyBatteryHigh'], ['bodyBatteryLow'], ['stressAvg'], ['steps'], ['intensity'], ['trainingLoad'],
  ['Recovery', r => r.rec?.value == null ? null : `${r.rec.value}${r.rec.kind === 'estimate' ? ' (est.)' : ''}`],
  ['Effort', r => r.eff?.value == null ? null : r.eff.lo != null ? `${r.eff.value} (target ${r.eff.lo}–${r.eff.hi})` : `${r.eff.value}`],
  ['weight'],
  ['Journal', r => entryText(r.j) || null],
].map(([a, f]) => METRICS[a] ? { key: a, label: METRICS[a].label, get: f || (r => fmt(a, valueOf(a, r.d))) } : { key: null, label: a, get: f })

/** Mean of a metric over [from, to], skipping excluded dates: { value, n }. */
function avgOver(days, key, from, to, exclude) {
  const vals = eachDay(from, to).filter(d => !exclude?.has(d)).map(d => valueOf(key, days[d])).filter(v => v != null)
  return { value: mean(vals), n: vals.length }
}

function workoutLine(a) {
  const ps = paceOrSpeed(a)
  const zones = Array.isArray(a.hrZonesSec) && a.hrZonesSec.some(s => s > 0) ? a.hrZonesSec.map(s => Math.round((s || 0) / 60)).join('/') : null
  return [
    `${a.day} ${weekday(a.day)}${num(a.startTs) ? ` ${fmtClock(a.startTs)}` : ''}`,
    typeName(a.type),
    a.durationSec > 0 && fmtDuration(a.durationSec),
    a.distanceM > 0 && `${fmtKm(a.distanceM)} km`,
    ps && `${ps.label.toLowerCase()} ${ps.value} ${ps.unit}`,
    a.avgHr > 0 && `avg HR ${Math.round(a.avgHr)}${a.maxHr > 0 ? `, max ${Math.round(a.maxHr)}` : ''} bpm`,
    a.elevationGainM > 0 && `climb ${Math.round(a.elevationGainM)} m`,
    num(a.trainingLoad) && `load ${Math.round(a.trainingLoad)}`,
    num(a.aerobicTE) && `aerobic TE ${fmtNumber(a.aerobicTE, 1)}${num(a.anaerobicTE) ? `, anaerobic TE ${fmtNumber(a.anaerobicTE, 1)}` : ''}`,
    a.calories > 0 && `${Math.round(a.calories)} kcal`,
    zones && `minutes in HR zones 1–5: ${zones}`,
  ].filter(Boolean).join(' · ')
}

/** Days in [from, to] that have a synced record. */
export const daysWithData = (days, from, to) => eachDay(from, to).filter(d => days?.[d]).length

/**
 * Text summary of [from, to] for an AI assistant.
 * @returns {{ text: string, days: number, withData: number, workouts: number }}
 */
export function buildAiSummary({ days = {}, activities = [], journal = {} }, { from, to, sleepNeedHours = 8, exclude, now = new Date() } = {}) {
  const asOf = today(), n = daysBetween(from, to) + 1, single = n === 1
  const dates = eachDay(from, to), opts = { sleepNeedHours, exclude }
  const rec = recoverySeries(days, from, to, opts), eff = effortSeries(days, activities, from, to, opts)
  const rows = dates.map((date, i) => ({ date, d: days[date], j: journal[date], rec: rec[i], eff: eff[i] }))
  const cols = COLS.filter(c => rows.some(r => c.get(r) != null))
  const baseFrom = addDays(from, -BASE_DAYS), baseTo = addDays(from, -1)
  const base = Object.fromEntries(COMPARE.map(k => [k, avgOver(days, k, baseFrom, baseTo, exclude)]))
  const baseText = k => base[k] && base[k].n >= MIN_BASE ? `${fmt(k, base[k].value)} (${nDays(base[k].n)})` : null
  const acts = activities.filter(a => a.day >= from && a.day <= to).sort((a, b) => (a.startTs ?? 0) - (b.startTs ?? 0) || String(a.day).localeCompare(String(b.day)))
  const withData = rows.filter(r => r.d).length
  const range = single ? `${weekday(from)} ${longDay(from)}` : `${longDay(from)} – ${longDay(to)} (${n} days)`
  const out = []
  const line = (...s) => out.push(...s)

  line(`# My Garmin data: ${range}`, '',
    `Exported from MK Fitness, my personal dashboard for my Garmin watch. Values are Garmin's unless marked as the app's estimate. Dates are local days, times are local (${utcOffset(now)}). Sleep, HRV, resting HR and overnight values on a date are for the night ending that morning. "—" means no data.`)
  if (to >= asOf) line(`Today (${asOf}) is still in progress: steps, stress, training and effort for today are so far, as of ${fmtClock(now)}.`)
  line('', 'Please look at my sleep, recovery, stress and training over this period, compare them with my baseline, point out patterns or anything that stands out, and suggest what I could focus on today and over the next few days. Treat this as trend data from a consumer watch, not a medical record.')

  line('', '## Settings', `- Sleep need: ${fmtNumber(sleepNeedHours, 1)} h a night (set by me in the app; it drives the recovery estimate)`)
  const goal = [...dates].reverse().map(d => days[d]?.steps?.goal).find(num)
  if (goal) line(`- Daily step goal: ${fmtNumber(goal)}`)

  const statuses = statusSummary(journal, from, to)
  line('', single ? '## The day' : '## Day by day')
  if (single) {
    const r = rows[0]
    if (!r.d && !r.j) line('No data synced for this day.')
    for (const c of cols) { const b = c.key && baseText(c.key); line(`- ${c.label}: ${c.get(r)}${b ? ` · previous ${BASE_DAYS}-day average ${b}` : ''}`) }
  } else {
    line(`| Date | ${cols.map(c => c.label).join(' | ')} |`, `|${' --- |'.repeat(cols.length + 1)}`)
    for (const r of rows) line(`| ${r.date} ${weekday(r.date)} | ${cols.map(c => cell(c.get(r) ?? '—')).join(' | ')} |`)
  }
  if (statuses.n) line('', `Days with a journal status (${statuses.labels.join(', ')}) and the day after each are left out of the app's baselines.`)

  if (!single) {
    line('', `## This period vs the ${BASE_DAYS} days before (${longDay(baseFrom)} – ${longDay(baseTo)})`,
      `Daily averages; the number of days with data is in brackets.${exclude?.size ? ' Status days are left out of the earlier period.' : ''}`, '',
      '| Metric | This period | Previous 30 days |', '| --- | --- | --- |')
    for (const k of COMPARE) {
      const cur = avgOver(days, k, from, to)
      if (!cur.n && !base[k].n) continue
      line(`| ${METRICS[k].label} | ${cur.n ? `${fmt(k, cur.value)} (${nDays(cur.n)})` : '—'} | ${baseText(k) ?? '—'} |`)
    }
  }

  line('', `## Workouts (${acts.length})`)
  if (!acts.length) line('No workouts recorded in this period.')
  for (const a of acts) line(`- ${workoutLine(a)}`)

  const m = healthMonitor(days, to, { exclude })
  if (m.vitals.length) {
    line('', `## Overnight vitals vs my normal range (as of ${longDay(m.date)})`)
    for (const v of m.vitals) {
      const src = v.range.source === 'garmin' ? "Garmin's baseline" : `my previous ${v.range.n} nights`
      line(`- ${v.name}: ${fmtNumber(v.value, PRECISION[v.key])} ${METRICS[v.key].unit} — ${v.statusLabel.toLowerCase()} (normal ${fmtRange(v.key, v.range)}, from ${src})${v.streak >= 2 ? `, ${v.streak} nights in a row` : ''}`)
    }
  }

  const ins = computeInsights(days, activities, { asOf: to, exclude }).slice(0, MAX_INSIGHTS)
  if (ins.length) {
    line('', `## Patterns the app found (as of ${longDay(to)})`)
    for (const i of ins) line(`- ${i.title} ${i.body} (${i.evidence}.)`)
  }

  line('', '## How to read the numbers',
    '- Sleep score, Body Battery (0–100, higher means more energy), stress (0–100, higher means more stress), HRV status and training load are Garmin\'s.',
    '- Intensity minutes count moderate minutes plus 2 × vigorous minutes, as Garmin does (a common weekly goal is 150).',
    '- Recovery (0–100) is Garmin\'s training readiness when available. "(est.)" marks the app\'s estimate from last night\'s sleep against my sleep need, HRV against my 7-day baseline and Body Battery.',
    '- Effort (0–100) is the app\'s score from training load plus everyday steps against my usual over the previous 28 days. Its target range comes from that day\'s recovery.')

  return { text: out.join('\n').replace(/[ \t]+$/gm, '') + '\n', days: n, withData, workouts: acts.length }
}
