// Daily tags the user enters themselves. Pure logic, no React — unit-tested in scripts/test-journal.mjs.
import { addDays, eachDay, toDay } from './dates.js'

export const TAG_GROUPS = [{ key: 'evening', label: 'Evening' }, { key: 'day', label: 'During the day' }, { key: 'care', label: 'Recovery habits' }]
export const TAGS = [
  { key: 'alcohol', label: 'Alcohol', group: 'evening', quick: true },
  { key: 'lateMeal', label: 'Late meal', group: 'evening', quick: true },
  { key: 'lateCaffeine', label: 'Late caffeine', group: 'evening', quick: true },
  { key: 'screens', label: 'Screens in bed', group: 'evening', quick: true },
  { key: 'lateWorkout', label: 'Late workout', group: 'evening', quick: true },
  { key: 'stress', label: 'Stressful day', group: 'day', quick: true },
  { key: 'travel', label: 'Travel', group: 'day', quick: true },
  { key: 'nap', label: 'Nap', group: 'day', quick: true },
  { key: 'outdoors', label: 'Time outdoors', group: 'day' },
  { key: 'meditation', label: 'Meditation', group: 'care' },
  { key: 'stretching', label: 'Stretching or yoga', group: 'care' },
  { key: 'sauna', label: 'Sauna or hot bath', group: 'care' },
]

export const STATUSES = [{ key: 'sick', label: 'Sick' }, { key: 'injured', label: 'Injured' }, { key: 'travelling', label: 'Travelling' }, { key: 'break', label: 'Break' }]
const STATUS_BY_KEY = new Map(STATUSES.map(s => [s.key, s]))
export const statusInfo = key => STATUS_BY_KEY.get(key) || null
export const cleanStatus = v => STATUS_BY_KEY.has(v) ? v : null

export const COUNTERS = [
  { key: 'water', label: 'Water', hint: 'Glasses, about 250 ml each', unit: ['glass', 'glasses'], noun: ['glass of water', 'glasses of water'], max: 30 },
  { key: 'caffeine', label: 'Caffeine', hint: 'Coffee, tea, energy drinks', unit: ['drink', 'drinks'], noun: ['caffeinated drink', 'caffeinated drinks'], max: 20 },
  { key: 'alcohol', label: 'Alcohol', hint: 'Also sets the Alcohol tag', unit: ['drink', 'drinks'], noun: ['alcoholic drink', 'alcoholic drinks'], max: 20, tag: 'alcohol' },
]
export const COUNTER_BY_KEY = new Map(COUNTERS.map(c => [c.key, c]))

/** Whole positive counts per known counter, capped at its max; null when nothing is counted. */
export function cleanCounts(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const out = {}
  for (const c of COUNTERS) {
    const n = v[c.key]
    if (Number.isFinite(n) && Math.round(n) > 0) out[c.key] = Math.min(Math.round(n), c.max)
  }
  return Object.keys(out).length ? out : null
}

export const isCheckedIn = e => !!e && e.checkedIn !== false
export const countText = (c, n) => `${n} ${n === 1 ? c.noun[0] : c.noun[1]}`
export const countsText = counts => COUNTERS.filter(c => counts?.[c.key] > 0).map(c => countText(c, counts[c.key])).join(', ')

export const TAG_RE = /^[A-Za-z0-9_-]{1,40}$/
export const CHECKIN_SWITCH_HOUR = 18
const ORDER = new Map(TAGS.map((t, i) => [t.key, i]))
const BY_KEY = new Map(TAGS.map(t => [t.key, t]))

export const tagInfo = key => BY_KEY.get(key) || { key, label: key, group: 'other' }

/** The day the check-in is about: yesterday until 18:00, then today. */
export const checkinDay = (now = new Date()) => now.getHours() >= CHECKIN_SWITCH_HOUR ? toDay(now) : addDays(toDay(now), -1)

/** Unique valid tags: catalogue tags in catalogue order, then unknown valid tags in their original order. */
export function cleanTags(tags) {
  if (!Array.isArray(tags)) return []
  const seen = [...new Set(tags.filter(t => typeof t === 'string' && TAG_RE.test(t)))]
  return [...seen.filter(t => ORDER.has(t)).sort((a, b) => ORDER.get(a) - ORDER.get(b)), ...seen.filter(t => !ORDER.has(t))]
}

export function toggleTag(tags, key) {
  const list = cleanTags(tags)
  return cleanTags(list.includes(key) ? list.filter(t => t !== key) : [...list, key])
}

export const tagLabels = tags => cleanTags(tags).map(t => tagInfo(t).label)

export function entryText(e) {
  const hidden = new Set(COUNTERS.filter(c => c.tag && e?.counts?.[c.key] > 0).map(c => c.tag))
  const tags = tagLabels((e?.tags || []).filter(t => !hidden.has(t))).join(', ')
  return [statusInfo(e?.status)?.label, tags, countsText(e?.counts)].filter(Boolean).join(' · ')
}

export function makeEntry(date, patch = {}, prev = null, now = Date.now()) {
  const e = { ...prev, ...patch, date, tags: cleanTags(patch.tags ?? prev?.tags ?? []), updatedAt: now }
  const status = cleanStatus(e.status)
  if (status) e.status = status; else delete e.status
  const counts = cleanCounts(e.counts)
  if (counts) e.counts = counts; else delete e.counts
  if (e.checkedIn !== false) delete e.checkedIn
  return e
}

