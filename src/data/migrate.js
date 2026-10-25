// One-time import of the v1 IndexedDB blobs (store `data`: wellness / activities / settings / lastSync)
// into the normalised stores. Runs before the app store exists, so it talks to db.js directly.
// Idempotent and never throws on odd shapes: the legacy store is only cleared after a successful write.
import * as db from './db.js'
import {
  activitiesFrom, bodyBatteryFrom, collect, hrvFrom, profileFrom, rowsOf, sleepDays, stepsFrom, stressFrom, trainingByDay, weightFrom,
} from './normalize.js'
import { mergeDays } from './merge.js'

const safe = fn => { try { return fn() } catch { return null } }

/** Pure mapping of the v1 blobs → normalised data. */
export function mapLegacy({ wellness, activities, settings, lastSync } = {}) {
  const w = wellness && typeof wellness === 'object' ? wellness : {}
  const parts = [
    safe(() => collect(rowsOf(w.steps, ['dailyStepsList', 'steps']).map(stepsFrom))),
    safe(() => collect(rowsOf(w.stress, ['dailyStressList', 'stress']).map(stressFrom))),
    safe(() => collect(rowsOf(w.bodyBattery, ['bodyBattery', 'reports']).map(bodyBatteryFrom))),
    safe(() => sleepDays(w.sleep)),
    safe(() => collect(rowsOf(w.hrv, ['hrvSummaries']).map(hrvFrom))),
    safe(() => collect(rowsOf(w.weight, ['dailyWeightSummaries', 'dateWeightList']).map(weightFrom))),
  ]
  let days = {}
  for (const p of parts) days = mergeDays(days, p || {}).days
  const acts = safe(() => activitiesFrom(activities)) || []
  for (const [d, training] of Object.entries(trainingByDay(acts))) days = mergeDays(days, { [d]: { training } }).days
  const t = lastSync ? new Date(lastSync).getTime() : NaN
  return { days: Object.values(days), activities: acts, profile: safe(() => profileFrom(settings)), lastSuccessAt: Number.isFinite(t) ? t : null }
}

export async function migrateLegacy() {
  try {
    const [wellness, activities, settings, lastSync] = await Promise.all(['wellness', 'activities', 'settings', 'lastSync'].map(k => db.getLegacy(k).catch(() => null)))
    if (wellness == null && activities == null && settings == null && lastSync == null) return { migrated: false }
    const m = mapLegacy({ wellness, activities, settings, lastSync })
    const [haveDays, haveActs] = await Promise.all([db.getAll('days').catch(() => []), db.getAll('activities').catch(() => [])])
    // never overwrite data that sync already wrote into the new stores
    const existingDays = new Map(haveDays.map(d => [d.date, d]))
    const days = m.days.map(d => existingDays.has(d.date) ? mergeDays({ [d.date]: d }, { [d.date]: existingDays.get(d.date) }).days[d.date] : d)
    await db.putMany('days', days)
    const haveIds = new Set(haveActs.map(a => a.id))
    await db.putMany('activities', m.activities.filter(a => !haveIds.has(a.id)))
    const meta = {}
    if (m.profile) meta.profile = m.profile
    if (m.lastSuccessAt) {
      const prev = await db.getMeta('syncMeta', null)
      if (!prev?.lastSuccessAt) meta.syncMeta = { ...(prev || {}), lastSuccessAt: m.lastSuccessAt, lastResult: 'ok' }
    }
    if (Object.keys(meta).length) await db.setMeta(meta)
    await db.clearStores(['data'])
    return { migrated: true, days: days.length, activities: m.activities.length }
  } catch (e) {
    console.warn('legacy migration skipped', e)
    return { migrated: false, error: e?.message }
  }
}
