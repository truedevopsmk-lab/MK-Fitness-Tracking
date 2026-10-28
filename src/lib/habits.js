// Habit impact: the night after days with a tag against logged days without it. Pure logic — unit-tested in scripts/test-habits.mjs.
import { addDays, eachDay } from './dates.js'
import { METRICS, deltaTone, isMeaningfulDelta, valueOf } from './metrics.js'
import { mean, stdev } from './stats.js'
import { cleanTags, tagInfo } from './journal.js'
import { recoveryFor } from './homeLogic.js'

export const MIN_EACH = 5
export const OUTCOMES = [
  { key: 'recovery', metric: 'readiness', label: 'Recovery', short: 'Recovery', noun: 'recovery', hue: 'readiness', span: 10 },
  { key: 'sleepScore', metric: 'sleepScore', label: 'Sleep score', short: 'Sleep', noun: 'sleep score', hue: 'sleep', span: 10 },
  { key: 'hrv', metric: 'hrv', label: 'Overnight HRV', short: 'HRV', noun: 'HRV', hue: 'hrv', span: 6 },
  { key: 'restingHr', metric: 'restingHr', label: 'Resting heart rate', short: 'RHR', noun: 'resting heart rate', hue: 'heart', span: 3 },
]

const num = v => typeof v === 'number' && Number.isFinite(v) ? v : null

/** The night after `date` (sleep belongs to the day you woke up): { recovery, sleepScore, hrv, restingHr }, each a number or null. */
export function nightAfter(days, date, { sleepNeedHours = 8 } = {}) {
  const next = addDays(date, 1)
  return {
    recovery: num(recoveryFor(days, next, { sleepNeedHours, lookbackDays: 0 }).score),
    sleepScore: valueOf('sleepScore', days[next]), hrv: valueOf('hrv', days[next]), restingHr: valueOf('restingHr', days[next]),
  }
}

function compare(o, w, wo, min) {
  const nWith = w.length, nWithout = wo.length
  const need = { with: Math.max(0, min - nWith), without: Math.max(0, min - nWithout) }
  if (nWith < min || nWithout < min) return { nWith, nWithout, need, status: 'needs-more', avgWith: null, avgWithout: null, diff: null, shown: null, tone: 'neutral', clear: false, effect: 0 }
  const avgWith = mean(w), avgWithout = mean(wo), diff = avgWith - avgWithout
  const shown = { with: Math.round(avgWith), without: Math.round(avgWithout), diff: Math.round(avgWith) - Math.round(avgWithout) }
  const status = !isMeaningfulDelta(o.metric, diff) ? 'same' : diff > 0 ? 'higher' : 'lower'
  const sw = stdev(w), so = stdev(wo)
  const se = Math.sqrt(sw ** 2 / nWith + so ** 2 / nWithout)
  const sp = Math.sqrt(((nWith - 1) * sw ** 2 + (nWithout - 1) * so ** 2) / (nWith + nWithout - 2))
  return {
    nWith, nWithout, need, status, avgWith, avgWithout, diff, shown,
    tone: status === 'same' ? 'neutral' : deltaTone(o.metric, diff),
    clear: status !== 'same' && (se === 0 || Math.abs(diff) >= 2 * se),
    effect: sp > 0 ? diff / sp : 0,
  }
}

/** Per tag and outcome: the night after tagged days against the night after logged days without the tag. */
export function habitImpact(days, journal, from, to, { sleepNeedHours = 8, min = MIN_EACH } = {}) {
  const entries = eachDay(from, to).filter(d => journal[d]).map(date => ({ date, tags: cleanTags(journal[date].tags), night: nightAfter(days, date, { sleepNeedHours }) }))
  const used = cleanTags([...new Set(entries.flatMap(e => e.tags))])
  const tags = used.map(key => {
    const withTag = entries.filter(e => e.tags.includes(key)), without = entries.filter(e => !e.tags.includes(key))
    const outcomes = {}
    for (const o of OUTCOMES) {
      const pick = list => list.map(e => e.night[o.key]).filter(v => v != null)
      outcomes[o.key] = compare(o, pick(withTag), pick(without), min)
    }
    return { key, label: tagInfo(key).label, days: withTag.length, outcomes }
  })
  const has = (t, f) => OUTCOMES.some(o => f(t.outcomes[o.key]))
  return {
    from, to, logged: entries.length, tagged: entries.filter(e => e.tags.length).length, used: tags.length,
    ready: tags.filter(t => has(t, c => c.status !== 'needs-more')).length,
    clearTags: tags.filter(t => has(t, c => c.clear)).length,
    tags,
  }
}

/** The clearest difference per tag (largest effect size), strongest first. */
export function findings(impact, limit = 3) {
  const out = []
  for (const t of impact.tags) {
    let best = null
    for (const outcome of OUTCOMES) {
      const cmp = t.outcomes[outcome.key]
      if (cmp.clear && (!best || Math.abs(cmp.effect) > Math.abs(best.cmp.effect))) best = { tag: t.key, label: t.label, outcome, cmp }
    }
    if (best) out.push(best)
  }
  return out.sort((a, b) => Math.abs(b.cmp.effect) - Math.abs(a.cmp.effect)).slice(0, limit)
}

export const daysText = n => `${n} ${n === 1 ? 'day' : 'days'}`
export const sampleText = cmp => `${daysText(cmp.nWith)} with, ${cmp.nWithout} without`

export function needText(need) {
  if (need.with > 0 && need.without > 0) return `Needs ${need.with} more ${need.with === 1 ? 'day' : 'days'} with it and ${need.without} more without`
  if (need.with > 0) return `Needs ${need.with} more ${need.with === 1 ? 'day' : 'days'} with it`
  return `Needs ${need.without} more logged ${need.without === 1 ? 'day' : 'days'} without it`
}

export function impactLine(label, outcome, cmp) {
  if (cmp.status === 'needs-more') return needText(cmp.need)
  const f = METRICS[outcome.metric].format, { shown } = cmp
  if (cmp.status === 'same') return `After days tagged ${label}, your ${outcome.noun} was about the same (${f(shown.with)} vs ${f(shown.without)})`
  return `After days tagged ${label}, your ${outcome.noun} averaged ${f(Math.abs(shown.diff))} ${cmp.status} (${f(shown.with)} vs ${f(shown.without)})`
}
