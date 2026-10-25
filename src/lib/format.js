import { parseDay } from './dates.js'

const LOCALE = 'en-IN'

export const fmtNumber = (n, digits = 0) => n == null || Number.isNaN(n) ? '—' : Number(n).toLocaleString(LOCALE, { maximumFractionDigits: digits, minimumFractionDigits: digits })
export const fmtCompact = n => n == null ? '—' : Math.abs(n) >= 10000 ? `${(n / 1000).toFixed(1)}K` : fmtNumber(n)

/** Seconds → '7h 32m' (or '42m' under an hour). */
export function fmtDuration(seconds) {
  if (seconds == null || Number.isNaN(seconds)) return '—'
  const s = Math.round(seconds), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60)
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`
}

export const fmtDay = (day, opts = { day: '2-digit', month: 'short' }) => day ? parseDay(day).toLocaleDateString(LOCALE, opts) : '—'
export const fmtWeekday = day => fmtDay(day, { weekday: 'short', day: 'numeric', month: 'short' })
export const fmtClock = value => value == null ? '—' : new Date(value).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })
export const fmtDateTime = value => value == null ? '—' : new Date(value).toLocaleString(LOCALE, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

/** '3 min ago', '2 h ago', 'yesterday', or a date. */
export function fmtAgo(value) {
  if (!value) return 'never'
  const mins = Math.round((Date.now() - new Date(value).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  if (mins < 24 * 60) return `${Math.round(mins / 60)} h ago`
  if (mins < 48 * 60) return 'yesterday'
  return fmtDateTime(value)
}

export const fmtPct = (n, digits = 0) => n == null || !Number.isFinite(n) ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(digits)}%`
export const fmtSigned = (n, digits = 0) => n == null || !Number.isFinite(n) ? '—' : `${n > 0 ? '+' : ''}${fmtNumber(n, digits)}`
