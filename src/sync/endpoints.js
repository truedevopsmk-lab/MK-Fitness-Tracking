// Endpoint registry. Each entry knows its Garmin path and how to turn the response into
// normalised partial records: normalize(json, ctx) → { days?: { 'YYYY-MM-DD': partial }, activities?, profile? }.
//   kind 'range'  one request per chunk of `chunkDays` days  path(from, to)
//   kind 'perDay' one request per day                        path(date)
//   kind 'paged'  `limit`/`start` paging                     params({ start, limit })
//   kind 'single' one request
// `experimental` endpoints (readiness, intensity) return 404 for Personal API keys (checked 2026-10-28)
// and degrade to 'unavailable' after one request.
import {
  activitiesFrom, bodyBatteryFrom, collect, heartRateFrom, hrvFrom, intensityFrom, ownerNameFrom, profileFrom, readinessFrom,
  rowsOf, sleepDays, stepsFrom, stressFrom, userSummaryFrom, weightFrom,
} from '../data/normalize.js'

const PAGE = 100
const days = (json, keys, fn) => collect(rowsOf(json, keys).map(r => fn(r)))
const wrap = fn => (json, ctx) => ({ days: fn(json, ctx) })

export const ENDPOINTS = [
  {
    id: 'profile', label: 'Profile settings', group: 'Account', kind: 'single',
    path: () => '/userprofile-service/userprofile/settings',
    normalize: json => ({ profile: profileFrom(json) }),
  },
  {
    id: 'activities', label: 'Activities', group: 'Training', kind: 'paged', pageSize: PAGE, maxItems: 5000,
    path: () => '/activitylist-service/activities/search/activities',
    params: ({ start = 0, limit = PAGE } = {}) => ({ start, limit }),
    normalize: json => {
      const fullName = ownerNameFrom(json)
      return { activities: activitiesFrom(json), ...(fullName ? { profile: { fullName } } : {}) }
    },
  },
  {
    id: 'steps', label: 'Daily steps', group: 'Activity', kind: 'range', chunkDays: 27,
    path: (from, to) => `/usersummary-service/stats/steps/daily/${from}/${to}`,
    normalize: wrap((json, ctx) => days(json, ['dailyStepsList', 'steps'], stepsFrom, ctx)),
  },
  {
    id: 'stress', label: 'Daily stress', group: 'Recovery', kind: 'range', chunkDays: 27,
    path: (from, to) => `/usersummary-service/stats/stress/daily/${from}/${to}`,
    normalize: wrap((json, ctx) => days(json, ['dailyStressList', 'stress'], stressFrom, ctx)),
  },
  {
    id: 'bodyBattery', label: 'Body Battery', group: 'Recovery', kind: 'range', chunkDays: 27,
    path: () => '/wellness-service/wellness/bodyBattery/reports/daily',
    params: (from, to) => ({ startDate: from, endDate: to }),
    normalize: wrap((json, ctx) => days(json, ['bodyBattery', 'reports'], bodyBatteryFrom, ctx)),
  },
  {
    id: 'sleep', label: 'Sleep', group: 'Sleep', kind: 'range', chunkDays: 27,
    path: () => '/sleep-service/sleep/dailySleepSummariesByDate',
    params: (from, to) => ({ startDate: from, endDate: to }),
    normalize: wrap(json => sleepDays(json)),
    // v1 learned that the summaries call is sometimes empty; per-day then gives the full detail.
    fallback: {
      path: () => '/sleep-service/sleep/dailySleep',
      params: date => ({ date }),
      normalize: wrap(json => sleepDays(json)),
    },
  },
  {
    id: 'hrv', label: 'Heart rate variability', group: 'Recovery', kind: 'range', chunkDays: 27,
    path: (from, to) => `/hrv-service/hrv/daily/${from}/${to}`,
    normalize: wrap((json, ctx) => days(json, ['hrvSummaries'], hrvFrom, ctx)),
  },
  {
    id: 'weight', label: 'Weight', group: 'Body', kind: 'range', chunkDays: 27,
    path: (from, to) => `/weight-service/weight/range/${from}/${to}`,
    normalize: wrap((json, ctx) => days(json, ['dailyWeightSummaries', 'dateWeightList'], weightFrom, ctx)),
  },
  {
    id: 'userSummary', label: 'Daily summary', group: 'Activity', kind: 'perDay',
    path: () => '/usersummary-service/usersummary/daily',
    params: date => ({ calendarDate: date }),
    normalize: wrap((json, ctx) => collect([userSummaryFrom(json, ctx?.date)])),
  },
  {
    id: 'readiness', label: 'Training readiness', group: 'Recovery', kind: 'perDay', experimental: true,
    path: date => `/metrics-service/metrics/trainingreadiness/${date}`,
    normalize: wrap((json, ctx) => {
      // several entries per day (after waking, after training…): keep the latest scored one
      const rows = rowsOf(json).map(r => readinessFrom(r, ctx?.date)).filter(Boolean)
      return collect(rows.slice(-1))
    }),
  },
  {
    id: 'intensity', label: 'Intensity minutes', group: 'Activity', kind: 'range', chunkDays: 27, experimental: true,
    path: (from, to) => `/usersummary-service/stats/im/daily/${from}/${to}`,
    normalize: wrap((json, ctx) => days(json, ['values', 'dailyIntensityMinutes'], intensityFrom, ctx)),
  },
  {
    id: 'heartRate', label: 'Daily heart rate', group: 'Heart', kind: 'perDay',
    path: () => '/wellness-service/wellness/dailyHeartRate',
    params: date => ({ date }),
    normalize: wrap((json, ctx) => collect([heartRateFrom(json, ctx?.date)])),
  },
]

export const ENDPOINT_BY_ID = Object.fromEntries(ENDPOINTS.map(e => [e.id, e]))
export const endpointLabel = id => ENDPOINT_BY_ID[id]?.label || id
