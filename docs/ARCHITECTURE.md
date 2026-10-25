# MK Fitness — v2 architecture contract

This file is the contract between everyone working on the app. If you need to
change a contract (a shape, a route, a token name), say so in your report —
do not silently diverge.

## Stack & rules

- Vite 7 + React 19 + recharts 3 + vite-plugin-pwa. **No new runtime dependencies**
  without a strong reason (state it in your report). No router library, no CSS
  framework, no state library.
- Plain `.jsx`/`.js`. Relative imports with explicit extensions inside `src/lib`,
  `src/data`, `src/state` (so Node can unit-test them). Components may omit `.jsx`.
- Code style: match the existing code — compact, functional components, hooks,
  2-space indent, single quotes, no semicolons. Comments only where non-obvious.
- **All day keys are local `YYYY-MM-DD` strings from `src/lib/dates.js`.** Never use
  `toISOString().slice(0,10)` — it shifts the day in IST.
- UI never reads raw Garmin JSON. Only the normalised shapes in `src/data/schema.js`.
- Every metric shown anywhere goes through the registry in `src/lib/metrics.js`
  (`METRICS[key].label/format/pick/hue/...`). Add a key there rather than
  hard-coding a label.
- Copy tone: plain, calm, sentence case. Insights are trends, never diagnoses
  ("Your HRV has been below its recent baseline for 4 days", never "you are sick").

## Directory layout

```
src/
  main.jsx                 boot: init store, render <App/>
  App.jsx                  shell: header, bottom nav, route switch, lock gate, toasts
  lib/                     pure helpers (dates, format, stats, csv, metrics, prefs, insights)
  data/                    schema, db (IndexedDB), merge, normalize, migrate, demo, select, portable
  state/store.js           central store + actions (useStore / actions / getState)
  sync/                    garmin.js (HTTP), endpoints.js (registry), engine.js (orchestrator)
  router.js                hash router: useRoute(), navigate(), href()
  components/              shared UI kit (see "UI kit" below)
  charts/                  recharts wrappers (TrendChart, Sparkline, StackedBars, ...)
  pages/                   one file per route (+ pages/reports/*)
  styles/                  tokens.css, base.css, components.css, + one css file per page area
worker/                    Cloudflare Worker — DO NOT MODIFY
```

## Data flow

```
Garmin ──garmin.js──▶ engine.js ──normalize.js──▶ actions.applyDays / applyActivities
                                                     │ (merge.js: never deletes)
                                                     ▼
                                   store (memory) + IndexedDB (days/activities/meta)
                                                     │
                                  useStore(selector) + data/select.js + lib/stats.js
                                                     ▼
                                                   pages
```

Cached data is always rendered; syncing only merges new values in.

### Store (`src/state/store.js`)

State: `ready, source ('garmin'|'demo'), days, activities, profile, syncMeta, endpoints, sync, log`.
Actions: `init, applyDays, applyActivities, setProfile, setSync, resetSync, setEndpoint,
setSyncMeta, log, importData, clearLocalData, switchSource`. Read the file for details.

`syncMeta = { lastSuccessAt, lastAttemptAt, lastFullAt, lastResult: 'ok'|'partial'|'failed'|'cancelled'|null, lastError, coverage: { first, last } | null }`

`sync` (live progress) = `{ running, mode: 'full'|'incremental'|'retry', phase, done, total, current, startedAt, rateLimitedUntil, message }`
— `done/total` count *requests*, `current` is the endpoint id in flight.

`endpoints[id]` = **EndpointStatus**
```
{ status: 'idle'|'queued'|'running'|'ok'|'empty'|'partial'|'failed'|'unavailable'|'cancelled',
  lastOkAt, lastAttemptAt, error, httpStatus, requests, failedRequests,
  records,            // days/activities written in the last run
  failedRanges,       // [[from,to] | [date,date]] still to retry
  coverage: { first, last } | null }
```
- `empty` = Garmin answered OK with no data ("Garmin has no data for this yet").
- `unavailable` = 401/403/404 — endpoint not exposed to this API key; skip on future
  incremental syncs, keep it listed with that explanation.
- `partial` = some chunks failed; `failedRanges` lists them; "Retry failed" re-runs only those.

### Demo mode

`?demo=1` (or Settings → Data source → Demo) uses a separate IndexedDB (`mk-fitness-demo`)
seeded by `src/data/demo.js` → `generateDemo()` returning `{ days, activities, profile }`
(400 days, realistic correlated values, a few deliberate gaps). The header always shows
a **DEMO DATA** chip in demo mode. Sync is disabled in demo mode (Sync Center explains why).
This is also how the app is screenshot-tested without a Garmin key.

