import assert from 'node:assert/strict'
const root = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const n = await import(`${root}/src/data/normalize.js`)
const { ENDPOINTS, ENDPOINT_BY_ID } = await import(`${root}/src/sync/endpoints.js`)
const eng = await import(`${root}/src/sync/engine.js`)
const g = await import(`${root}/src/sync/garmin.js`)
const { mapLegacy } = await import(`${root}/src/data/migrate.js`)
const { mergeDays, mergeActivities } = await import(`${root}/src/data/merge.js`)
const { chunkRange, addDays } = await import(`${root}/src/lib/dates.js`)
let count = 0
const t = (name, fn) => Promise.resolve().then(fn).then(() => { count++ }, e => { console.error('FAIL', name); throw e })

// ---- fixtures ----
const sleepWrapped = { dailySleepDTO: { calendarDate: '2026-10-24', sleepTimeSeconds: 27000, deepSleepSeconds: 5400, lightSleepSeconds: 14400, remSleepSeconds: 6000, awakeSleepSeconds: 1200,
  sleepStartTimestampGMT: 1792770000000, sleepEndTimestampGMT: 1792797000000, sleepScores: { overall: { value: 82, qualifierKey: 'GOOD' } }, avgHeartRate: 52.5 },
  restingHeartRate: 49, avgOvernightHrv: 61.2, bodyBatteryChange: 63,
  sleepLevels: [{ startGMT: '2026-10-24T20:00:00.0', endGMT: '2026-10-24T21:00:00.0', activityLevel: 1 }, { startGMT: '2026-10-24T21:00:00.0', endGMT: '2026-10-24T22:00:00.0', activityLevel: 0 }, { startGMT: '2026-10-24T22:00:00.0', endGMT: '2026-10-24T22:00:00.0', activityLevel: 2 }, { startGMT: 'junk', activityLevel: 9 }] }
const sleepFlat = { calendarDate: '2026-10-23', sleepTimeSeconds: '25000', overallSleepScore: '74', deepSleepSeconds: null }
const comp = (q, extra = {}) => ({ qualifierKey: q, optimalStart: 1, optimalEnd: 2, ...extra })
const sleepReal = { calendarDate: '2026-10-25', sleepTimeSeconds: 26400, napTimeSeconds: 1200, sleepStartTimestampGMT: 1792770000000, sleepEndTimestampGMT: 1792797000000, unmeasurableSleepSeconds: 0,
  deepSleepSeconds: 4800, lightSleepSeconds: 15000, remSleepSeconds: 6600, awakeSleepSeconds: 900, averageRespirationValue: 14.5, lowestRespirationValue: 11, highestRespirationValue: 19, awakeCount: 2, avgSleepStress: 14.5,
  sleepScoreFeedback: 'POSITIVE_LONG_AND_DEEP', sleepScoreInsight: 'NONE',
  sleepScores: { totalDuration: comp('GOOD', { optimalStart: 27000, optimalEnd: 32400 }), stress: comp('FAIR'), awakeCount: comp('GOOD'), overall: { value: 77, qualifierKey: 'GOOD' },
    remPercentage: comp('EXCELLENT', { value: 25, optimalStart: 21, optimalEnd: 31, idealStartInSeconds: 5000, idealEndInSeconds: 8000 }), restlessness: comp('FAIR'), lightPercentage: comp('GOOD', { value: 57 }), deepPercentage: comp('FAIR', { value: 18 }) } }
const act = { activityId: 12345678901, activityName: 'Morning Run', startTimeLocal: '2026-10-24 06:12:00', startTimeGMT: '2026-10-24 00:42:00', activityType: { typeKey: 'running' }, duration: 1800.4, distance: 5200, calories: 410, averageHR: 150, maxHR: 171, activityTrainingLoad: 95.4, hrTimeInZone_1: 60, hrTimeInZone_2: 300 }
const act2 = { activityId: 12345678902, startTimeLocal: '2026-10-24T18:00:00.0', startTimeGMT: '2026-10-24T12:30:00.0', activityType: { typeKey: 'strength_training' }, duration: 2400, distance: 0, calories: 200 }

// ---- helpers ----
await t('num/pickNumber', () => {
  assert.equal(n.num('12.5'), 12.5); assert.equal(n.num(''), null); assert.equal(n.num(NaN), null); assert.equal(n.num(null), null); assert.equal(n.num({}), null)
  assert.equal(n.pickNumber({ a: null, b: '7' }, ['a', 'b']), 7); assert.equal(n.pickNumber(null, ['a']), null)
})
await t('tsOf treats GMT strings as UTC', () => {
  assert.equal(n.tsOf('2026-10-24 00:42:00'), Date.UTC(2026, 9, 24, 0, 42)); assert.equal(n.tsOf('2026-10-24T00:42:00.0'), Date.UTC(2026, 9, 24, 0, 42))
  assert.equal(n.tsOf(1792770000), 1792770000000); assert.equal(n.tsOf('x'), null); assert.equal(n.tsOf(null), null)
})
await t('firstNumber finds nested', () => assert.equal(n.firstNumber({ a: [{ b: { score: 5 } }] }, ['score']), 5))

