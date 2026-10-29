// Export / import of the user's own data. Pure functions, no React — unit-tested in scripts/test-portable.mjs.
import { SCHEMA_VERSION } from './schema.js'
import { METRICS, METRIC_KEYS } from '../lib/metrics.js'
import { toCsv } from '../lib/csv.js'
import { cleanStatus, cleanTags } from '../lib/journal.js'

export const EXPORT_APP = 'mk-fitness'
export const EXPORT_FORMAT = 1
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const validDay = s => typeof s === 'string' && DAY_RE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s
const toList = days => Array.isArray(days) ? days : Object.values(days || {})

/** Build the portable JSON document. Includes the user's journal (additive, so format stays 1). Never includes the Garmin token, the sync log or lock settings. */
export function buildExport(state, { includeRaw = false } = {}) {
  const days = toList(state.days).filter(d => d?.date).sort((a, b) => a.date.localeCompare(b.date))
  const activities = (state.activities || []).map(a => {
    if (includeRaw) return a
    const { raw, ...rest } = a // eslint-disable-line no-unused-vars
    return rest
  })
  const journal = Object.values(state.journal || {}).filter(e => e?.date).sort((a, b) => a.date.localeCompare(b.date))
  return {
    app: EXPORT_APP, format: EXPORT_FORMAT, schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(), source: state.source || 'garmin',
    profile: state.profile || null, days, activities, journal,
  }
}

const fail = msg => { throw new Error(msg) }

/** Validate an export file's text. Returns { days, activities, journal, profile, summary } or throws a readable Error. */
export function parseImport(text) {
  let doc
  try { doc = JSON.parse(text) } catch { fail('This is not a JSON file. Only MK Fitness JSON exports can be imported.') }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) fail('This file is not an MK Fitness export.')
  if (doc.app !== EXPORT_APP) fail('This file was not exported by MK Fitness.')
  if (!Number.isInteger(doc.format)) fail('This export has no format version.')
  if (doc.format > EXPORT_FORMAT) fail('This export comes from a newer version of MK Fitness. Update the app and try again.')
  if (!Number.isInteger(doc.schemaVersion) || doc.schemaVersion < 1) fail('This export has no data version.')
  if (doc.schemaVersion > SCHEMA_VERSION) fail('This export uses a newer data version than this app understands.')
  if (!Array.isArray(doc.days) || !Array.isArray(doc.activities)) fail('This export is missing its days or activities list.')

  const days = doc.days.map((d, i) => {
    if (!d || typeof d !== 'object' || Array.isArray(d)) fail(`Day entry ${i + 1} is not an object.`)
    if (!validDay(d.date)) fail(`Day entry ${i + 1} has an invalid date.`)
    return d
  })
  const activities = doc.activities.map((a, i) => {
    if (!a || typeof a !== 'object' || Array.isArray(a)) fail(`Activity entry ${i + 1} is not an object.`)
    if (a.id == null || a.id === '') fail(`Activity entry ${i + 1} has no id.`)
    if (a.day != null && !validDay(a.day)) fail(`Activity entry ${i + 1} has an invalid day.`)
    return { ...a, id: String(a.id) }
  })
  if (doc.profile != null && (typeof doc.profile !== 'object' || Array.isArray(doc.profile))) fail('The profile in this export is invalid.')

  if (doc.journal != null && !Array.isArray(doc.journal)) fail('The journal in this export is invalid.')
  const journal = (doc.journal || []).map((e, i) => {
    if (!e || typeof e !== 'object' || Array.isArray(e)) fail(`Journal entry ${i + 1} is not an object.`)
    if (!validDay(e.date)) fail(`Journal entry ${i + 1} has an invalid date.`)
    if (!Array.isArray(e.tags)) fail(`Journal entry ${i + 1} has no tags list.`)
    const { status, ...rest } = e, s = cleanStatus(status)
    return { ...rest, tags: cleanTags(e.tags), updatedAt: Number.isFinite(e.updatedAt) ? e.updatedAt : 0, ...(s ? { status: s } : {}) }
  })

  const keys = [...days.map(d => d.date), ...activities.map(a => a.day).filter(Boolean), ...journal.map(e => e.date)].sort()
  return {
    days, activities, journal, profile: doc.profile || null,
    summary: { days: days.length, activities: activities.length, journal: journal.length, from: keys[0] || null, to: keys.at(-1) || null },
  }
}

const DAY_EXTRA = [
  ['sleepDeepSec', d => d.sleep?.deepSec], ['sleepLightSec', d => d.sleep?.lightSec], ['sleepRemSec', d => d.sleep?.remSec], ['sleepAwakeSec', d => d.sleep?.awakeSec],
  ['stressRestSec', d => d.stress?.restSec], ['stressLowSec', d => d.stress?.lowSec], ['stressMediumSec', d => d.stress?.mediumSec], ['stressHighSec', d => d.stress?.highSec],
]

/** One row per day. Raw numbers in registry units (durations in seconds); column header is the metric key. */
export function daysToCsv(days) {
  const rows = toList(days).slice().sort((a, b) => a.date.localeCompare(b.date))
  const columns = [
    { key: 'date' },
    ...METRIC_KEYS.map(k => ({ key: k, value: d => METRICS[k].pick(d) })),
    ...DAY_EXTRA.map(([key, value]) => ({ key, value })),
  ]
  return toCsv(rows, columns)
}

const ACT_COLS = ['id', 'name', 'type', 'day', 'startTs', 'durationSec', 'movingSec', 'distanceM', 'calories', 'avgHr', 'maxHr', 'elevationGainM', 'avgSpeed', 'trainingLoad', 'aerobicTE', 'anaerobicTE', 'steps']

export function activitiesToCsv(activities) {
  const rows = (activities || []).slice().sort((a, b) => (a.startTs ?? 0) - (b.startTs ?? 0))
  const columns = [...ACT_COLS.map(key => ({ key })), ...[1, 2, 3, 4, 5].map(z => ({ key: `hrZone${z}Sec`, value: a => a.hrZonesSec?.[z - 1] }))]
  return toCsv(rows, columns)
}
