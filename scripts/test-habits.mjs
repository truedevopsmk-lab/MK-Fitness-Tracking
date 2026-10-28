import assert from 'node:assert/strict'
import { MIN_EACH, OUTCOMES, daysText, findings, habitImpact, impactLine, needText, nightAfter, sampleText } from '../src/lib/habits.js'
import { recoveryFor } from '../src/lib/homeLogic.js'
import { generateDemo, generateDemoJournal } from '../src/data/demo.js'
import { addDays, today } from '../src/lib/dates.js'

const START = '2026-03-01'
const rec = (date, o = {}) => ({ date, sleep: { score: o.score ?? 80, durationSec: 8 * 3600 }, hrv: { lastNight: o.hrv ?? 50 }, heartRate: { resting: o.rhr ?? 55 }, bodyBattery: { high: o.bb ?? 80 } })
const toMap = list => Object.fromEntries(list.map(d => [d.date, d]))
// spec: [{ tags, next }] one logged day each, consecutive from START; the following night gets `next` overrides
function build(spec, base = {}) {
  const days = [], journal = {}
  spec.forEach((s, i) => {
    const d = addDays(START, i * 2)
    if (s.tags) journal[d] = { date: d, tags: s.tags, updatedAt: 0 }
    if (s.next !== null) days.push(rec(addDays(d, 1), { ...base, ...s.next }))
    if (s.same) days.push(rec(d, s.same))
  })
  const to = addDays(START, spec.length * 2 + 1)
  return { days: toMap(days), journal, from: START, to }
}
const rep = (n, f) => Array.from({ length: n }, (_, i) => f(i))

// needs more
{
  const spec = [...rep(4, () => ({ tags: ['alcohol'], next: { score: 70 } })), ...rep(10, () => ({ tags: [], next: { score: 80 } }))]
  const { days, journal, from, to } = build(spec)
  const x = habitImpact(days, journal, from, to), t = x.tags[0], c = t.outcomes.sleepScore
  assert.equal(c.status, 'needs-more'); assert.deepEqual(c.need, { with: 1, without: 0 }); assert.equal(c.diff, null)
  assert.equal(impactLine(t.label, OUTCOMES[1], c), 'Needs 1 more day with it')
  assert.equal(x.ready, 0)
}

// lower, pairing uses D+1 not D
{
  const spec = [...rep(6, () => ({ tags: ['alcohol'], next: { score: 70 }, same: { score: 10 } })), ...rep(8, () => ({ tags: [], next: { score: 80 }, same: { score: 99 } }))]
  const { days, journal, from, to } = build(spec)
  const x = habitImpact(days, journal, from, to), c = x.tags[0].outcomes.sleepScore
  assert.equal(c.status, 'lower'); assert.equal(c.diff, -10); assert.deepEqual(c.shown, { with: 70, without: 80, diff: -10 })
  assert.equal(c.tone, 'bad'); assert.equal(c.clear, true); assert.equal(c.nWith, 6); assert.equal(c.nWithout, 8)
  assert.equal(impactLine('Alcohol', OUTCOMES[1], c), 'After days tagged Alcohol, your sleep score averaged 10 lower (70 vs 80)')
  assert.equal(x.logged, 14); assert.equal(x.tagged, 6); assert.equal(x.ready, 1); assert.equal(x.clearTags, 1)
  assert.deepEqual(findings(x).map(f => f.tag), ['alcohol'])
  assert.equal(findings(x)[0].outcome.key, 'sleepScore')
  assert.equal(sampleText(c), '6 days with, 8 without')
}

// resting HR direction and HRV text
for (const [rhr, tone, status] of [[60, 'bad', 'higher'], [50, 'good', 'lower']]) {
  const spec = [...rep(6, () => ({ tags: ['stress'], next: { rhr } })), ...rep(6, () => ({ tags: [], next: { rhr: 55 } }))]
  const { days, journal, from, to } = build(spec)
  const c = habitImpact(days, journal, from, to).tags[0].outcomes.restingHr
  assert.equal(c.tone, tone); assert.equal(c.status, status)
  assert.ok(impactLine('Stressful day', OUTCOMES[3], c).includes('5 bpm'))
}
{
  const spec = [...rep(6, () => ({ tags: ['alcohol'], next: { hrv: 54 } })), ...rep(6, () => ({ tags: [], next: { hrv: 57 } }))]
  const { days, journal, from, to } = build(spec)
  const c = habitImpact(days, journal, from, to).tags[0].outcomes.hrv
  assert.equal(impactLine('Alcohol', OUTCOMES[2], c), 'After days tagged Alcohol, your HRV averaged 3 ms lower (54 ms vs 57 ms)')
}

// same
{
  const spec = [...rep(6, () => ({ tags: ['alcohol'], next: { score: 81 } })), ...rep(6, () => ({ tags: [], next: { score: 80 } }))]
  const { days, journal, from, to } = build(spec)
  const c = habitImpact(days, journal, from, to).tags[0].outcomes.sleepScore
  assert.equal(c.status, 'same'); assert.equal(c.tone, 'neutral'); assert.equal(c.clear, false)
  assert.equal(impactLine('Alcohol', OUTCOMES[1], c), 'After days tagged Alcohol, your sleep score was about the same (81 vs 80)')
}