## Sync (`src/sync/`)

- `garmin.js` — HTTP only. `request(path, params, { signal })` → parsed JSON or
  `null` for 204/empty body. Throws `GarminError { status, path, retryAfterMs, kind }`
  with `kind ∈ 'auth'|'not-found'|'rate-limit'|'server'|'network'|'aborted'|'session'`.
  Keeps `tokenFromApiKey`, `session`, `signOut` (token in localStorage; API key never stored).
  Session expiry check uses JWT `exp` if decodable, else the 23 h fallback.
- `endpoints.js` — registry. Each endpoint:
  `{ id, label, group, kind: 'range'|'perDay'|'paged'|'single', path(from,to|date), params?,
     chunkDays?, maxDays?, normalize(json, ctx) → { days?: {date: partial}, activities?: [], profile? },
     experimental?: true }`
- `engine.js` — `startSync('full'|'incremental')`, `retryFailed()`, `retryEndpoint(id)`, `cancelSync()`.
  Sequential requests (one at a time) with a 250 ms gap; on 429 waits `Retry-After`
  (or exponential backoff 2 s → 60 s cap), shows a countdown via `sync.rateLimitedUntil`,
  up to 4 attempts per request; 5xx retried 3×; 401/403/404 → `unavailable` (no retry);
  network error → retry 2× then mark failed. **Writes each chunk to the store as it arrives**
  so progress is visible and a cancel keeps everything fetched so far.
  Incremental window = from `min(lastOkAt per endpoint) − 2 days` (≥ 3 days, ≤ historyDays) to today;
  full = `prefs.historyDays` for range endpoints, `prefs.perDayDays` for per-day endpoints.
  Auth/session failure aborts the whole run with a clear "Reconnect Garmin" message.

### Endpoint list

Known (already used by v1): profile settings, activities (paged), daily steps (range),
daily stress (range), body battery reports (range), sleep summaries (range) with per-day
fallback, HRV (range), weight (range).

**Experimental** (Garmin Connect API paths; may be unavailable to Personal API keys —
must degrade to `unavailable` without breaking anything): daily user summary
(`/usersummary-service/usersummary/daily?calendarDate=`, per-day: resting HR, intensity
minutes, stress buckets, BB charged/drained), training readiness
(`/metrics-service/metrics/trainingreadiness/{date}`), daily intensity minutes
(`/usersummary-service/stats/im/daily/{from}/{to}`), daily heart rate
(`/wellness-service/wellness/dailyHeartRate?date=`). Per-day experimental endpoints
are probed for the most recent day first; if that returns `unavailable`, skip the rest.

## Routes (`src/router.js`, hash based — works on GitHub Pages)

| Hash | Page | Owner |
|---|---|---|
| `#/` | Today dashboard | home |
| `#/morning` | Compact morning check | home |
| `#/trends` | Metric index | trends |
| `#/trends/:metric?range=30&g=day&end=YYYY-MM-DD` | Trend page | trends |
| `#/sleep?date=YYYY-MM-DD` | Sleep detail | sleep |
| `#/reports` | Report index | reports |
| `#/reports/:kind?range=30` | stress, body-battery, hrv, steps, heart-rate, recovery | reports |
| `#/reports/activities`, `#/reports/training-load` | Activities + training load reports | activities |
| `#/reports/sleep` | redirects to `#/sleep` (the Sleep page *is* the sleep report) | shell |
| `#/activities` | Activity list | activities |
| `#/activities/:id` | Activity detail | activities |
| `#/insights` | Insights | insights |
| `#/sync` | Sync Center | sync |
| `#/settings` | Settings, privacy, export/import, lock | portability |

`useRoute()` → `{ path, segments, params }`; `navigate(hash)`; `href(path, params)` builds `#/...?...`.
Bottom nav (mobile) / top nav (≥ 900px): **Today · Trends · Sleep · Reports · More** (More → Insights, Activities, Sync, Settings).

## Design system

Brand: keep v1's identity — mint `#20c997` accent, dark teal-black night theme, Space Grotesk
for headings/values, DM Mono for small labels/eyebrows. Body/UI text may use system-ui for
legibility. Themes: `night` (default), `day`, `color` (violet accent), `auto` (follows OS).
Theme is a `data-theme` attribute on `<html>`; all colours are CSS custom properties in
`src/styles/tokens.css`. **Never hard-code a hex in a component or page CSS** — use tokens.

