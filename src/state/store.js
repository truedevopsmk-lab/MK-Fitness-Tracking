// Central app store: one plain object + subscribers (no library).
//
// Read it in components with a selector that returns an EXISTING reference or a
// primitive — never build a new object/array inside the selector (that re-renders
// forever). Derive with useMemo instead:
//   const days = useStore(s => s.days)
//   const latest = useMemo(() => latestValue(days, 'sleepScore'), [days])
//
// Write through `actions` only. Every write that changes health data is persisted
// to IndexedDB before the returned promise resolves.
import { useSyncExternalStore } from 'react'
import * as db from '../data/db.js'
import { countPatch, excludedDates, isEmptyEntry, makeEntry, mergeJournal, tagPatch } from '../lib/journal.js'
import { mergeActivities, mergeDays, mergeSection } from '../data/merge.js'

export const IDLE_SYNC = { running: false, mode: null, phase: '', done: 0, total: 0, current: null, startedAt: null, rateLimitedUntil: null, message: '' }
const SOURCE_KEY = 'mk_fitness_source'
const LOG_LIMIT = 200

const initialState = {
  ready: false,
  source: 'garmin',        // 'garmin' | 'demo'  — shown in the header's data-source indicator
  days: {},                // { 'YYYY-MM-DD': DayRecord }
  activities: [],          // Activity[] newest first
  profile: null,           // Profile
  journal: {},             // { 'YYYY-MM-DD': JournalEntry } — entered by the user, never synced
  syncMeta: { lastSuccessAt: null, lastAttemptAt: null, lastFullAt: null, lastResult: null, lastError: null, coverage: null },
  endpoints: {},           // { [endpointId]: EndpointStatus } — see docs/ARCHITECTURE.md
  sync: IDLE_SYNC,
  log: [],                 // [{ ts, level: 'info'|'warn'|'error', msg }]
}

let state = initialState
const listeners = new Set()

function set(patch) {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }
  listeners.forEach(fn => fn())
}

export const getState = () => state
const subscribe = fn => { listeners.add(fn); return () => listeners.delete(fn) }
export function useStore(selector = s => s) { return useSyncExternalStore(subscribe, () => selector(state)) }

/** Dates left out of baselines (status days and the day after); same Set while the journal is unchanged. */
export const useExcluded = () => excludedDates(useStore(s => s.journal))

export const isDemoRequested = () => new URLSearchParams(location.search).get('demo') === '1' || localStorage.getItem(SOURCE_KEY) === 'demo'

let persistTimer = null
function persistStatusSoon() {
  clearTimeout(persistTimer)
  persistTimer = setTimeout(() => { db.setMeta({ endpoints: state.endpoints, syncMeta: state.syncMeta, log: state.log }).catch(() => {}) }, 400)
}

