import assert from 'node:assert/strict'
import { buildAiSummary, daysWithData } from '../src/lib/aiSummary.js'
import { generateDemo } from '../src/data/demo.js'
import { addDays, today } from '../src/lib/dates.js'

// Small fixture: two days, one workout with a city in its title, a journal entry
const days = {
  '2026-10-01': { date: '2026-10-01', sleep: { score: 82, durationSec: 27000, deepSec: 4800 }, steps: { total: 9000, goal: 8000 }, hrv: { lastNight: 55, status: 'BALANCED' } },
  '2026-10-02': { date: '2026-10-02', stress: { avg: 31 }, heartRate: { resting: 52 } },
}
const activities = [{ id: '98765432101', name: 'Bengaluru Running', type: 'running', day: '2026-10-02', startTs: new Date(2026, 9, 2, 6, 15).getTime(), durationSec: 1800, distanceM: 5000, avgHr: 150, maxHr: 171, trainingLoad: 80, hrZonesSec: [60, 300, 600, 700, 140], raw: { ownerDisplayName: 'mk-secret', locationName: 'Bengaluru' } }]
const journal = { '2026-10-02': { date: '2026-10-02', tags: ['alcohol', 'lateMeal'], counts: { water: 6 }, updatedAt: 1 } }
const state = { days, activities, journal, profile: { displayName: 'Muthu', id: 'u-123' }, accessToken: 'tok-abc' }

const r = buildAiSummary(state, { from: '2026-10-01', to: '2026-10-02', sleepNeedHours: 7.5 })
const t = r.text
assert.equal(r.days, 2); assert.equal(r.withData, 2); assert.equal(r.workouts, 1)
for (const bad of ['Bengaluru', 'Muthu', 'mk-secret', '98765432101', 'u-123', 'tok-abc']) assert.ok(!t.includes(bad), `leaks ${bad}`)
assert.match(t, /^# My Garmin data: 1 Oct 2026 – 2 Oct 2026 \(2 days\)/)
assert.match(t, /Sleep need: 7\.5 h/)
assert.match(t, /Daily step goal: 8,000/)
assert.match(t, /\| 2026-10-01 Thu \| 82 \| 7h 30m \|/, 'table row with registry formatting')
assert.match(t, /55 ms \(Balanced\)/, 'HRV with Garmin status')
assert.match(t, /\| 2026-10-02 Fri \| — \| — \|/, 'missing values are dashes')
assert.match(t, /Alcohol, Late meal · 6 glasses of water/, 'journal text')
assert.match(t, /- 2026-10-02 Fri 06:15 am · Running · 30m · 5\.00 km · pace 6:00 \/km · avg HR 150, max 171 bpm · load 80 · minutes in HR zones 1–5: 1\/5\/10\/12\/2/)
assert.ok(!/REM sleep|Weight|Overnight respiration \|/.test(t.split('## This period')[0]), 'empty columns are dropped')
assert.ok(!/Today \(.*\) is still in progress/.test(t), 'past range has no in-progress note')
assert.ok(!t.includes('Status days are left out'), 'no status note without status days')
assert.ok(!/[ \t]$/m.test(t), 'no trailing spaces')
assert.ok(t.endsWith('\n'))

// One day: a list instead of a table, with the previous-30-day average where there's enough history
const one = buildAiSummary(state, { from: '2026-10-02', to: '2026-10-02' })
assert.equal(one.days, 1)
assert.match(one.text, /^# My Garmin data: Fri 2 Oct 2026/)
assert.match(one.text, /## The day\n- Resting heart rate: 52 bpm\n- Average stress: 31\n- Journal: /)
assert.ok(!one.text.includes('previous 30-day average'), 'needs 5 days of history for an average')
assert.ok(!one.text.includes('## This period vs'), 'no comparison table for one day')
const empty = buildAiSummary({ days: {}, activities: [], journal: {} }, { from: '2026-10-05', to: '2026-10-05' })
assert.match(empty.text, /No data synced for this day\./)
assert.match(empty.text, /No workouts recorded in this period\./)
assert.equal(empty.withData, 0)

// Status days: noted, and left out of the comparison baseline
const sick = { ...journal, '2026-10-01': { date: '2026-10-01', tags: [], status: 'sick', updatedAt: 1 } }
const s = buildAiSummary({ days, activities, journal: sick }, { from: '2026-10-01', to: '2026-10-02', exclude: new Set(['2026-10-01', '2026-10-02']) })
assert.match(s.text, /\| Sick \|/)
assert.match(s.text, /\| Sleep score \| 82 \(1 day\) \| — \|/)
assert.match(s.text, /journal status \(Sick\) and the day after each are left out/)
assert.match(s.text, /Status days are left out of the earlier period\./)

// Demo data: the full picture, including today in progress, the comparison, vitals and insights
const g = generateDemo(), dd = Object.fromEntries(g.days.map(d => [d.date, d])), now = today()
const demo = buildAiSummary({ days: dd, activities: g.activities, journal: {} }, { from: addDays(now, -6), to: now })
assert.equal(demo.days, 7); assert.equal(demo.withData, 7)
assert.equal(demo.text.split('\n').filter(l => /^\| \d{4}-\d\d-\d\d /.test(l)).length, 7)
assert.match(demo.text, /is still in progress/)
assert.match(demo.text, /## This period vs the 30 days before/)
assert.match(demo.text, /\| Overnight HRV \| \d+ ms \(7 days\) \| \d+ ms \(\d+ days\) \|/)
assert.match(demo.text, /## Overnight vitals vs my normal range/)
assert.match(demo.text, /## Patterns the app found[^]*\(Based on /, 'insights keep their sample sizes')
assert.match(demo.text, /\d+ \(est\.\)/, 'recovery estimate is labelled')
for (const a of g.activities.slice(-20)) assert.ok(!demo.text.includes(a.name), 'no workout titles')
assert.equal(daysWithData(dd, addDays(now, -6), now), 7)
const year = buildAiSummary({ days: dd, activities: g.activities, journal: {} }, { from: addDays(now, -364), to: now })
assert.equal(year.days, 365)
assert.ok(year.text.length < 200000, 'a year stays a pasteable size')

console.log('aisummary tests passed')