// noisy
{
  const w = [60, 95, 62, 96, 64, 90], wo = [80, 82, 79, 81, 80, 78, 82, 80]
  const spec = [...w.map(score => ({ tags: ['alcohol'], next: { score } })), ...wo.map(score => ({ tags: [], next: { score } }))]
  const { days, journal, from, to } = build(spec)
  const c = habitImpact(days, journal, from, to).tags[0].outcomes.sleepScore
  assert.ok(c.status === 'lower' || c.status === 'higher'); assert.equal(c.clear, false)
  assert.deepEqual(findings(habitImpact(days, journal, from, to)), [])
}

// exclusions
{
  const spec = [
    ...rep(5, () => ({ tags: ['alcohol'], next: { score: 70 } })), { tags: ['alcohol'], next: null },
    ...rep(5, () => ({ tags: [], next: { score: 80 } })), { tags: ['padel'], next: { score: 80 } },
  ]
  const { days, journal, from, to } = build(spec)
  journal['2025-01-01'] = { date: '2025-01-01', tags: ['sauna'], updatedAt: 0 }
  days['2025-01-02'] = rec('2025-01-02')
  const x = habitImpact(days, journal, from, to), a = x.tags[0]
  assert.equal(a.key, 'alcohol'); assert.equal(a.days, 6)
  assert.equal(a.outcomes.sleepScore.nWith, 5); assert.equal(a.outcomes.sleepScore.nWithout, 6)
  assert.equal(x.logged, 12); assert.equal(x.tagged, 7)
  assert.deepEqual(x.tags.map(t => t.key), ['alcohol', 'padel'])
  assert.equal(x.tags[1].label, 'padel')
  assert.ok(!x.tags.some(t => t.key === 'sauna'))
  const e = habitImpact(days, { ...journal, [addDays(START, 21)]: { date: addDays(START, 21), tags: [], updatedAt: 0 } }, from, to)
  assert.equal(e.logged, 13); assert.equal(e.tagged, 7); assert.equal(e.tags[0].outcomes.sleepScore.nWithout, 6)
}

// recovery outcome
{
  const spec = rep(3, () => ({ tags: ['alcohol'], next: { score: 66, hrv: 40, bb: 50 } }))
  const { days } = build(spec)
  const d = START
  const want = recoveryFor(days, addDays(d, 1), { sleepNeedHours: 8, lookbackDays: 0 }).score
  assert.equal(nightAfter(days, d).recovery, want)
  assert.equal(nightAfter(days, d, { sleepNeedHours: 8 }).sleepScore, 66)
  assert.equal(nightAfter({}, d).hrv, null)
}

// findings: one per tag, clear only, ordered, limited
{
  const spec = [
    ...rep(6, () => ({ tags: ['alcohol', 'lateMeal'], next: { score: 70, hrv: 45 } })),
    ...rep(6, () => ({ tags: ['lateMeal'], next: { score: 78, hrv: 50 } })),
    ...rep(8, () => ({ tags: [], next: { score: 80, hrv: 50 } })),
  ]
  const { days, journal, from, to } = build(spec)
  const x = habitImpact(days, journal, from, to)
  const all = findings(x, 10)
  assert.ok(all.length <= x.tags.length)
  assert.equal(new Set(all.map(f => f.tag)).size, all.length)
  assert.ok(all.every(f => f.cmp.clear))
  for (let i = 1; i < all.length; i += 1) assert.ok(Math.abs(all[i - 1].cmp.effect) >= Math.abs(all[i].cmp.effect))
  assert.equal(findings(x, 1).length, Math.min(1, all.length))
}

// text helpers
assert.equal(daysText(1), '1 day'); assert.equal(daysText(13), '13 days')
assert.equal(sampleText({ nWith: 13, nWithout: 85 }), '13 days with, 85 without')
assert.equal(needText({ with: 3, without: 1 }), 'Needs 3 more days with it and 1 more without')
assert.equal(needText({ with: 1, without: 0 }), 'Needs 1 more day with it')
assert.equal(needText({ with: 0, without: 2 }), 'Needs 2 more logged days without it')
assert.equal(needText({ with: 0, without: 1 }), 'Needs 1 more logged day without it')
assert.equal(MIN_EACH, 5)

// demo smoke test
{
  const { days } = generateDemo()
  const map = Object.fromEntries(days.map(d => [d.date, d]))
  const journal = Object.fromEntries(generateDemoJournal(days).map(e => [e.date, e]))
  const x = habitImpact(map, journal, addDays(today(), -119), today())
  assert.ok(x.ready >= 3, `ready ${x.ready}`)
  assert.ok(findings(x).length >= 1)
  assert.ok(x.tags.some(t => OUTCOMES.some(o => t.outcomes[o.key].status === 'needs-more')))
}

console.log('habits: ok')
