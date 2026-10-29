// Normalised data model. Every Garmin payload is converted into these shapes by
// src/data/normalize.js before it reaches IndexedDB or the UI. UI code must only
// ever read these shapes — never raw Garmin JSON.
//
// Conventions
//  - Every field is optional and may be null: Garmin omits data freely.
//  - Durations are seconds (…Sec), distances metres (…M), timestamps epoch ms (…Ts, real UTC instants).
//  - A day key is a LOCAL calendar day 'YYYY-MM-DD' (see src/lib/dates.js).
//  - Sleep belongs to the day you WOKE UP (Garmin's calendarDate convention).

export const SCHEMA_VERSION = 1

/**
 * @typedef {'deep'|'light'|'rem'|'awake'} SleepStage
 *
 * @typedef {Object} SleepRecord
 * @property {number|null} score            overall sleep score 0–100
 * @property {string|null} qualifier        Garmin's word for it, e.g. 'GOOD', 'FAIR'
 * @property {number|null} durationSec      total sleep (excludes awake time)
 * @property {number|null} deepSec
 * @property {number|null} lightSec
 * @property {number|null} remSec
 * @property {number|null} awakeSec
 * @property {number|null} startTs          fell asleep (epoch ms)
 * @property {number|null} endTs            woke up (epoch ms)
 * @property {number|null} needSec          Garmin's sleep need, if provided
 * @property {number|null} restingHr        resting heart rate during sleep
 * @property {number|null} avgHr
 * @property {number|null} avgHrv           overnight average HRV (ms)
 * @property {number|null} avgRespiration   breaths/min
 * @property {number|null} avgSpo2          %
 * @property {number|null} bodyBatteryChange  BB gained overnight
 * @property {number|null} awakeCount       times woken during the night
 * @property {number|null} avgSleepStress   average stress while asleep (0–100)
 * @property {number|null} lowRespiration   breaths/min
 * @property {number|null} highRespiration  breaths/min
 * @property {number|null} napSec           daytime nap time Garmin attributes to this day
 * @property {number|null} unmeasurableSec  time the watch could not classify
 * @property {string|null} feedback         Garmin's feedback code, e.g. 'POSITIVE_LONG_AND_DEEP'
 * @property {Object<string, SleepSubScore>} [subScores]  keys: duration, stress, awakenings, restlessness, rem, light, deep
 * @property {Array<{start:number,end:number,stage:SleepStage}>} [stages]  hypnogram, epoch ms
 *
 * @typedef {Object} SleepSubScore
 * @property {number|null} value        percentage of the night for rem/light/deep, otherwise usually null
 * @property {string|null} qualifier    Garmin's qualifierKey, e.g. 'EXCELLENT', 'GOOD', 'FAIR', 'POOR'
 * @property {number|null} optimalLow   start of Garmin's optimal range (units depend on the component)
 * @property {number|null} optimalHigh
 *
 * @typedef {Object} DayRecord
 * @property {string} date
 * @property {{total:number|null, goal:number|null, distanceM:number|null}} [steps]
 * @property {{avg:number|null, max:number|null, restSec:number|null, lowSec:number|null, mediumSec:number|null, highSec:number|null}} [stress]
 * @property {{start:number|null, end:number|null, high:number|null, low:number|null, charged:number|null, drained:number|null, latest?:number|null, atWake?:number|null, duringSleep?:number|null, samples?:Array<[number, number]>}} [bodyBattery]
 *           start/end = first/last level of the day; samples = [epochMs, level] sorted ascending;
 *           latest = most recent reading, atWake = level on waking, duringSleep = gained overnight
 * @property {SleepRecord} [sleep]
 * @property {{lastNight:number|null, weeklyAvg:number|null, lastNightHigh:number|null, status:string|null, baselineLow:number|null, baselineHigh:number|null}} [hrv]
 *           status is Garmin's: 'BALANCED' | 'UNBALANCED' | 'LOW' | 'POOR' | 'NONE'; baseline = balanced range
 * @property {{resting:number|null, min:number|null, max:number|null, resting7d?:number|null, samples?:Array<[number, number]>}} [heartRate]
 *           resting7d = Garmin's 7-day average resting HR; samples = [bucketEpochMs, bpm] in 10-minute buckets (only with ≥ 2 buckets)
 * @property {{waking:number|null, low:number|null, high:number|null, latest:number|null}} [respiration]  breaths/min
 * @property {{activeSec:number|null, highlyActiveSec:number|null, sedentarySec:number|null, activeKcal:number|null, totalKcal:number|null, floors:number|null}} [movement]
 * @property {{moderate:number|null, vigorous:number|null, goal:number|null}} [intensity]
 *           minutes; Garmin counts total = moderate + 2 × vigorous, goal is WEEKLY (default 150)
 * @property {{score:number|null, level:string|null, feedback:string|null}} [readiness]
 * @property {{kg:number|null}} [weight]
 * @property {{count:number, durationSec:number, distanceM:number, calories:number, load:number|null}} [training]
 *           derived from that day's activities — never fetched directly
 *
 * @typedef {Object} Activity
 * @property {string} id
 * @property {string} name
 * @property {string} type              Garmin typeKey, e.g. 'running', 'cycling', 'strength_training'
 * @property {string} day               local day key of the start
 * @property {number|null} startTs
 * @property {number|null} durationSec
 * @property {number|null} movingSec
 * @property {number|null} distanceM
 * @property {number|null} calories
 * @property {number|null} avgHr
 * @property {number|null} maxHr
 * @property {number|null} elevationGainM
 * @property {number|null} avgSpeed     m/s
 * @property {number|null} trainingLoad Garmin's activityTrainingLoad
 * @property {number|null} aerobicTE
 * @property {number|null} anaerobicTE
 * @property {number|null} steps
 * @property {number[]|null} hrZonesSec  seconds in HR zones 1–5
 * @property {object} [raw]             original summary, for the detail page's raw view
 *
 * @typedef {Object} JournalEntry  User-entered, stored in the `journal` store, never synced. An empty `tags` list means "checked in, nothing to tag".
 * @property {string} date       local YYYY-MM-DD the tags belong to
 * @property {string[]} tags
 * @property {'sick'|'injured'|'travelling'|'break'} [status]  day status; this day and the day after are left out of baselines
 * @property {number} updatedAt  epoch ms of the last edit
 *
 * @typedef {Object} Profile
 * @property {string|null} displayName
 * @property {string|null} fullName
 * @property {string|null} timeZone
 * @property {number|null} stepGoal
 * @property {number|null} sleepNeedSec
 */

export {}