export const actions = {
  /** Load cached data from IndexedDB. Call once at startup; safe to await before first paint. */
  async init() {
    const demo = isDemoRequested()
    if (demo) localStorage.setItem(SOURCE_KEY, 'demo')
    db.useDemoDatabase(demo)
    if (!demo) {
      const { migrateLegacy } = await import('../data/migrate.js')
      await migrateLegacy().catch(e => console.warn('legacy migration failed', e))
    }
    let [dayList, activities, journalList, profile, syncMeta, endpoints, log] = await Promise.all([
      db.getAll('days'), db.getAll('activities'), db.getAll('journal'), db.getMeta('profile'), db.getMeta('syncMeta'), db.getMeta('endpoints', {}), db.getMeta('log', []),
    ])
    if (demo && !dayList.length) {
      const { generateDemo } = await import('../data/demo.js')
      const data = generateDemo()
      await Promise.all([db.putMany('days', data.days), db.putMany('activities', data.activities), db.setMeta({ profile: data.profile })])
      ;[dayList, activities, profile] = [data.days, data.activities, data.profile]
      syncMeta = { ...initialState.syncMeta, lastSuccessAt: Date.now(), lastResult: 'ok' }
    }
    if (demo && !journalList.length && !(await db.getMeta('demoJournal'))) {
      const { generateDemoJournal } = await import('../data/demo.js')
      journalList = generateDemoJournal(dayList)
      await Promise.all([db.putMany('journal', journalList), db.setMeta({ demoJournal: true })])
    }
    const days = Object.fromEntries(dayList.map(d => [d.date, d]))
    activities.sort((a, b) => (b.startTs ?? 0) - (a.startTs ?? 0))
    // An interrupted sync (tab closed) must not look like it is still running.
    for (const ep of Object.values(endpoints || {})) if (ep.status === 'running' || ep.status === 'queued') ep.status = 'cancelled'
    set({ ready: true, source: demo ? 'demo' : 'garmin', days, activities, journal: Object.fromEntries(journalList.map(e => [e.date, e])), profile: profile ?? null, syncMeta: { ...initialState.syncMeta, ...syncMeta }, endpoints: endpoints || {}, log: log || [] })
  },

  /** Merge partial DayRecords keyed by date. Never deletes data. Returns number of days touched. */
  async applyDays(partialByDate) {
    const { days, changed } = mergeDays(state.days, partialByDate)
    if (!changed.length) return 0
    set({ days })
    await db.putMany('days', changed)
    return changed.length
  },

  /** Merge normalised activities by id. Returns number of activities touched. */
  async applyActivities(list) {
    const { activities, changed } = mergeActivities(state.activities, list)
    if (!changed.length) return 0
    set({ activities })
    await db.putMany('activities', changed)
    return changed.length
  },

  async setProfile(profile) {
    const merged = mergeSection(state.profile, profile)
    set({ profile: merged })
    await db.setMeta({ profile: merged })
  },

  /** Create or update the user's journal entry for a day. Persisted before it resolves. */
  async setJournal(date, patch) {
    const entry = makeEntry(date, patch, state.journal[date])
    set({ journal: { ...state.journal, [date]: entry } })
    await db.putMany('journal', [entry])
    return entry
  },

  toggleTag: (date, key) => actions.setJournal(date, tagPatch(state.journal[date], key)),
  setStatus: (date, status) => actions.setJournal(date, { status, checkedIn: true }),
  /** "Nothing to tag" / "Done": check the day in, keeping any tags already there. */
  checkIn: date => actions.setJournal(date, { tags: state.journal[date]?.tags ?? [], checkedIn: true }),
  async setCount(date, key, n) {
    const patch = countPatch(state.journal[date], key, n)
    if (isEmptyEntry(makeEntry(date, patch, state.journal[date]))) return actions.clearJournalDay(date)
    return actions.setJournal(date, patch)
  },

  /** Remove a day from the journal (back to "not logged"). */
  async clearJournalDay(date) {
    const { [date]: _gone, ...rest } = state.journal // eslint-disable-line no-unused-vars
    set({ journal: rest })
    await db.deleteMany('journal', [date])
  },

  /** Merge journal entries (newest edit wins). Returns number of entries touched. */
  async applyJournal(list) {
    const { journal, changed } = mergeJournal(state.journal, list)
    if (!changed.length) return 0
    set({ journal })
    await db.putMany('journal', changed)
    return changed.length
  },

  setSync(patch) { set(s => ({ sync: { ...s.sync, ...patch } })) },
  resetSync() { set({ sync: IDLE_SYNC }) },

  setEndpoint(id, patch) {
    set(s => ({ endpoints: { ...s.endpoints, [id]: { ...(s.endpoints[id] || {}), ...patch } } }))
    persistStatusSoon()
  },

  setSyncMeta(patch) {
    set(s => ({ syncMeta: { ...s.syncMeta, ...patch } }))
    persistStatusSoon()
  },

  log(level, msg) {
    set(s => ({ log: [...s.log, { ts: Date.now(), level, msg }].slice(-LOG_LIMIT) }))
    persistStatusSoon()
  },

  /** Merge an imported export (see data/portable.js) into the store. */
  async importData({ days = [], activities = [], profile = null, journal = [] }) {
    const n = await actions.applyDays(Object.fromEntries(days.map(d => [d.date, d])))
    const m = await actions.applyActivities(activities)
    if (profile) await actions.setProfile(profile)
    const j = await actions.applyJournal(journal)
    return { days: n, activities: m, journal: j }
  },

  /** Delete all health data from this device. Keeps the Garmin session and UI preferences. */
  async clearLocalData() {
    await db.clearStores()
    set({ ...initialState, ready: true, source: state.source })
  },

  /** Switch between demo and real data. Reloads so the other database is opened cleanly. */
  switchSource(source) {
    localStorage.setItem(SOURCE_KEY, source)
    const url = new URL(location.href)
    url.searchParams.delete('demo')
    location.replace(url)
  },
}
