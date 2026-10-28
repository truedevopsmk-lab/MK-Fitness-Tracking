import assert from 'node:assert/strict'
import { HOUR, timelineDays, defaultTimelineDay, timeTicks, withGaps, dayTimeline } from '../src/lib/timeline.js'
import { addDays, parseDay } from '../src/lib/dates.js'

const D = '2026-03-10', PREV = addDays(D, -1), NEXT = addDays(D, 1)
const at = (day, h, m = 0) => { const d = parseDay(day); d.setHours(h, m, 0, 0); return d.getTime() }
const MID = at(D, 0), NEXT_MID = at(NEXT, 0)

const series = (from, to, stepMin, f) => { const out = []; for (let t = from; t < to; t += stepMin * 60000) { const v = f(t); if (v != null) out.push([t, v]) } return out }
const hole = t => t >= at(D, 12) && t < at(D, 13, 30)
const hrPrev = series(at(PREV, 21), MID, 10, () => 60)
const hrDay = series(MID, NEXT_MID, 10, t => hole(t) ? null : t === at(D, 7, 20) ? 150 : t === at(D, 3) ? 48 : 70)
const bbPrev = series(at(PREV, 21), MID, 15, () => 30)
const bbDay = series(MID, NEXT_MID, 15, t => t === at(D, 8) ? 90 : t === at(D, 22) ? 12 : 50)
const sleep = { startTs: at(PREV, 23, 10), endTs: at(D, 6, 25), durationSec: 7 * 3600, score: 81 }
const act = { id: 'a1', name: 'Run', type: 'running', startTs: at(D, 7), durationSec: 45 * 60, avgHr: 140, maxHr: 165 }
const build = (over = {}) => ({
  [PREV]: { heartRate: { samples: hrPrev }, bodyBattery: { samples: bbPrev } },
  [D]: { heartRate: { samples: hrDay, resting: 52 }, bodyBattery: { samples: bbDay }, sleep, ...over },
  [NEXT]: { sleep: { startTs: at(D, 23, 30), endTs: at(NEXT, 6), durationSec: 6.5 * 3600, score: 70 } },
})
const days = build()

// window
let t = dayTimeline(days, [act], D, at(NEXT, 12))
assert.equal(t.start, at(PREV, 23)); assert.equal(t.end, NEXT_MID); assert.equal(t.isToday, false)
t = dayTimeline(build({ sleep: { ...sleep, startTs: at(PREV, 14) } }), [], D, at(NEXT, 12))
assert.equal(t.start, MID - 6 * HOUR)
t = dayTimeline(build({ sleep: undefined }), [], D, at(NEXT, 12))
assert.equal(t.start, MID)
t = dayTimeline(days, [], D, at(D, 14, 20))
assert.equal(t.isToday, true); assert.equal(t.end, at(D, 15))
t = dayTimeline(days, [], D, at(D, 14, 0))
assert.equal(t.end, at(D, 14))

// merging and gaps
t = dayTimeline(days, [act], D, at(NEXT, 12))
assert.equal(t.hr[0].ts, at(PREV, 23)); assert.ok(t.hr.some(p => p.ts < MID) && t.hr.some(p => p.ts >= MID))
assert.equal(t.hr.filter(p => p.v == null).length, 1)
const nul = t.hr.find(p => p.v == null)
assert.ok(nul.ts > at(D, 11, 50) && nul.ts < at(D, 13, 40))
assert.equal(t.bb.filter(p => p.v == null).length, 0)
assert.equal(new Set(t.hr.map(p => p.ts)).size, t.hr.length)
const dup = { ...days, [PREV]: { heartRate: { samples: [...hrPrev, [MID - 600000, 60]] } } }
assert.equal(dayTimeline(dup, [], D, at(NEXT, 12)).hr.length, t.hr.length)
assert.equal(withGaps([{ ts: 0, v: 1 }, { ts: 600000, v: 2 }]).length, 2)

// stats
const s = t.stats
assert.equal(s.hrMin, 48); assert.equal(s.hrMinTs, at(D, 3)); assert.equal(s.hrMax, 150); assert.equal(s.hrMaxTs, at(D, 7, 20))
assert.equal(s.bbHigh, 90); assert.equal(s.bbHighTs, at(D, 8)); assert.equal(s.bbLow, 12); assert.equal(s.bbLowTs, at(D, 22))
assert.equal(s.asleepSec, 7 * 3600); assert.equal(s.sleepScore, 81); assert.equal(s.resting, 52)
assert.equal(s.workouts, 1); assert.equal(s.workoutSec, 45 * 60)

// hours
assert.equal(t.hours.length, 25); assert.equal(t.hours[0].ts, at(PREV, 23))
assert.equal(t.hours[0].state, 'Asleep')
assert.equal(t.hours.find(h => h.ts === at(D, 7)).state, 'Run')
const noon = t.hours.find(h => h.ts === at(D, 14))
assert.equal(noon.state, null); assert.equal(noon.hr, 70)
assert.equal(t.hours.find(h => h.ts === at(D, 12)).hr, null)
assert.equal(t.hours.find(h => h.ts === at(D, 13)).hr, 70)

// tonight's sleep
assert.equal(t.sleep.length, 2)
assert.equal(t.sleep[0].night, D); assert.equal(t.sleep[0].start, at(PREV, 23, 10)); assert.equal(t.sleep[0].end, at(D, 6, 25))
assert.equal(t.sleep[1].night, NEXT); assert.equal(t.sleep[1].start, at(D, 23, 30)); assert.equal(t.sleep[1].end, NEXT_MID)
assert.equal(t.hours.find(h => h.ts === at(D, 23)).state, 'Asleep')

// events
const kinds = t.events.map(e => e.kind)
assert.deepEqual(kinds, ['sleep', 'wake', 'activity', 'hrMax', 'bbHigh', 'bbLow', 'sleep'])
assert.ok(t.events.every((e, i) => i === 0 || e.ts >= t.events[i - 1].ts))
assert.equal(t.events.find(e => e.kind === 'wake').score, 81)
assert.equal(t.events.filter(e => e.kind === 'sleep').at(-1).ts, at(D, 23, 30))
assert.equal(t.events.find(e => e.kind === 'activity').act.id, 'a1')

// empty day
t = dayTimeline({}, [], D, at(NEXT, 12))
assert.equal(t.hr.length, 0); assert.equal(t.lastTs, null); assert.equal(t.stats.hrMin, null); assert.equal(t.events.length, 0)

// day lists
assert.deepEqual(timelineDays({ ...days, '2026-03-01': { heartRate: { samples: [[1, 1]] } } }), [PREV, D])
assert.equal(defaultTimelineDay(days, D), D)
assert.equal(defaultTimelineDay(days, '2026-03-20'), D)
assert.equal(defaultTimelineDay(days, '2026-03-01'), null)

// ticks
const tk = timeTicks(at(PREV, 23), NEXT_MID).map(x => new Date(x).getHours())
assert.deepEqual(tk, [0, 6, 12, 18, 0])
const tk3 = timeTicks(at(D, 8, 30), at(D, 15)).map(x => new Date(x).getHours())
assert.deepEqual(tk3, [9, 12, 15])

console.log('timeline tests: all passed')