// ---- sleep ----
await t('sleep wrapped', () => {
  const s = n.sleepFrom(sleepWrapped)
  assert.equal(s.day, '2026-10-24'); assert.equal(s.sleep.score, 82); assert.equal(s.sleep.qualifier, 'GOOD')
  assert.equal(s.sleep.deepSec, 5400); assert.equal(s.sleep.durationSec, 27000); assert.equal(s.sleep.restingHr, 49); assert.equal(s.sleep.avgHrv, 61.2); assert.equal(s.sleep.bodyBatteryChange, 63)
  assert.equal(s.sleep.startTs, 1792770000000)
  assert.deepEqual(s.sleep.stages.map(x => x.stage), ['light', 'deep']) // zero-length and junk levels dropped
  assert.equal(s.sleep.stages[0].start, Date.UTC(2026, 9, 24, 20))
})
await t('sleep real flat row', () => {
  const s = n.sleepFrom(sleepReal).sleep
  assert.equal(s.score, 77); assert.equal(s.qualifier, 'GOOD'); assert.equal(s.startTs, 1792770000000); assert.equal(s.endTs, 1792797000000)
  assert.equal(s.awakeCount, 2); assert.equal(s.avgSleepStress, 14.5); assert.equal(s.lowRespiration, 11); assert.equal(s.highRespiration, 19); assert.equal(s.napSec, 1200); assert.equal(s.unmeasurableSec, 0)
  assert.equal(s.feedback, 'POSITIVE_LONG_AND_DEEP'); assert.equal(s.restingHr, null); assert.equal(s.avgHrv, null)
  assert.deepEqual(s.subScores.rem, { value: 25, qualifier: 'EXCELLENT', optimalLow: 21, optimalHigh: 31 })
  assert.equal(s.subScores.duration.value, null); assert.equal(s.subScores.duration.qualifier, 'GOOD'); assert.equal(s.subScores.duration.optimalHigh, 32400)
  assert.deepEqual(Object.keys(s.subScores).sort(), ['awakenings', 'deep', 'duration', 'light', 'rem', 'restlessness', 'stress'])
  assert.ok(!('overall' in s.subScores))
  const { sleepScores, ...noScores } = sleepReal
  assert.ok(!('subScores' in n.sleepFrom(noScores).sleep))
  assert.ok(!('subScores' in n.sleepFrom({ ...sleepReal, sleepScores: { overall: { value: 70 } } }).sleep))
  assert.equal(n.sleepFrom({ ...sleepReal, avgSleepStress: -1 }).sleep.avgSleepStress, null)
})
await t('sleep score variants', () => {
  assert.equal(n.sleepFrom({ calendarDate: '2026-10-01', sleepTimeSeconds: 1, sleepScores: { overallScore: 70 } }).sleep.score, 70)
  assert.equal(n.sleepFrom({ calendarDate: '2026-10-01', sleepScore: 66 }).sleep.score, 66)
  assert.equal(n.sleepFrom({ date: '2026-10-01', overallSleepScore: { value: 91 } }).sleep.score, 91)
  assert.equal(n.sleepFrom({ calendarDate: '2026-10-01' }), null)
  assert.equal(n.sleepFrom(null), null); assert.equal(n.sleepFrom('x'), null); assert.equal(n.sleepFrom({ overallSleepScore: 80 }), null, 'no day')
})
await t('sleepDays shapes', () => {
  const a = n.sleepDays([sleepFlat, { calendarDate: '2026-10-22', sleepScore: 60 }, null, 5])
  assert.deepEqual(Object.keys(a).sort(), ['2026-10-22', '2026-10-23']); assert.equal(a['2026-10-23'].sleep.score, 74); assert.equal(a['2026-10-23'].sleep.durationSec, 25000)
  assert.equal(Object.keys(n.sleepDays({ dailySleepSummaries: [sleepFlat] })).length, 1)
  assert.equal(Object.keys(n.sleepDays({ dailySleepDTOList: [sleepFlat] })).length, 1)
  assert.equal(Object.keys(n.sleepDays(sleepWrapped)).length, 1)
  assert.deepEqual(n.sleepDays(null), {}); assert.deepEqual(n.sleepDays([]), {}); assert.deepEqual(n.sleepDays({}), {})
})