/** Patch for toggling a tag; it also checks the day in, and removing a counter's tag zeroes that counter. */
export function tagPatch(entry, key) {
  const tags = toggleTag(entry?.tags, key), patch = { tags, checkedIn: true }
  const c = COUNTERS.find(x => x.tag === key)
  if (c && !tags.includes(key) && entry?.counts?.[c.key] > 0) patch.counts = { ...entry.counts, [c.key]: 0 }
  return patch
}

/** Patch for setting a counter. A counter linked to a tag keeps that tag in step; counts alone never check a day in. */
export function countPatch(entry, key, n) {
  const c = COUNTER_BY_KEY.get(key)
  if (!c) return {}
  const v = Math.min(Math.max(Math.round(Number(n)) || 0, 0), c.max)
  const patch = { counts: { ...entry?.counts, [key]: v } }
  if (c.tag) {
    const tags = cleanTags(entry?.tags)
    if (v > 0 && !tags.includes(c.tag)) patch.tags = cleanTags([...tags, c.tag])
    else if (v === 0 && entry?.counts?.[key] > 0 && tags.includes(c.tag)) patch.tags = tags.filter(t => t !== c.tag)
  }
  if (!isCheckedIn(entry)) patch.checkedIn = false
  return patch
}

/** A counts-only entry whose counts were all taken back: nothing left worth keeping. */
export const isEmptyEntry = e => !!e && e.checkedIn === false && !e.counts && !cleanTags(e.tags).length && !cleanStatus(e.status)

/** One place that cleans an incoming entry (merge and import). */
export function normalEntry(raw) {
  const { status, counts, checkedIn, ...rest } = raw // eslint-disable-line no-unused-vars
  const e = { ...rest, date: raw.date, tags: cleanTags(raw.tags), updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : 0 }
  if (cleanStatus(status)) e.status = cleanStatus(status)
  const c = cleanCounts(counts)
  if (c) e.counts = c
  if (checkedIn === false) e.checkedIn = false
  return e
}

const sig = e => JSON.stringify([cleanTags(e.tags), cleanStatus(e.status), cleanCounts(e.counts), e.checkedIn === false])

/** Merge incoming entries into { [date]: entry }. Newest edit with different tags, status, counts or check-in wins; ties keep the local entry. */
export function mergeJournal(current, list) {
  let journal = current
  const changed = []
  for (const raw of list || []) {
    if (!raw?.date) continue
    const e = normalEntry(raw)
    const cur = journal[e.date]
    if (cur && !(e.updatedAt > (cur.updatedAt || 0) && sig(e) !== sig(cur))) continue
    if (journal === current) journal = { ...current }
    journal[e.date] = e
    changed.push(e)
  }
  return { journal, changed }
}

/** Over the n days ending asOf: how many were logged and how often each tag was used. */
export function journalStats(journal, asOf, n) {
  const days = eachDay(addDays(asOf, -(n - 1)), asOf)
  const tally = new Map()
  let logged = 0
  for (const d of days) {
    const e = journal[d]
    if (!isCheckedIn(e)) continue
    logged++
    for (const t of cleanTags(e.tags)) tally.set(t, (tally.get(t) || 0) + 1)
  }
  const rank = k => ORDER.get(k) ?? 1e6
  const counts = [...tally].map(([key, count]) => ({ key, label: tagInfo(key).label, days: count }))
    .sort((a, b) => b.days - a.days || rank(a.key) - rank(b.key))
  return { logged, total: n, counts }
}

/** Newest first; entry is null for days that were not logged. */
export const recentDays = (journal, asOf, n = 14) =>
  eachDay(addDays(asOf, -(n - 1)), asOf).reverse().map(date => ({ date, entry: journal[date] || null }))

const excludedCache = new WeakMap()
/**
 * Dates left out of baselines: every status day and the day after it. A DayRecord holds the night ending
 * that morning plus the daytime, so a status on D touches record D (daytime, often the onset night) and D+1 (the night after).
 * Cached per journal object (the store replaces it immutably) so the Set identity is stable for useMemo deps.
 */
export function excludedDates(journal) {
  if (!journal || typeof journal !== 'object') return new Set()
  let set = excludedCache.get(journal)
  if (!set) {
    set = new Set()
    for (const e of Object.values(journal)) if (e?.date && cleanStatus(e.status)) { set.add(e.date); set.add(addDays(e.date, 1)) }
    excludedCache.set(journal, set)
  }
  return set
}

/** Journal entries with a status in [from, to]: { n, labels } (labels distinct, in STATUSES order). */
export function statusSummary(journal, from, to) {
  const found = new Set()
  let n = 0
  for (const d of eachDay(from, to)) { const s = cleanStatus(journal?.[d]?.status); if (s) { n++; found.add(s) } }
  return { n, labels: STATUSES.filter(s => found.has(s.key)).map(s => s.label) }
}

/** Sentence for reports saying how many status days were left out of a baseline; null when none. */
export function leftOutText({ n, labels }, period, what, after = 'night') {
  if (!n) return null
  const l = labels.join(', ')
  return n === 1 ? `1 status day in the last ${period} days (${l}) and the ${after} after it are left out of your ${what}.`
    : `${n} status days in the last ${period} days (${l}) and the ${after} after each are left out of your ${what}.`
}

/** Per counter over the n days ending asOf: days with a count and the average on those days (1 decimal; null when none). */
export function countStats(journal, asOf, n = 30) {
  const days = eachDay(addDays(asOf, -(n - 1)), asOf)
  return COUNTERS.map(c => {
    const vals = days.map(d => journal[d]?.counts?.[c.key]).filter(v => v > 0)
    return { key: c.key, label: c.label, days: vals.length, avg: vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 10) / 10 : null }
  })
}