Token names (defined per theme):
```
--bg  --surface  --surface-2  --surface-hover  --border  --border-strong
--text  --text-2  --text-3          (primary / secondary / muted)
--accent  --accent-ink  --accent-soft  (accent fill, text on accent, 12% wash)
--good  --warning  --serious  --critical   (status — always paired with icon + label)
--hue-sleep --hue-stress --hue-battery --hue-steps --hue-intensity --hue-readiness --hue-hrv --hue-heart
--stage-deep --stage-light --stage-rem --stage-awake
--stress-rest --stress-low --stress-medium --stress-high
--grid  --radius  --radius-sm  --shadow  --safe-top --safe-bottom
--font-display  --font-mono  --font-ui
```

Validated chart palettes (dataviz validator, all three surfaces — do not change without re-validating):
- Sleep stages, fixed order deep→light→REM→awake:
  dark/color `#3987e5 #199e70 #9085e9 #d95926` · day `#2a78d6 #1baf7a #4a3aa7 #eb6834`
- Stress ordinal rest→high: dark `#1c5cab #3987e5 #6da7ec #b7d3f6` · day `#86b6ef #3987e5 #256abf #104281`
- Status: good `#0ca30c` warning `#fab219` serious `#ec835a` critical `#d03b3b`

Chart rules (from the dataviz method — apply everywhere):
- Lines 2px, round caps; area fill = series hue at ~10% opacity; bars ≤ 24px thick, 4px
  rounded top, square base; 2px surface-colour gap between stacked segments.
- Gridlines: hairline, solid, `var(--grid)`, horizontal only. No dashed grid.
  Dashed is allowed only for a reference line (goal, baseline) — label it.
- One y-axis per chart. Never dual-axis. Two measures → two charts.
- Single-series charts: no legend box (title names it). ≥ 2 series: legend + direct labels.
- Text never wears the series colour — values/labels use text tokens; a coloured dot/line
  key beside the text carries identity.
- Tooltip on every chart (crosshair on line/area, per-bar on bars); value bold, label secondary.
- Missing days render as gaps (`connectNulls={false}`), and the summary shows "n days missing".
- Every chart has a table view or the numbers available elsewhere on the page.
- Refetch/sync never blanks a chart — keep the previous render.

Mobile (iPhone PWA is the primary target):
- Bottom nav fixed, honours `env(safe-area-inset-bottom)`; header honours `safe-area-inset-top`.
- Touch targets ≥ 44px. Cards full-width on phones, 2–4 columns on wider screens.
- `viewport-fit=cover`, `apple-mobile-web-app-status-bar-style=black-translucent`.
- Respect `prefers-reduced-motion`.

## UI kit (`src/components/`, owned by the shell agent — others import, don't fork)

`Card` (`{ title?, subtitle?, action?, href?, onClick?, className?, children }`),
`StatTile` (`{ metricKey, value, sub?, delta?, deltaKey?, spark?, href?, band? }`),
`Sparkline` (in `src/charts/`, `{ data: [{date,value}], hue, height=36 }`),
`Ring` (`{ value, max=100, hue, size, label }`), `Meter` (`{ value, max, hue, label }`),
`RangeTabs` (`{ value, options:[7,30,60,120,365], onChange }`), `Segmented` (`{ value, options:[{value,label}], onChange }`),
`DateStepper` (`{ date, onChange, min, max }` ← → buttons + label),
`Empty` (`{ icon?, title, body?, action? }`), `Badge`/`StatusPill` (`{ tone, children }`),
`Button` (`{ variant: 'primary'|'secondary'|'ghost'|'danger', size, ...props }`),
`Sheet` (bottom sheet / modal), `ConfirmDialog` (`{ title, body, confirmLabel, tone, onConfirm, onCancel }`),
`Toast` via `toast(msg, { tone })` from `src/components/toast.js`,
`PageHeader` (`{ title, subtitle?, back?, actions? }`), `SectionTitle`, `KeyValue` rows,
`DataTable` (`{ columns, rows, maxRows? }`), `PullToRefresh` (`{ onRefresh, children }`),
`MissingNote` (`{ missing, total }` → "3 of 30 days missing").

Charts (`src/charts/`): `TrendChart` (`{ data, metricKey, kind: 'line'|'area'|'bar', goal?, baseline?, height }`),
`StackedBars` (`{ data, series:[{key,label,color}], height, format? }`), `Sparkline`.

