import assert from 'node:assert/strict'
import { TAGS, TAG_GROUPS, TAG_RE, checkinDay, cleanTags, journalStats, makeEntry, mergeJournal, recentDays, tagInfo, tagLabels, toggleTag } from '../src/lib/journal.js'
import { generateDemo, generateDemoJournal } from '../src/data/demo.js'
import { addDays, parseDay, today } from '../src/lib/dates.js'

// catalogue
const keys = TAGS.map(t => t.key)
assert.equal(new Set(keys).size, keys.length)
assert.ok(keys.every(k => TAG_RE.test(k)))
assert.ok(TAGS.every(t => TAG_GROUPS.some(g => g.key === t.group)))
assert.deepEqual(tagInfo('mystery'), { key: 'mystery', label: 'mystery', group: 'other' })
assert.equal(tagInfo('alcohol').label, 'Alcohol')

// check-in day
assert.equal(checkinDay(new Date(2026, 9, 29, 7, 0)), '2026-10-28')
assert.equal(checkinDay(new Date(2026, 9, 29, 17, 59)), '2026-10-28')
assert.equal(checkinDay(new Date(2026, 9, 29, 18, 0)), '2026-10-29')
assert.equal(checkinDay(new Date(2026, 10, 1, 9, 0)), '2026-10-31')
assert.equal(checkinDay(new Date(2026, 0, 1, 0, 5)), '2025-12-31')

// cleanTags / toggleTag
assert.deepEqual(cleanTags(['travel', 'alcohol', 'travel']), ['alcohol', 'travel'])
assert.deepEqual(cleanTags(['', 'a b', 'x'.repeat(41), 5, null, 'alcohol']), ['alcohol'])
assert.deepEqual(cleanTags(['zzz', 'sauna', 'abc', 'alcohol']), ['alcohol', 'sauna', 'zzz', 'abc'])
assert.deepEqual(cleanTags('nope'), [])
assert.deepEqual(cleanTags(undefined), [])
assert.deepEqual(toggleTag(['travel'], 'alcohol'), ['alcohol', 'travel'])
assert.deepEqual(toggleTag(['alcohol', 'travel'], 'alcohol'), ['travel'])
assert.deepEqual(toggleTag(undefined, 'nap'), ['nap'])
assert.deepEqual(tagLabels(['nap', 'alcohol']), ['Alcohol', 'Nap'])

// makeEntry
const prev = { date: '2026-10-01', tags: ['nap'], updatedAt: 1, note: 'keep' }
const e1 = makeEntry('2026-10-01', { tags: ['alcohol', 'bad tag'] }, prev, 50)
assert.deepEqual(e1, { date: '2026-10-01', tags: ['alcohol'], updatedAt: 50, note: 'keep' })
assert.deepEqual(makeEntry('2026-10-02', {}, null, 7), { date: '2026-10-02', tags: [], updatedAt: 7 })
assert.deepEqual(makeEntry('2026-10-01', {}, prev, 9).tags, ['nap'])

// mergeJournal
const cur = { '2026-10-01': { date: '2026-10-01', tags: ['alcohol'], updatedAt: 100 } }
let r = mergeJournal(cur, [{ date: '2026-10-02', tags: ['nap'], updatedAt: 5 }])
assert.equal(r.changed.length, 1); assert.deepEqual(Object.keys(r.journal), ['2026-10-01', '2026-10-02']); assert.notEqual(r.journal, cur)
r = mergeJournal(cur, [{ date: '2026-10-01', tags: ['travel'], updatedAt: 200 }])
assert.deepEqual(r.journal['2026-10-01'].tags, ['travel']); assert.equal(r.changed.length, 1)
for (const inc of [{ updatedAt: 50, tags: ['travel'] }, { updatedAt: 100, tags: ['travel'] }, { updatedAt: 300, tags: ['alcohol'] }]) {
  r = mergeJournal(cur, [{ date: '2026-10-01', ...inc }])
  assert.equal(r.journal, cur); assert.equal(r.changed.length, 0)
}
r = mergeJournal({}, [{ date: '2026-10-03', tags: ['zz', 'a b'] }])
assert.deepEqual(r.journal['2026-10-03'], { date: '2026-10-03', tags: ['zz'], updatedAt: 0 })

// stats / recent
const j = {
  '2026-10-10': { date: '2026-10-10', tags: ['alcohol', 'nap'], updatedAt: 1 }, '2026-10-09': { date: '2026-10-09', tags: ['nap'], updatedAt: 1 },
  '2026-10-08': { date: '2026-10-08', tags: [], updatedAt: 1 }, '2026-09-01': { date: '2026-09-01', tags: ['sauna'], updatedAt: 1 },
}
const st = journalStats(j, '2026-10-10', 7)
assert.equal(st.logged, 3); assert.equal(st.total, 7)
assert.deepEqual(st.counts, [{ key: 'nap', label: 'Nap', days: 2 }, { key: 'alcohol', label: 'Alcohol', days: 1 }])
const rd = recentDays(j, '2026-10-10', 4)
assert.deepEqual(rd.map(x => x.date), ['2026-10-10', '2026-10-09', '2026-10-08', '2026-10-07'])
assert.equal(rd[3].entry, null); assert.deepEqual(rd[2].entry.tags, [])

// demo journal
const before = JSON.stringify(generateDemo())
const { days } = generateDemo()
const a = generateDemoJournal(days), b = generateDemoJournal(days)
assert.deepEqual(a, b)
assert.deepEqual(generateDemoJournal(Object.fromEntries(days.map(d => [d.date, d]))), a)
assert.equal(JSON.stringify(generateDemo()), before)
assert.ok(a.length >= 80 && a.length <= 110, `entries ${a.length}`)
const yest = addDays(today(), -1)
assert.ok(a.every(e => e.date < yest))
assert.ok(a.every(e => e.tags.every(t => keys.includes(t))))
const share = list => list.filter(e => e.tags.includes('alcohol')).length / list.length
const wk = e => [5, 6].includes(parseDay(e.date).getDay())
assert.ok(share(a.filter(wk)) > share(a.filter(e => !wk(e))))

console.log('journal: ok')
