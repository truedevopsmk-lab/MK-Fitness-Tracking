// Charts read CSS custom properties (tokens.css) so they follow the active theme. SVG attrs get concrete
// colours; `useChartTheme()` re-renders subscribers when data-theme (or the OS scheme in `auto`) changes.
import { useSyncExternalStore } from 'react'

let version = 0, cached = null
const listeners = new Set()
const bump = () => { version += 1; cached = null; listeners.forEach(fn => fn()) }
let started = false
function start() {
  if (started || typeof window === 'undefined') return
  started = true
  new MutationObserver(bump).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  window.matchMedia?.('(prefers-color-scheme: light)').addEventListener?.('change', bump)
}
const subscribe = fn => { start(); listeners.add(fn); return () => listeners.delete(fn) }

function build() {
  const cs = getComputedStyle(document.documentElement)
  const v = name => cs.getPropertyValue(name).trim()
  const resolve = c => { const m = typeof c === 'string' && c.match(/^var\((--[\w-]+)\)$/); return m ? v(m[1]) : c }
  return {
    text: v('--text'), text2: v('--text-2'), text3: v('--text-3'), grid: v('--grid'), surface: v('--surface'), surface2: v('--surface-2'),
    border: v('--border'), accent: v('--accent'),
    hue: name => v(`--hue-${name}`) || v('--accent'),
    color: resolve,
    fontUi: v('--font-ui'), fontDisplay: v('--font-display'),
  }
}

export const getChartTheme = () => cached || (cached = build())
export function useChartTheme() {
  useSyncExternalStore(subscribe, () => version, () => 0)
  return getChartTheme()
}

/** Nice axis ticks: ~`count` steps covering [lo, hi]. `unit` scales the step grid (3600 → whole hours). */
export function niceTicks(lo, hi, count = 4, unit = 1) {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { ticks: [0, 1], domain: [0, 1] }
  if (hi === lo) { hi = lo + unit; lo = Math.max(0, lo - unit) }
  const raw = (hi - lo) / unit / count, pow = 10 ** Math.floor(Math.log10(raw || 1))
  const f = raw / pow, step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 && unit === 1 ? 2.5 : f <= 5 ? 5 : 10) * pow * unit
  const a = Math.floor(lo / step) * step, b = Math.ceil(hi / step) * step
  const ticks = []
  for (let t = a; t <= b + step / 1e6; t += step) ticks.push(Math.round(t * 1e6) / 1e6)
  return { ticks, domain: [a, b] }
}