## File ownership (parallel phase)

| Agent | Owns (create/modify) |
|---|---|
| sync | `src/sync/**`, `src/data/normalize.js`, `src/data/migrate.js`, `src/pages/SyncCenter.jsx`, `src/styles/sync.css`, `scripts/test-data.mjs` |
| shell | `index.html`, `src/main.jsx`, `src/App.jsx`, `src/router.js`, `src/components/**` (except LockScreen), `src/charts/**`, `src/styles/{tokens,base,components}.css`, `src/data/demo.js`, `vite.config.js`, `public/**`, `scripts/make-icons.mjs`, `src/pages/{Placeholder,Connect}.jsx` |
| home | `src/pages/Today.jsx`, `src/pages/Morning.jsx`, `src/styles/home.css` |
| trends | `src/pages/Trends.jsx`, `src/pages/TrendDetail.jsx`, `src/styles/trends.css` |
| sleep | `src/pages/Sleep.jsx`, `src/styles/sleep.css` |
| reports | `src/pages/Reports.jsx`, `src/pages/reports/{ReportLayout,Stress,BodyBattery,Hrv,HeartRate,Steps,Recovery}.jsx`, `src/styles/reports.css` |
| activities | `src/pages/reports/{ActivitiesReport,TrainingLoad}.jsx`, `src/pages/Activities.jsx`, `src/pages/ActivityDetail.jsx`, `src/styles/activities.css` |
| insights | `src/lib/insights.js`, `src/pages/Insights.jsx`, `src/styles/insights.css` |
| portability | `src/pages/Settings.jsx`, `src/data/portable.js`, `src/lib/lock.js`, `src/components/LockScreen.jsx`, `src/styles/settings.css` |

Shared files owned by the lead (`src/lib/{dates,format,stats,csv,metrics,prefs}.js`,
`src/data/{schema,db,merge,select}.js`, `src/state/store.js`, this doc): if you need a
change, make the **smallest additive** edit (new export, new metric key) and list it in
your report. Never rename or remove an existing export.

Each page file default-exports its page component and imports its own CSS file
(`import '../styles/sleep.css'`).

## Stubs (created by shell in phase 1, replaced by owners in phase 2)

Shell creates every page file in the route table as a stub that default-exports
`<Placeholder title="…"/>`, so `App.jsx` can wire every route with `React.lazy`
from day one. Owners overwrite their stub. Also stubbed, with this exact contract:

- `src/lib/lock.js` → `export function useLockState()` returning `{ locked, unlock(), lock() }`
  (stub: never locked). Handles auto-lock after `prefs.lockAfterMin` in the background.
- `src/components/LockScreen.jsx` → `export default function LockScreen({ onUnlock })` (stub: renders null).
- `src/lib/insights.js` → `computeInsights(days, activities, opts)` (already stubbed, returns []).
- `src/sync/engine.js` exports used by the UI: `startSync(mode)`, `retryFailed()`, `retryEndpoint(id)`,
  `cancelSync()`, `maybeAutoSync()`; `src/sync/garmin.js` exports `session()`, `isSessionValid()`,
  `tokenFromApiKey(key)`, `signOut()`. (Written by the sync agent in phase 1.)

`src/components/ConnectForm.jsx` (shell) — API-key form used by the Connect screen and by
the Sync Center / session-expired flow. Props: `{ onConnected }`.

## Connection model

- No session **and** no cached data **and** not demo → full-screen Connect page
  (with an "Explore with demo data" link).
- Otherwise the app always renders cached data. An expired/missing session shows a
  slim banner "Garmin session expired — reconnect to sync" linking to `#/sync`.
- Every route is wrapped in an error boundary: a crashing page shows an error card, not a white screen.

## Verifying your work

- Unit tests: `node scripts/test-lib.mjs` (shared libs), plus your own `scripts/test-*.mjs`.
- Build without clobbering others: `npx vite build --outDir /tmp/mkfit/build-<you> --emptyOutDir`.
- Screenshots (demo data, no key needed):
  `SHOT_NAME=<you> node scripts/shot.mjs /tmp/mkfit/shots-<you> '#/sleep' '#/sleep@day' '#/sleep@color' '#/sleep@desktop'`
  then **open the PNGs with the Read tool and look at them**. Fix overlaps, clipping, empty
  states, contrast, and anything that looks unfinished. Console errors are printed per route.