// ---- body battery ----
await t('bodyBattery samples both shapes + derived', () => {
  const t0 = Date.UTC(2026, 9, 24, 0)
  const a = n.bodyBatteryFrom({ calendarDate: '2026-10-24', bodyBatteryValuesArray: [[t0, 50], [t0 + 1, 40], [t0 + 2, 70], [t0 + 3, 60]] })
  assert.equal(a.day, '2026-10-24'); assert.equal(a.bodyBattery.start, 50); assert.equal(a.bodyBattery.end, 60); assert.equal(a.bodyBattery.high, 70); assert.equal(a.bodyBattery.low, 40)
  assert.equal(a.bodyBattery.charged, 30); assert.equal(a.bodyBattery.drained, 20)
  const b = n.bodyBatteryFrom({ date: '2026-10-24', bodyBatteryValuesArray: [[t0 + 2, 'MEASURED', 70, 1], [t0, 'MEASURED', 50, 1], [t0 + 1, 'MEASURED', 40, 1], [t0 + 3, 'MEASURED', null, 1]] })
  assert.equal(b.bodyBattery.start, 50); assert.equal(b.bodyBattery.end, 70); assert.equal(b.bodyBattery.samples.length, 3)
  assert.equal(n.bodyBatteryFrom({ calendarDate: '2026-10-24', bodyBatteryValuesArray: [], charged: 12, drained: 30 }).bodyBattery.charged, 12)
  assert.equal(n.bodyBatteryFrom({ calendarDate: '2026-10-24', bodyBatteryValuesArray: null }), null)
  assert.equal(n.bodyBatteryFrom({ bodyBatteryValuesArray: [['x', 1]] }), null)
})

