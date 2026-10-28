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

export const makeEntry = (date, patch = {}, prev = null, now = Date.now()) =>
  ({ ...prev, ...patch, date, tags: cleanTags(patch.tags ?? prev?.tags ?? []), updatedAt: now })

const sameTags = (a, b) => a.length === b.length && a.every((t, i) => t === b[i])

/** Merge incoming entries into { [date]: entry }. Newest edit with different tags wins; ties keep the local entry. */
export function mergeJournal(current, list) {
  let journal = current
  const changed = []
  for (const raw of list || []) {
    if (!raw?.date) continue
    const e = { ...raw, tags: cleanTags(raw.tags), updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : 0 }
    const cur = journal[e.date]
    if (cur && !((e.updatedAt || 0) > (cur.updatedAt || 0) && !sameTags(e.tags, cleanTags(cur.tags)))) continue
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
