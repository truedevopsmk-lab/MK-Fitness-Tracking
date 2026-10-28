# Garmin Personal API notes

What we know about the Garmin endpoints this app uses. Garmin doesn't publish full documentation
for the Personal API, so much of this was learned from real responses — **record new findings here.**

## Authentication

1. The user creates a **Personal API key** in Garmin Connect (Account → Personal API access).
2. `POST /personalapitoken-service/personal-api/personal-api-key/token` with header
   `Authorization: ApiKey <key>` returns a JWT — sometimes raw text, sometimes JSON
   (`access_token` / `accessToken` / `token`). `garmin.js tokenFromApiKey()` handles both.
3. All other calls: `Authorization: Bearer <jwt>`. Expiry comes from the JWT `exp`; fallback 23 h.
4. The key is never stored. When the token expires the user reconnects (Sync Center).

Base URL: `https://personal.connectapi.garmin.com`. Browsers can't call it directly (no CORS), so:
dev → Vite proxy `/garmin-api`; production → Cloudflare Worker (`VITE_GARMIN_API_BASE`).

## Endpoints in use (`src/sync/endpoints.js`)

| id | Path | Kind | Status | Gives |
|---|---|---|---|---|
| `profile` | `/userprofile-service/userprofile/settings` | single | known | display name (often a UUID), time zone — **no** step goal or sleep need |
| `activities` | `/activitylist-service/activities/search/activities?start=&limit=` | paged (100) | known | activity summaries; `ownerFullName` → profile `fullName` |
| `steps` | `/usersummary-service/stats/steps/daily/{from}/{to}` | range 27d | known | daily steps, goal, distance |
| `stress` | `/usersummary-service/stats/stress/daily/{from}/{to}` | range 27d | known | avg/max stress, time per level |
| `bodyBattery` | `/wellness-service/wellness/bodyBattery/reports/daily?startDate=&endDate=` | range 27d | known | samples → start/end/high/low/charged/drained |
| `sleep` | `/sleep-service/sleep/dailySleepSummariesByDate?startDate=&endDate=` (fallback `/sleep-service/sleep/dailySleep?date=`) | range 27d + per-day fallback | known | score + sub-scores, stage totals, times, respiration, awake count, sleep stress |
| `hrv` | `/hrv-service/hrv/daily/{from}/{to}` | range 27d | known | last night, weekly avg, status, balanced range |
| `weight` | `/weight-service/weight/range/{from}/{to}` | range 27d | known | weight (grams or kg) |
| `userSummary` | `/usersummary-service/usersummary/daily?calendarDate=` | per-day | known | resting HR (+ 7-day avg), intensity minutes, stress buckets, Body Battery (incl. at wake), respiration, active time, calories |
| `heartRate` | `/wellness-service/wellness/dailyHeartRate?date=` | per-day | known | resting/min/max HR, 7-day resting avg, intraday HR (10-min means) |
| `readiness` | `/metrics-service/metrics/trainingreadiness/{date}` | per-day | **404 on Personal keys** | training readiness score/level |
| `intensity` | `/usersummary-service/stats/im/daily/{from}/{to}` | range 27d | **404 on Personal keys** | moderate/vigorous minutes (`userSummary` has them) |

"Known" = confirmed with a Personal API key (by v1, or by the capability check on 2026-10-28).
`readiness` and `intensity` stay in the list as `experimental: true` in case Garmin opens them up:
the engine marks them `unavailable` on the first 401/403/404, skips them on incremental syncs, and
retries once per full sync.

**What that means:** Personal keys get no training readiness, so the Today hero always shows the
app's own **Recovery estimate** (`lib/homeLogic.js`). They get no sleep need either (not in sleep,
profile or user settings), so `prefs.sleepNeedHours` (Settings → Sleep need) is the only source.

## Response quirks handled in `normalize.js`

- **Shapes vary**: a bare array, or wrapped (`{ dailySleepDTO }`, `{ hrvSummaries: [] }`,
  `{ values: {...} }`, `{ dailySleepSummaries }`, `{ dailySleepDTOList }`). `rowsOf()` unwraps.
- **Date fields vary**: `calendarDate`, `date`, `summaryDate`, `startDate`, `startTimeLocal`. `rowDay()`.
- **Timestamps**: `…GMT` strings have **no `Z`** — treat as UTC (`tsOf()` appends it). `…Local`
  strings already carry the local day (`dayOf()` takes their date part).
- **Sentinels**: stress `-1`/`-2` mean "not enough data" → `null`.
- **Body Battery samples**: `[ts, level]` or `[ts, 'MEASURED', level, version]`. Charged/drained are
  derived from positive/negative deltas when Garmin doesn't send totals. `start` is the first sample
  of the calendar day (≈ midnight), **not** the wake-up level — use `high` for "this morning".
- **Sleep score** lives in one of: `sleepScores.overall.value`, `sleepScores.overallScore`,
  `overallSleepScore`, `sleepScore`. Stages from `sleepLevels` with `activityLevel` 0 deep, 1 light,
  2 REM, 3 awake. Sleep need may be minutes (`sleepNeed.actual`).
- **Sleep on Personal keys** (2026-10-28): rows are flat (no `dailySleepDTO`), `sleepStart/EndTimestampGMT`
  are **epoch-ms numbers**, and there is no `sleepLevels` (no hypnogram), `sleepNeed`, SpO₂,
  overnight HR or HRV. The Sleep page takes resting HR from `heartRate` and HRV from `hrv` instead.