// ---- other daily rows ----
await t('steps/stress/hrv/weight', () => {
  assert.deepEqual(n.stepsFrom({ calendarDate: '2026-10-24', totalSteps: '9000', stepGoal: 8000, totalDistance: 6500 }).steps, { total: 9000, goal: 8000, distanceM: 6500 })
  assert.equal(n.stepsFrom({ calendarDate: '2026-10-24' }), null)
  const s = n.stressFrom({ calendarDate: '2026-10-24', values: { overallStressLevel: 31, highStressDuration: 3600, restStressDuration: 7200, maxStressLevel: 90 } })
  assert.equal(s.stress.avg, 31); assert.equal(s.stress.highSec, 3600); assert.equal(s.stress.max, 90)
  assert.equal(n.stressFrom({ calendarDate: '2026-10-24', values: { overallStressLevel: -1 } }), null, '-1 = no data')
  const h = n.hrvFrom({ calendarDate: '2026-10-24', weeklyAvg: 60, lastNightAvg: 58, lastNight5MinHigh: 90, status: 'BALANCED', baseline: { balancedLow: 50, balancedUpper: 70 } })
  assert.deepEqual(h.hrv, { lastNight: 58, weeklyAvg: 60, lastNightHigh: 90, status: 'BALANCED', baselineLow: 50, baselineHigh: 70 })
  assert.equal(n.weightFrom({ calendarDate: '2026-10-24', weight: 72500 }).weight.kg, 72.5)
  assert.equal(n.weightFrom({ summaryDate: '2026-10-24', latestWeight: { weight: 72.4, calendarDate: '2026-10-24' } }).weight.kg, 72.4)
  assert.equal(n.weightFrom({ calendarDate: '2026-10-24', weight: null }), null)
})
await t('daily summary / readiness / intensity / heart-rate normalisers', () => {
  const u = ENDPOINT_BY_ID.userSummary.normalize({ calendarDate: '2026-10-24', restingHeartRate: 50, minHeartRate: 44, maxHeartRate: 160, moderateIntensityMinutes: 20, vigorousIntensityMinutes: 5, bodyBatteryChargedValue: 60, bodyBatteryDrainedValue: 55, totalSteps: 7000, averageStressLevel: 28 }, { date: '2026-10-24' }).days['2026-10-24']
  assert.equal(u.heartRate.resting, 50); assert.equal(u.intensity.vigorous, 5); assert.equal(u.bodyBattery.charged, 60); assert.equal(u.stress.avg, 28); assert.equal(u.steps.total, 7000)
  assert.deepEqual(ENDPOINT_BY_ID.userSummary.normalize(null, { date: '2026-10-24' }).days, {})
  const u2 = ENDPOINT_BY_ID.userSummary.normalize({ calendarDate: '2026-10-24', restingHeartRate: 50, lastSevenDaysAvgRestingHeartRate: 52, bodyBatteryMostRecentValue: 41, bodyBatteryAtWakeTime: 88, bodyBatteryDuringSleep: 63,
    avgWakingRespirationValue: 15, lowestRespirationValue: 10, highestRespirationValue: 22, latestRespirationValue: 14, activeSeconds: 5000, highlyActiveSeconds: 900, sedentarySeconds: 30000, activeKilocalories: 500, totalKilocalories: 2300, floorsAscended: 12.5 }, { date: '2026-10-24' }).days['2026-10-24']
  assert.equal(u2.heartRate.resting7d, 52); assert.equal(u2.bodyBattery.latest, 41); assert.equal(u2.bodyBattery.atWake, 88); assert.equal(u2.bodyBattery.duringSleep, 63)
  assert.deepEqual(u2.respiration, { waking: 15, low: 10, high: 22, latest: 14 })
  assert.deepEqual(u2.movement, { activeSec: 5000, highlyActiveSec: 900, sedentarySec: 30000, activeKcal: 500, totalKcal: 2300, floors: 12.5 })
  assert.ok(!('respiration' in u) && !('movement' in u))
  const r = ENDPOINT_BY_ID.readiness.normalize([{ calendarDate: '2026-10-24', score: 40, level: 'LOW' }, { calendarDate: '2026-10-24', score: 72, level: 'HIGH', feedbackShort: 'PRIME' }], { date: '2026-10-24' }).days['2026-10-24']
  assert.equal(r.readiness.score, 72); assert.equal(r.readiness.feedback, 'PRIME')
  const im = ENDPOINT_BY_ID.intensity.normalize({ values: [{ calendarDate: '2026-10-24', moderateValue: 10, vigorousValue: 2, weeklyGoal: 150 }] }, {}).days['2026-10-24']
  assert.deepEqual(im.intensity, { moderate: 10, vigorous: 2, goal: 150 })
  const hr = ENDPOINT_BY_ID.heartRate.normalize({ calendarDate: '2026-10-24', restingHeartRate: 51, maxHeartRate: 150, heartRateValues: [[1, 60]] }, { date: '2026-10-24' }).days['2026-10-24']
  assert.equal(hr.heartRate.resting, 51)
  assert.deepEqual(ENDPOINT_BY_ID.heartRate.normalize({}, { date: '2026-10-24' }).days, {})
})
await t('heart-rate intraday samples', () => {
  const t0 = Date.UTC(2026, 9, 24, 3, 0)
  const min = m => t0 + m * 60000
  const vals = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24].map((m, i) => [min(m), 60 + i])
  const hr = n.heartRateFrom({ calendarDate: '2026-10-24', restingHeartRate: 50, lastSevenDaysAvgRestingHeartRate: 53, heartRateValueDescriptors: [{ index: 0, key: 'timestamp' }, { index: 1, key: 'heartrate' }], heartRateValues: [...vals, [min(26), null], [min(27), 0], ['x', 70]] }).heartRate
  assert.equal(hr.resting7d, 53)
  assert.deepEqual(hr.samples, [[min(0), 62], [min(10), 67], [min(20), 71]])
})
await t('heart-rate samples descriptors, nulls, single bucket', () => {
  const t0 = Date.UTC(2026, 9, 24, 3, 0)
  const swapped = n.hrSamples({ heartRateValueDescriptors: [{ index: 0, key: 'heartrate' }, { index: 1, key: 'timestamp' }], heartRateValues: [[60, t0], [70, t0 + 700000], [null, t0 + 800000]] })
  assert.deepEqual(swapped, [[t0, 60], [t0 + 600000, 70]])
  assert.deepEqual(n.hrSamples({ heartRateValues: [[t0, 60], [t0 + 120000, 64]] }), [[t0, 62]], 'default order')
  assert.deepEqual(n.hrSamples({}), []); assert.deepEqual(n.hrSamples(null), [])
  const one = n.heartRateFrom({ calendarDate: '2026-10-24', restingHeartRate: 50, heartRateValues: [[t0, 60], [t0 + 120000, 64]] }).heartRate
  assert.ok(!('samples' in one))
  const only = n.heartRateFrom({ calendarDate: '2026-10-24', heartRateValues: [[t0, 60], [t0 + 700000, 70]] })
  assert.equal(only.heartRate.samples.length, 2); assert.equal(only.heartRate.resting, null)
  assert.equal(n.heartRateFrom({ calendarDate: '2026-10-24', heartRateValues: [[t0, 60]] }), null)
})
await t('activities endpoint returns owner name', () => {
  const ep = ENDPOINT_BY_ID.activities
  assert.deepEqual(ep.normalize([{ ...act, ownerFullName: '  Test Person ' }]).profile, { fullName: 'Test Person' })
  assert.equal(ep.normalize([act2, { ...act, ownerFullName: 'Test Person' }]).profile.fullName, 'Test Person')
  assert.ok(!('profile' in ep.normalize([act, { ...act2, ownerFullName: '  ' }])))
  assert.ok(!('profile' in ep.normalize(null)))
  assert.equal(n.ownerNameFrom([act]), null)
})
await t('registry endpoints all normalise junk without throwing', () => {
  for (const ep of ENDPOINTS) for (const junk of [null, undefined, [], {}, 'x', 0, [null, 5, 'a'], { a: { b: 1 } }]) {
    const r = ep.normalize(junk, { date: '2026-10-24' }); assert.ok(r && typeof r === 'object', ep.id)
  }
  assert.deepEqual(ENDPOINTS.filter(e => e.experimental).map(e => e.id).sort(), ['intensity', 'readiness'])
  const bb = ENDPOINT_BY_ID.bodyBattery
  assert.deepEqual(bb.params('2026-10-01', '2026-10-27'), { startDate: '2026-10-01', endDate: '2026-10-27' })
})

