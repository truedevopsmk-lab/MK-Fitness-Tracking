// All dates in this app are LOCAL calendar days as 'YYYY-MM-DD' strings.
// Never use Date#toISOString() for a day key: it converts to UTC and shifts
// the day backwards for any timezone east of GMT (e.g. IST).

const pad = n => String(n).padStart(2, '0')

export const toDay = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
export const parseDay = day => { const [y, m, d] = day.split('-').map(Number); return new Date(y, m - 1, d) }
export const today = () => toDay(new Date())

export function addDays(day, n) { const d = parseDay(day); d.setDate(d.getDate() + n); return toDay(d) }
export const daysBetween = (from, to) => Math.round((parseDay(to) - parseDay(from)) / 86400000)

/** Inclusive list of days from `from` to `to`. */
export function eachDay(from, to) {
  const out = []
  for (let day = from; day <= to; day = addDays(day, 1)) out.push(day)
  return out
}

/** Split an inclusive range into consecutive non-overlapping chunks of at most `size` days. */
export function chunkRange(from, to, size) {
  const out = []
  for (let start = from; start <= to; start = addDays(start, size)) {
    const end = addDays(start, size - 1)
    out.push([start, end < to ? end : to])
  }
  return out
}

/** Monday-based ISO week start for a day. */
export function weekStart(day) { const d = parseDay(day); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); return toDay(d) }
export const monthKey = day => day.slice(0, 7)

/** Normalise any Garmin date-ish value (ISO timestamp, 'YYYY-MM-DD', epoch ms) to a local day key. */
export function dayOf(value) {
  if (value == null) return null
  if (typeof value === 'number') return toDay(new Date(value))
  const s = String(value)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  // Garmin "local" timestamps ('2026-10-24T06:12:00.0' or '2026-10-24 06:12:00') already carry the local day
  if (/^\d{4}-\d{2}-\d{2}[T ]/.test(s) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) return s.slice(0, 10)
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : toDay(d)
}
