// UI preferences (not health data). Stored in localStorage so they apply before IndexedDB loads.
import { useSyncExternalStore } from 'react'

const KEY = 'mk_fitness_prefs'
export const SLEEP_NEED_OPTIONS = [7, 7.5, 8, 8.5, 9]
export const DEFAULT_PREFS = {
  theme: 'night',          // 'night' | 'day' | 'color' | 'auto'
  startPage: 'today',      // 'today' | 'morning'
  sleepNeedHours: 8,       // used for sleep debt when Garmin provides no sleep need
  wakeTime: null,          // Sleep coach wake time in minutes after midnight (390 = 6:30 am); null = your usual
  autoSync: true,          // incremental sync on open when the last sync is > 30 min old
  historyDays: 365,        // full-sync depth for range endpoints
  perDayDays: 90,          // full-sync depth for per-day endpoints (one request per day)
  lockEnabled: false,
  lockMethod: null,        // 'biometric' | 'pin'
  lockAfterMin: 5,
  installDismissed: false,
  displayName: '',         // optional local override for the greeting; never synced or exported
}

let cache = null
const listeners = new Set()

function read() {
  if (cache) return cache
  let stored = {}
  try { stored = JSON.parse(localStorage.getItem(KEY)) || {} } catch { /* ignore */ }
  const legacyTheme = localStorage.getItem('mk_fitness_theme')
  if (!stored.theme && legacyTheme) stored.theme = legacyTheme
  cache = { ...DEFAULT_PREFS, ...stored }
  return cache
}

export const getPrefs = () => read()

export function setPrefs(patch) {
  cache = { ...read(), ...patch }
  localStorage.setItem(KEY, JSON.stringify(cache))
  listeners.forEach(fn => fn())
}

const subscribe = fn => { listeners.add(fn); return () => listeners.delete(fn) }
export const usePrefs = () => useSyncExternalStore(subscribe, read)