// ---- activities & training ----
await t('activityFrom', () => {
  const a = n.activityFrom(act)
  assert.equal(a.id, '12345678901'); assert.equal(a.day, '2026-10-24'); assert.equal(a.startTs, Date.UTC(2026, 9, 24, 0, 42)); assert.equal(a.type, 'running')
  assert.equal(a.durationSec, 1800.4); assert.deepEqual(a.hrZonesSec, [60, 300, 0, 0, 0]); assert.equal(a.trainingLoad, 95.4); assert.equal(a.name, 'Morning Run')
  const b = n.activityFrom(act2); assert.equal(b.name, 'strength training'); assert.equal(b.hrZonesSec, null); assert.equal(b.avgHr, null)
  assert.equal(n.activityFrom({}), null); assert.equal(n.activityFrom(null), null)
  assert.equal(n.activitiesFrom({ activities: [act, null, act2] }).length, 2); assert.deepEqual(n.activitiesFrom('x'), [])
})
await t('trainingByDay', () => {
  const tr = n.trainingByDay(n.activitiesFrom([act, act2]))
  assert.deepEqual(tr['2026-10-24'], { count: 2, durationSec: 4200, distanceM: 5200, calories: 610, load: 95.4 })
  assert.deepEqual(n.trainingByDay(null), {})
})

// ---- profile ----
await t('profileFrom', () => {
  const p = n.profileFrom({ userData: { timeZone: 'Asia/Kolkata', sleepNeedMinutes: 480 }, displayName: 'mk', dailyStepGoal: 9000 })
  assert.equal(p.timeZone, 'Asia/Kolkata'); assert.equal(p.sleepNeedSec, 28800); assert.equal(p.stepGoal, 9000); assert.equal(n.profileFrom({}), null); assert.equal(n.profileFrom(null), null)
})

