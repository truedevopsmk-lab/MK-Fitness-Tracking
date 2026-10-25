// Tiny hash router: '#/trends/steps?range=30' → { path: '/trends/steps', segments: ['trends','steps'], params: { range: '30' } }
import { useMemo, useSyncExternalStore } from 'react'

const subscribe = fn => { window.addEventListener('hashchange', fn); return () => window.removeEventListener('hashchange', fn) }
const snapshot = () => location.hash || '#/'

export function parseHash(hash) {
  const raw = (hash || '#/').replace(/^#/, '') || '/'
  const [pathPart, query = ''] = raw.split('?')
  const path = ('/' + pathPart.replace(/^\/+/, '')).replace(/(.)\/$/, '$1')
  const params = Object.fromEntries(new URLSearchParams(query))
  return { path, segments: path.split('/').filter(Boolean), params }
}

export function useRoute() {
  const hash = useSyncExternalStore(subscribe, snapshot, () => '#/')
  return useMemo(() => parseHash(hash), [hash])
}

/** Build a hash link: href('/trends/steps', { range: 30 }) → '#/trends/steps?range=30'. Null/undefined params are skipped. */
export function href(path, params) {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params || {})) if (v != null && v !== '') q.set(k, v)
  const s = q.toString()
  return `#${path.startsWith('/') ? path : '/' + path}${s ? '?' + s : ''}`
}

export function navigate(to, { replace = false } = {}) {
  const hash = to.startsWith('#') ? to : href(to)
  if (hash === location.hash) return
  if (replace) location.replace(location.pathname + location.search + hash)
  else location.hash = hash
}

/** Replace only the query params of the current route (keeps back button clean for filters). */
export function setParams(patch, { replace = true } = {}) {
  const { path, params } = parseHash(location.hash)
  navigate(href(path, { ...params, ...patch }), { replace })
}

// Scroll to top when the path (not just the query) changes.
let lastPath = parseHash(snapshot()).path
if (typeof window !== 'undefined') window.addEventListener('hashchange', () => {
  const { path } = parseHash(snapshot())
  if (path !== lastPath) { lastPath = path; window.scrollTo(0, 0) }
})