- **Sleep sub-scores**: `sleepScores.{totalDuration, stress, awakeCount, restlessness}` carry only a
  `qualifierKey` and an optimal range; `{rem, light, deep}Percentage` also carry `value` (percent of
  sleep). Stored as `sleep.subScores` (`duration`, `stress`, `awakenings`, `restlessness`, `rem`, `light`, `deep`).
- **Intraday heart rate**: `heartRateValues` is `[ts, bpm]` pairs about 2 min apart (~590 a day,
  bpm may be `null`); column order comes from `heartRateValueDescriptors`. Kept as 10-minute means.
- **Body Battery daily report** has only ~6 samples a day on the owner's account (not 15-minute
  data): fine for high/low/charged/drained, too coarse for a smooth intraday line.
- **Respiration** comes from sleep (`average/lowest/highestRespirationValue`) and `userSummary`
  (`avgWakingRespirationValue`, …). The dedicated respiration and SpO₂ endpoints return 404;
  `userSummary.averageSpo2` is `null` without a pulse-ox reading, so SpO₂ (`sleep.avgSpo2`, registry key
  `spo2`) stays hidden until a value exists.
- **Weight** may be grams (> 1000) or kg.
- **Profile `displayName` is often a UUID** (e.g. `e0399703-3ad1-…`), not a name. `lib/name.js`
  ignores ID-like values; users set a local name in Settings → Profile. The activities list carries
  `ownerFullName`, which the `activities` endpoint stores as `profile.fullName` (on the device only).
- **Sleep summaries range call** sometimes returns nothing; the engine then falls back to per-day
  `dailySleep` (stops after 3 consecutive empty days).
- **Activities**: `activityId` (number) → `id` string; `startTimeGMT` (UTC, no `Z`) → `startTs`;
  HR zones in `hrTimeInZone_1…5`; load in `activityTrainingLoad`.

## Capability check (Sync Center)

Garmin doesn't document which endpoints a Personal API key may call. Sync Center → **Garmin
capabilities** → "Run check" calls each candidate in `src/sync/probe.js` once (~38 requests, under a
minute) and shows Available / No data yet / Not available (401/403/404) / Error per endpoint.
**Copy report** gives a text summary with URL templates, HTTP status and field names/types only —
safe to paste into an issue or a chat. Record findings below and promote useful endpoints into
`endpoints.js` (with a normaliser and a fixture) rather than calling them from pages.

### Findings — owner's key, 2026-10-28

38 checked · 14 available · 23 not available (all 404) · 1 skipped. Re-run after Garmin app
updates; anything that flips to available is worth a normaliser.

**Available:** every in-app endpoint except `readiness` and `intensity`, plus three not yet synced:

- `hrvNight` `/hrv-service/hrv/{date}` — the night's summary plus ~70 individual HRV readings.
- `activity` `/activity-service/activity/{id}` — full summary, incl. min HR, moving speed, recovery HR.
- `details` `/activity-service/activity/{id}/details?maxChartSize=&maxPolylineSize=` — per-sample
  time, distance, speed, HR, cadence, elevation, vertical speed, temperature and lat/lon (14 metrics,
  ~100 rows at `maxChartSize=100`) plus a route polyline.

**Not available (404):** `readiness`, `intensity`; social profile, user settings, last used device;
`dailySleepData` (both paths, so no hypnogram or sleep need); daily RHR stats, respiration, SpO₂,
stress timeline, Body Battery events, hydration; training status, VO₂ max, race predictions,
endurance score, hill score, fitness age, personal records; activity splits, HR time in zones,
exercise sets. **Skipped:** gear — it needs the profile number, which the check now reads from the
sleep/HRV responses, so it runs next time.

What this decides for the coaching plan (`ROADMAP.md`):

| Item | Source on a Personal key |
|---|---|
| A2 Recovery breakdown | Own estimate: sleep vs need (setting), HRV vs baseline, resting HR vs 7-day avg, Body Battery, respiration |
| A3 Health monitor | Resting HR (`heartRate`/`userSummary`), HRV (`hrv`), respiration (sleep + `userSummary`); SpO₂ hidden unless present |
| A5 Sleep sub-scores | Available in the sleep summaries |
| A7 Day timeline | Sleep window, activities, intraday HR, coarse Body Battery; no stress timeline or BB events |
| C4 PRs · C7 Race predictor | Computed from synced activities (`isPR` flags Garmin's PR activities) |
| C5 Splits + route | `details` endpoint; splits computed from distance/time |
| C6 VO₂ max / fitness age · C8 Strength sets | Not available — drop, or estimate clearly labelled |
| C9 Gear mileage | Unknown until the next check; otherwise logged on the device |

## Rate limits

Garmin returns **429** when called too fast. The engine runs requests sequentially (250 ms gap),
honours `Retry-After`, otherwise backs off 2 s → 60 s, and slows to 1 s gaps for the rest of the run.
A full sync of 365 days is roughly 120–200 requests (range endpoints in 27-day chunks + per-day
endpoints for `prefs.perDayDays`). Keep new endpoints range-based where possible.

## Adding an endpoint

See [RECIPES.md § 2](RECIPES.md#2-add-a-garmin-endpoint-new-data). Capture a real response first
(DevTools → Network on a local sync, or `curl` with the Bearer token through the Vite proxy),
strip personal values, and turn it into a fixture in `scripts/test-data.mjs`.
