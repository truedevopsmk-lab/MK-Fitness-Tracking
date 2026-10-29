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

export const entryText = e => [statusInfo(e?.status)?.label, tagLabels(e?.tags || []).join(', ')].filter(Boolean).join(' · ')

export function makeEntry(date, patch = {}, prev = null, now = Date.now()) {
  const e = { ...prev, ...patch, date, tags: cleanTags(patch.tags ?? prev?.tags ?? []), updatedAt: now }
  const status = cleanStatus(e.status)
  if (status) e.status = status; else delete e.status
  return e
}

const sameTags = (a, b) => a.length === b.length && a.every((t, i) => t === b[i])

/** Merge incoming entries into { [date]: entry }. Newest edit with different tags or status wins; ties keep the local entry. */
export function mergeJournal(current, list) {
  let journal = current
  const changed = []
  for (const raw of list || []) {
    if (!raw?.date) continue
    const { status: rawStatus, ...rest } = raw, status = cleanStatus(rawStatus)
    const e = { ...rest, tags: cleanTags(raw.tags), updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : 0, ...(status ? { status } : {}) }
    const cur = journal[e.date]
    if (cur && !((e.updatedAt || 0) > (cur.updatedAt || 0) && (!sameTags(e.tags, cleanTags(cur.tags)) || status !== cleanStatus(cur.status)))) continue
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
    if (!e) continue
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