// ---- planning ----
const prefs = { historyDays: 365, perDayDays: 90 }
await t('planRequests full', () => {
  const plan = eng.planRequests(ENDPOINTS, 'full', {}, prefs, '2026-10-25')
  const steps = plan.filter(p => p.id === 'steps')
  assert.equal(steps.length, Math.ceil(365 / 27)); assert.equal(steps[0].to, '2026-10-25', 'newest first'); assert.equal(steps.at(-1).from, '2025-10-26')
  const days = plan.filter(p => p.id === 'userSummary'); assert.equal(days.length, 90); assert.equal(days[0].date, '2026-10-25'); assert.equal(days.at(-1).date, addDays('2026-10-25', -89))
  assert.equal(new Set(plan.map(p => p.key)).size, plan.length, 'unique keys')
  assert.equal(plan[0].id, 'profile')
})
await t('planRequests handles month boundaries (v1 infinite loop)', () => {
  const plan = eng.planRequests(ENDPOINTS.filter(e => e.id === 'steps'), 'full', {}, { historyDays: 40, perDayDays: 5 }, '2026-03-02')
  assert.ok(plan.length >= 2 && plan.length < 5)
})
await t('planRequests incremental window + unavailable skipping', () => {
  const asOf = '2026-10-25', lastOkAt = new Date(2026, 9, 24, 10).getTime()
  const statuses = { steps: { status: 'ok', lastOkAt }, userSummary: { status: 'unavailable' }, readiness: { status: 'ok', lastOkAt: new Date(2026, 9, 25, 9).getTime() } }
  const plan = eng.planRequests(ENDPOINTS, 'incremental', {}, prefs, asOf, statuses)
  const steps = plan.filter(p => p.id === 'steps'); assert.equal(steps.length, 1); assert.equal(steps[0].from, '2026-10-22'); assert.equal(steps[0].to, '2026-10-25')
  assert.equal(plan.filter(p => p.id === 'userSummary').length, 0, 'unavailable skipped on incremental')
  assert.equal(plan.filter(p => p.id === 'readiness').length, 3, 'min 3 days')
  assert.equal(eng.planRequests(ENDPOINTS, 'full', {}, prefs, asOf, statuses).filter(p => p.id === 'userSummary').length, 90, 'retried on full')
  const first = eng.planRequests(ENDPOINTS, 'incremental', {}, prefs, asOf, {})
  assert.equal(first.filter(p => p.id === 'heartRate').length, 14, 'first-ever per-day run is shallow')
})
await t('planRequests retry only failed ranges', () => {
  const statuses = { steps: { status: 'partial', failedRanges: [['2026-09-01', '2026-09-27']] }, sleep: { status: 'ok' }, stress: { status: 'failed', failedRanges: [] } }
  const plan = eng.planRequests(ENDPOINTS, 'retry', {}, prefs, '2026-10-25', statuses)
  assert.deepEqual(plan.filter(p => p.id === 'steps').map(p => [p.from, p.to]), [['2026-09-01', '2026-09-27']])
  assert.ok(plan.some(p => p.id === 'stress') && !plan.some(p => p.id === 'sleep'))
  const one = eng.planRequests(ENDPOINTS, 'retry', {}, prefs, '2026-10-25', statuses, { ids: ['sleep'] })
  assert.ok(one.length > 0 && one.every(p => p.id === 'sleep'))
})
await t('backoff', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map(a => eng.backoffMs(a)), [2000, 4000, 8000, 16000, 32000, 60000, 60000])
  assert.equal(eng.backoffMs(1, 23000), 23000); assert.equal(eng.backoffMs(3, null), 8000); assert.equal(eng.backoffMs(1, 0), 2000); assert.equal(eng.backoffMs(1, 9e6), 120000)
  assert.equal(eng.maxAttemptsFor('rate-limit'), 4); assert.equal(eng.maxAttemptsFor('server'), 4); assert.equal(eng.maxAttemptsFor('network'), 3); assert.equal(eng.maxAttemptsFor('auth'), 1)
})
await t('outcome/overall/coverage/autosync', () => {
  assert.equal(eng.outcomeStatus({ requests: 3, failedRequests: 3, records: 0 }), 'failed'); assert.equal(eng.outcomeStatus({ requests: 3, failedRequests: 1, records: 9 }), 'partial')
  assert.equal(eng.outcomeStatus({ requests: 3, failedRequests: 0, records: 0 }), 'empty'); assert.equal(eng.outcomeStatus({ requests: 3, failedRequests: 0, records: 2 }), 'ok'); assert.equal(eng.outcomeStatus({ unavailable: true, requests: 1 }), 'unavailable')
  assert.equal(eng.overallResult({ a: { status: 'ok' }, b: { status: 'unavailable' }, c: { status: 'empty' } }), 'ok')
  assert.equal(eng.overallResult({ a: { status: 'ok' }, b: { status: 'failed' } }), 'partial'); assert.equal(eng.overallResult({ b: { status: 'failed' } }), 'failed'); assert.equal(eng.overallResult({}, { cancelled: true }), 'cancelled')
  assert.deepEqual(eng.mergeCoverage({ first: '2026-01-02', last: '2026-02-01' }, { first: '2026-01-01', last: '2026-01-15' }), { first: '2026-01-01', last: '2026-02-01' })
  assert.deepEqual(eng.coverageOfDays({ '2026-01-02': { date: 'x', steps: {} }, '2026-01-01': { date: 'x' } }), { first: '2026-01-02', last: '2026-01-02' })
  const base = { prefs: { autoSync: true }, valid: true, source: 'garmin', lastSuccessAt: 1000, running: false }
  assert.equal(eng.shouldAutoSync(base, 1000 + 31 * 60000), true); assert.equal(eng.shouldAutoSync(base, 1000 + 29 * 60000), false)
  assert.equal(eng.shouldAutoSync({ ...base, lastAttemptAt: 1000 + 25 * 60000 }, 1000 + 40 * 60000), false, 'recent failed attempt throttles too')
  assert.equal(eng.shouldAutoSync({ ...base, source: 'demo' }, 9e9), false); assert.equal(eng.shouldAutoSync({ ...base, valid: false }, 9e9), false); assert.equal(eng.shouldAutoSync({ ...base, prefs: { autoSync: false } }, 9e9), false)
})

// ---- garmin client ----
await t('garmin helpers', async () => {
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url')
  assert.equal(g.jwtExpiry(`h.${b64({ exp: 1800000000 })}.s`), 1800000000000); assert.equal(g.jwtExpiry('notajwt'), null); assert.equal(g.jwtExpiry(null), null)
  assert.equal(g.parseRetryAfter('23'), 23000); assert.equal(g.parseRetryAfter(null), null); assert.equal(g.parseRetryAfter('abc'), null); assert.equal(g.parseRetryAfter(new Date(10000).toUTCString(), 4000), 6000)
  assert.equal(g.kindForStatus(429), 'rate-limit'); assert.equal(g.kindForStatus(403), 'auth'); assert.equal(g.kindForStatus(404), 'not-found'); assert.equal(g.kindForStatus(503), 'server')
  const ac = new AbortController(); const p = g.sleep(60000, ac.signal); ac.abort()
  await assert.rejects(p, e => e.kind === 'aborted')
  await assert.rejects(g.request('/x', {}, { signal: ac.signal }), e => e.kind === 'aborted')
  assert.equal(g.isSessionValid(), false)
  await assert.rejects(g.request('/x'), e => e.kind === 'session')
})

