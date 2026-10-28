import assert from 'node:assert/strict'
import { buildExport, parseImport, daysToCsv, activitiesToCsv } from '../src/data/portable.js'

const days = { '2026-10-01': { date: '2026-10-01', sleep: { score: 82, durationSec: 27000 }, steps: { total: 9000 } }, '2026-10-02': { date: '2026-10-02', hrv: { lastNight: 55 } } }
const activities = [{ id: 'a1', name: 'Run, easy', type: 'running', day: '2026-10-02', startTs: 1, hrZonesSec: [1, 2, 3, 4, 5], raw: { secret: 1 } }]
const journal = { '2026-10-02': { date: '2026-10-02', tags: [], updatedAt: 5 }, '2026-10-01': { date: '2026-10-01', tags: ['alcohol', 'travel'], updatedAt: 9 } }
const state = { source: 'garmin', days, activities, journal, profile: { displayName: 'MK' }, syncMeta: {}, log: [{ msg: 'x' }], accessToken: 'abc' }

const ex = buildExport(state)
const json = JSON.stringify(ex)
assert.equal(ex.app, 'mk-fitness')
assert.ok(!/token|pin|salt|credential|"log"/i.test(json), 'no token-like keys')
assert.ok(!('raw' in ex.activities[0]), 'raw dropped')
assert.ok('raw' in buildExport(state, { includeRaw: true }).activities[0])

const back = parseImport(json)
assert.equal(back.summary.days, 2); assert.equal(back.summary.activities, 1)
assert.equal(back.summary.from, '2026-10-01'); assert.equal(back.summary.to, '2026-10-02')
assert.deepEqual(back.days, ex.days); assert.equal(back.profile.displayName, 'MK')
assert.equal(parseImport(JSON.stringify(buildExport({ days: {}, activities: [] }))).summary.from, null)

const bad = (text, re) => assert.throws(() => parseImport(text), re)
bad('not json', /not a JSON/)
bad('[]', /not an MK Fitness/)
bad(JSON.stringify({ app: 'other', format: 1, schemaVersion: 1, days: [], activities: [] }), /not exported/)
bad(JSON.stringify({ ...ex, format: 99 }), /newer version/)
bad(JSON.stringify({ ...ex, schemaVersion: 99 }), /newer data version/)
bad(JSON.stringify({ ...ex, days: 'x' }), /missing/)
bad(JSON.stringify({ ...ex, days: [{ date: '2026-13-40' }] }), /invalid date/)
bad(JSON.stringify({ ...ex, activities: [{ name: 'x' }] }), /no id/)

assert.deepEqual(ex.journal.map(e => e.date), ['2026-10-01', '2026-10-02'])
assert.deepEqual(back.journal, ex.journal); assert.equal(back.summary.journal, 2)
const old = { ...ex }; delete old.journal
const oldBack = parseImport(JSON.stringify(old))
assert.deepEqual(oldBack.journal, []); assert.equal(oldBack.summary.journal, 0)
assert.deepEqual(buildExport({ days: {}, activities: [] }).journal, [])
bad(JSON.stringify({ ...ex, journal: 'x' }), /journal in this export is invalid/)
bad(JSON.stringify({ ...ex, journal: [{ date: '2026-99-01', tags: [] }] }), /Journal entry 1 has an invalid date/)
bad(JSON.stringify({ ...ex, journal: [{ date: '2026-10-01', tags: 'x' }] }), /no tags list/)
const dirty = parseImport(JSON.stringify({ ...ex, journal: [{ date: '2026-10-01', tags: ['travel', 'a b', 'travel', 5, ''] }] }))
assert.deepEqual(dirty.journal, [{ date: '2026-10-01', tags: ['travel'], updatedAt: 0 }])

const csv = daysToCsv(days).split('\r\n')
assert.equal(csv.length, 3)
assert.ok(csv[0].startsWith('date,sleepScore'))
assert.ok(csv[1].startsWith('2026-10-01,82,27000'))
const acsv = activitiesToCsv(activities).split('\r\n')
assert.ok(acsv[1].includes('"Run, easy"'))
console.log('portable: ok')
