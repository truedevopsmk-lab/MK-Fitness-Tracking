// Pure merge rules shared by sync, import and migration. A sync never deletes
// data: incoming values only overwrite existing ones when they are not null.

const isPlainObject = v => v != null && typeof v === 'object' && !Array.isArray(v)
const hasValue = v => v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0)

/** Field-level merge of one section; null/undefined/[] in `incoming` never erase `existing`. */
export function mergeSection(existing, incoming) {
  if (!isPlainObject(incoming)) return existing
  const out = { ...(existing || {}) }
  for (const [k, v] of Object.entries(incoming)) if (hasValue(v)) out[k] = v
  return out
}

/** Merge one partial DayRecord into an existing one (sections merged field by field). */
export function mergeDay(existing, incoming) {
  const out = { ...(existing || {}), date: incoming.date || existing?.date }
  for (const [section, value] of Object.entries(incoming)) {
    if (section === 'date') continue
    out[section] = isPlainObject(value) ? mergeSection(out[section], value) : hasValue(value) ? value : out[section]
  }
  return out
}

/**
 * @param {Record<string, object>} days            current day map (not mutated)
 * @param {Record<string, object>} incoming        partial records keyed by day
 * @returns {{ days: Record<string, object>, changed: object[] }}  new map + the merged records to persist
 */
export function mergeDays(days, incoming) {
  const next = { ...days }, changed = []
  for (const [date, partial] of Object.entries(incoming || {})) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    const merged = mergeDay(next[date], { ...partial, date })
    next[date] = merged
    changed.push(merged)
  }
  return { days: next, changed }
}

/** Merge by id, newest first. Incoming summaries replace older copies field by field. */
export function mergeActivities(list, incoming) {
  const byId = new Map(list.map(a => [a.id, a]))
  const changed = []
  for (const a of incoming || []) {
    if (!a?.id) continue
    const merged = mergeSection(byId.get(a.id), a)
    byId.set(a.id, merged)
    changed.push(merged)
  }
  const activities = [...byId.values()].sort((a, b) => (b.startTs ?? 0) - (a.startTs ?? 0) || String(b.day).localeCompare(String(a.day)))
  return { activities, changed }
}