// ---- engine end-to-end with fake deps ----
function fakeDeps(handler, init = {}) {
  let state = { source: 'garmin', days: {}, activities: [], profile: null, syncMeta: {}, endpoints: {}, sync: {}, log: [], ...init }
  const calls = []
  const actions = {
    async applyDays(p) { state = { ...state, days: mergeDays(state.days, p).days }; return Object.keys(p).length },
    async applyActivities(l) { state = { ...state, activities: mergeActivities(state.activities, l).activities }; return l.length },
    async setProfile(p) { state = { ...state, profile: { ...(state.profile || {}), ...p } } },
    setSync(p) { state = { ...state, sync: { ...state.sync, ...p } } }, resetSync() { state = { ...state, sync: { running: false } } },
    setEndpoint(id, p) { state = { ...state, endpoints: { ...state.endpoints, [id]: { ...(state.endpoints[id] || {}), ...p } } } },
    setSyncMeta(p) { state = { ...state, syncMeta: { ...state.syncMeta, ...p } } },
    log(level, msg) { state.log.push({ level, msg }) },
  }
  const gErr = (m, o) => new g.GarminError(m, o)
  return { calls, get state() { return state }, gErr, deps: {
    actions, getState: () => state, getPrefs: () => ({ historyDays: 30, perDayDays: 4 }), now: () => Date.now(), isSessionValid: () => true, markExpired() {},
    sleep: () => Promise.resolve(), request: async (path, params) => { calls.push(path); return handler(path, params, gErr) },
  } }
}
const ok = (path, params, e) => {
  if (path.includes('activities/search')) return params.start === 0 ? [act, act2] : []
  if (path.includes('settings')) return { userData: { timeZone: 'Asia/Kolkata' } }
  if (path.includes('steps/daily')) return [{ calendarDate: path.split('/').at(-1), totalSteps: 5000 }]
  if (path.includes('dailySleepSummariesByDate')) return { dailySleepSummaries: [sleepFlat] }
  if (path.includes('usersummary/daily')) throw e('Not allowed', { status: 403, kind: 'auth' })
  if (path.includes('trainingreadiness')) throw e('nf', { status: 404, kind: 'not-found' })
  if (path.includes('stats/im/daily')) return null
  if (path.includes('hrv')) throw e('Garmin server error (500)', { status: 500, kind: 'server' })
  return []
}
await t('engine full sync: statuses, partial failure, unavailable, training', async () => {
  const f = fakeDeps(ok)
  const out = await eng.executeSync({ mode: 'full' }, { deps: f.deps })
  const eps = f.state.endpoints
  assert.equal(eps.steps.status, 'ok'); assert.ok(eps.steps.records >= 1); assert.equal(eps.activities.status, 'ok'); assert.equal(eps.activities.records, 2)
  assert.equal(eps.userSummary.status, 'unavailable'); assert.equal(f.calls.filter(c => c.includes('usersummary/daily')).length, 1, 'probes newest day only')
  assert.equal(eps.readiness.status, 'unavailable'); assert.equal(eps.intensity.status, 'empty'); assert.equal(eps.hrv.status, 'failed'); assert.match(eps.hrv.error, /500/)
  assert.equal(eps.heartRate.status, 'empty')
  assert.equal(out.result, 'partial'); assert.equal(f.state.syncMeta.lastResult, 'partial'); assert.ok(f.state.syncMeta.lastSuccessAt > 0, 'a partial run still counts as a sync time')
  assert.deepEqual(f.state.days['2026-10-24'].training, { count: 2, durationSec: 4200, distanceM: 5200, calories: 610, load: 95.4 })
  assert.equal(f.state.days['2026-10-23'].sleep.score, 74); assert.equal(f.state.profile.timeZone, 'Asia/Kolkata')
  assert.ok(f.state.syncMeta.coverage.first <= '2026-10-23'); assert.equal(f.state.sync.running, false)
  assert.ok(eps.hrv.failedRanges.length > 0 && eps.hrv.failedRequests >= 1)
  assert.ok(f.state.log.some(l => l.level === 'error' && /Heart rate variability/.test(l.msg)), 'errors logged, not swallowed')
})
await t('engine retry only reruns failed endpoints', async () => {
  const f = fakeDeps(ok)
  await eng.executeSync({ mode: 'full' }, { deps: f.deps })
  f.calls.length = 0
  await eng.executeSync({ mode: 'retry' }, { deps: f.deps })
  assert.ok(f.calls.length > 0 && f.calls.every(c => c.includes('/hrv/')), `only hrv retried, got ${[...new Set(f.calls)]}`)
})
await t('engine all-ok sets lastSuccessAt; 429 honours Retry-After and recovers', async () => {
  let hits = 0
  const waits = []
  const f = fakeDeps((path, params, e) => {
    if (path.includes('steps/daily') && hits++ < 2) throw e('slow down', { status: 429, kind: 'rate-limit', retryAfterMs: 23000 })
    if (path.includes('activities/search')) return []
    return null
  })
  f.deps.sleep = async ms => { waits.push(ms) }
  const out = await eng.executeSync({ mode: 'incremental' }, { deps: f.deps })
  assert.equal(out.result, 'ok'); assert.ok(f.state.syncMeta.lastSuccessAt > 0)
  assert.ok(waits.includes(23000)); assert.equal(f.state.endpoints.steps.status, 'empty')
})
await t('engine cancel + session failure', async () => {
  const ac = new AbortController()
  const f = fakeDeps(async path => { if (path.includes('steps')) ac.abort(); return [] })
  f.deps.sleep = async (ms, signal) => { if (signal?.aborted) throw f.gErr('Cancelled', { kind: 'aborted' }) }
  const out = await eng.executeSync({ mode: 'full' }, { signal: ac.signal, deps: f.deps })
  assert.equal(out.result, 'cancelled'); assert.equal(f.state.syncMeta.lastResult, 'cancelled'); assert.ok(Object.values(f.state.endpoints).some(e => e.status === 'cancelled'))
  const s = fakeDeps((p, q, e) => { throw e('Garmin rejected the session (401)', { status: 401, kind: 'auth' }) })
  const o2 = await eng.executeSync({ mode: 'incremental' }, { deps: s.deps })
  assert.equal(o2.result, 'failed'); assert.match(o2.error, /session|401/); assert.equal(s.state.syncMeta.lastSuccessAt, undefined)
})
await t('engine network errors retry then fail the chunk; breaker stops endpoint', async () => {
  const f = fakeDeps((p, q, e) => { if (p.includes('stats/stress')) throw e('Could not reach Garmin', { kind: 'network' }); return [] })
  const out = await eng.executeSync({ mode: 'full' }, { deps: f.deps })
  assert.equal(f.state.endpoints.stress.status, 'failed'); assert.equal(f.calls.filter(c => c.includes('stats/stress')).length, 6, '2 chunks x 3 attempts')
  assert.equal(out.result, 'partial')
})
await t('incremental merge never wipes history', async () => {
  const f = fakeDeps(() => [], { days: { '2026-01-01': { date: '2026-01-01', steps: { total: 8000 } } } })
  await eng.executeSync({ mode: 'incremental' }, { deps: f.deps })
  assert.equal(f.state.days['2026-01-01'].steps.total, 8000)
})

