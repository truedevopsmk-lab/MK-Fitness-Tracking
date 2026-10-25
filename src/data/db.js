// IndexedDB persistence. Stores normalised records only (see schema.js).
//   days        keyPath 'date'  → DayRecord
//   activities  keyPath 'id'    → Activity
//   meta        out-of-line key → profile, syncMeta, endpoints, log
//   data        legacy v1 store (raw Garmin payloads) — read once by migrate.js, then cleared

const REAL_DB = 'garmin-personal-dashboard', DEMO_DB = 'mk-fitness-demo', VERSION = 2

let dbName = REAL_DB
let handle = null

export function useDemoDatabase(demo) { dbName = demo ? DEMO_DB : REAL_DB; handle = null }

function open() {
  if (handle) return handle
  handle = new Promise((resolve, reject) => {
    const r = indexedDB.open(dbName, VERSION)
    r.onupgradeneeded = () => {
      const db = r.result
      if (!db.objectStoreNames.contains('data')) db.createObjectStore('data')
      if (!db.objectStoreNames.contains('days')) db.createObjectStore('days', { keyPath: 'date' })
      if (!db.objectStoreNames.contains('activities')) db.createObjectStore('activities', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta')
    }
    r.onsuccess = () => { r.result.onversionchange = () => { r.result.close(); handle = null }; resolve(r.result) }
    r.onerror = () => { handle = null; reject(r.error) }
  })
  return handle
}

const done = tx => new Promise((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error) })
const request = r => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error) })

export async function getAll(store) { const db = await open(); return request(db.transaction(store).objectStore(store).getAll()) }
export async function getMeta(key, fallback = null) { const db = await open(); return (await request(db.transaction('meta').objectStore('meta').get(key))) ?? fallback }
export async function getLegacy(key) { const db = await open(); return request(db.transaction('data').objectStore('data').get(key)) }

export async function putMany(store, records) {
  if (!records.length) return
  const db = await open(), tx = db.transaction(store, 'readwrite'), os = tx.objectStore(store)
  records.forEach(r => os.put(r))
  return done(tx)
}

export async function setMeta(entries) {
  const db = await open(), tx = db.transaction('meta', 'readwrite'), os = tx.objectStore('meta')
  Object.entries(entries).forEach(([k, v]) => os.put(v, k))
  return done(tx)
}

export async function clearStores(stores = ['days', 'activities', 'meta', 'data']) {
  const db = await open(), tx = db.transaction(stores, 'readwrite')
  stores.forEach(s => tx.objectStore(s).clear())
  return done(tx)
}

/** Rough on-disk footprint for the Settings page. */
export async function estimateUsage() {
  try { const e = await navigator.storage?.estimate?.(); return e ? { usage: e.usage, quota: e.quota } : null } catch { return null }
}
