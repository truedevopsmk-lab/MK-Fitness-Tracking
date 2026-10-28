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
| `profile` | `/userprofile-service/userprofile/settings` | single | known | display name, time zone, step goal, sleep need |
| `activities` | `/activitylist-service/activities/search/activities?start=&limit=` | paged (100) | known | activity summaries |
| `steps` | `/usersummary-service/stats/steps/daily/{from}/{to}` | range 27d | known | daily steps, goal, distance |
| `stress` | `/usersummary-service/stats/stress/daily/{from}/{to}` | range 27d | known | avg/max stress, time per level |
| `bodyBattery` | `/wellness-service/wellness/bodyBattery/reports/daily?startDate=&endDate=` | range 27d | known | samples → start/end/high/low/charged/drained |
| `sleep` | `/sleep-service/sleep/dailySleepSummariesByDate?startDate=&endDate=` (fallback `/sleep-service/sleep/dailySleep?date=`) | range 27d + per-day fallback | known | score, stages, times, overnight HR/HRV/SpO2 |
| `hrv` | `/hrv-service/hrv/daily/{from}/{to}` | range 27d | known | last night, weekly avg, status, balanced range |
| `weight` | `/weight-service/weight/range/{from}/{to}` | range 27d | known | weight (grams or kg) |
| `userSummary` | `/usersummary-service/usersummary/daily?calendarDate=` | per-day | **experimental** | resting HR, intensity minutes, stress buckets, BB charged/drained |
| `readiness` | `/metrics-service/metrics/trainingreadiness/{date}` | per-day | **experimental** | training readiness score/level |
| `intensity` | `/usersummary-service/stats/im/daily/{from}/{to}` | range 27d | **experimental** | moderate/vigorous minutes |
| `heartRate` | `/wellness-service/wellness/dailyHeartRate?date=` | per-day | **experimental** | resting/min/max HR |

"Known" = used successfully by v1. "Experimental" = Garmin Connect paths that may not be exposed to
Personal API keys; the engine marks them `unavailable` on 401/403/404 and keeps going.

**Observed on the owner's account (Oct 2026):** the Today hero shows "Recovery estimate", i.e. the
`readiness` endpoint returned no usable data. Check the Sync Center endpoint list to see whether it
is `unavailable` (not offered) or `empty`, and record the result here.

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
- **Weight** may be grams (> 1000) or kg.
- **Profile `displayName` is often a UUID** (e.g. `e0399703-3ad1-…`), not a name. `lib/name.js`
  ignores ID-like values; users set a local name in Settings → Profile.
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

### Findings

_Not yet run against the owner's key._ Paste the report summary here after the first run: which
Check-items in `ROADMAP.md` (sleep sub-scores and need, readiness, respiration, SpO₂, training
status, VO₂ max, race predictions, splits, HR zones, strength sets, gear) are available.

## Rate limits

Garmin returns **429** when called too fast. The engine runs requests sequentially (250 ms gap),
honours `Retry-After`, otherwise backs off 2 s → 60 s, and slows to 1 s gaps for the rest of the run.
A full sync of 365 days is roughly 120–200 requests (range endpoints in 27-day chunks + per-day
endpoints for `prefs.perDayDays`). Keep new endpoints range-based where possible.

## Adding an endpoint

See [RECIPES.md § 2](RECIPES.md#2-add-a-garmin-endpoint-new-data). Capture a real response first
(DevTools → Network on a local sync, or `curl` with the Bearer token through the Vite proxy),
strip personal values, and turn it into a fixture in `scripts/test-data.mjs`.