// ---- migrate ----
await t('mapLegacy', () => {
  const t0 = Date.UTC(2026, 9, 24)
  const m = mapLegacy({
    wellness: { steps: [{ calendarDate: '2026-10-24', totalSteps: 100 }], stress: [{ calendarDate: '2026-10-24', values: { overallStressLevel: 20 } }],
      bodyBattery: [{ date: '2026-10-24', bodyBatteryValuesArray: [[t0, 40], [t0 + 1, 55]] }], sleep: [sleepFlat, sleepWrapped], hrv: { hrvSummaries: [{ calendarDate: '2026-10-24', lastNightAvg: 55 }] }, weight: { dailyWeightSummaries: [{ summaryDate: '2026-10-24', latestWeight: { weight: 72000 } }] } },
    activities: [act, act2], settings: { timeZone: 'Asia/Kolkata' }, lastSync: '2026-10-24T10:00:00.000Z',
  })
  const d = m.days.find(x => x.date === '2026-10-24')
  assert.equal(d.steps.total, 100); assert.equal(d.stress.avg, 20); assert.equal(d.bodyBattery.end, 55); assert.equal(d.sleep.score, 82); assert.equal(d.hrv.lastNight, 55); assert.equal(d.weight.kg, 72); assert.equal(d.training.count, 2)
  assert.equal(m.activities.length, 2); assert.equal(m.profile.timeZone, 'Asia/Kolkata'); assert.equal(m.lastSuccessAt, Date.parse('2026-10-24T10:00:00.000Z'))
})
await t('mapLegacy odd shapes never throw', () => {
  for (const x of [undefined, {}, { wellness: null, activities: 'x' }, { wellness: { steps: 5, sleep: 'junk', bodyBattery: [null, 3] }, activities: [null, 1], settings: 7, lastSync: 'nope' }, { wellness: [] }]) {
    const m = mapLegacy(x); assert.ok(Array.isArray(m.days) && Array.isArray(m.activities))
  }
  assert.equal(mapLegacy({ lastSync: 'nope' }).lastSuccessAt, null)
})
await t('merge sanity: nulls do not erase', () => {
  const { days } = mergeDays({ '2026-10-24': { date: '2026-10-24', steps: { total: 5 } } }, { '2026-10-24': { steps: { total: null, goal: 8000 } } })
  assert.equal(days['2026-10-24'].steps.total, 5); assert.equal(days['2026-10-24'].steps.goal, 8000)
  assert.deepEqual(chunkRange('2026-10-01', '2026-10-01', 27), [['2026-10-01', '2026-10-01']])
})

console.log(`test-data: all ${count} groups passed`)
