# Architecture

How MK Fitness is put together. For step-by-step changes see [RECIPES.md](RECIPES.md); for the
reasons behind the choices see [DECISIONS.md](DECISIONS.md).

## Big picture

```
 iPhone / browser (static PWA from GitHub Pages)                 Cloudflare            Garmin
┌──────────────────────────────────────────────────────────┐   ┌───────────┐   ┌──────────────────┐
│ pages ── useStore ── store.js ◀── engine.js ── garmin.js ─┼──▶│  Worker   │──▶│ personal.connect │
│   │                    │            │    normalize.js     │   │ (CORS     │   │ api.garmin.com   │
│   │                    ▼            ▼                     │   │  proxy)   │   └──────────────────┘
│   └── lib/* ◀──── IndexedDB (days, activities, journal, meta)      │   └───────────┘
│        (stats, metrics, insights)   localStorage (prefs, token, lock)
└──────────────────────────────────────────────────────────┘
```

- **No backend.** GitHub Pages serves static files. Garmin blocks browser requests (no CORS), so all
  Garmin calls go through `worker/garmin-proxy.js`, which forwards the request and adds CORS headers.
  In development Vite's proxy (`/garmin-api` in `vite.config.js`) does the same job.
- **Local-first.** Everything is cached in IndexedDB; the app renders cached data immediately and a
  sync only merges new values in. It works offline (service worker caches the app shell).
- **Demo mode** (`?demo=1`) uses a separate database seeded with generated data, so the app can be
  developed and screenshot-tested without a Garmin key.

## Directory layout

```
src/
  main.jsx               boot: apply theme, await actions.init(), render <App/>
  App.jsx                shell: header, nav (bottom on phones / top ≥900px), route switch, lock gate,
                         connect gate, pull-to-refresh, auto-sync on open, not-found page
  router.js              hash router: useRoute(), navigate(), href(), setParams()
  state/store.js         the single app store + actions (no library)
  sync/
    garmin.js            HTTP client: token exchange, session, request(), GarminError
    endpoints.js         registry of Garmin endpoints (path, kind, chunking, normalize)
    engine.js            sync orchestrator: plan → run sequentially → merge → status
    probe.js             Garmin capability check (Sync Center): status + field names only
  data/
    schema.js            JSDoc typedefs of the normalised data model (the contract)
    normalize.js         Garmin JSON → schema shapes (defensive; never throws)
    merge.js             merge rules (null never overwrites; nothing is deleted)
    db.js                IndexedDB wrapper (real + demo databases)
    select.js            read helpers over the day map (latestValue, metricSeries, …)
    migrate.js           one-time import of v1 cached data
    portable.js          JSON export/import + CSV builders
    demo.js              deterministic 400-day demo data generator
  lib/
    dates.js             local day-key helpers (the only date code to use)
    format.js            number / duration / date formatting (en-IN)
    stats.js             mean, bucketing, summaries, rolling baseline, correlation
    metrics.js           METRIC REGISTRY + sleep-stage / stress-level palettes + delta rules
    insights.js          personal insight detectors
    homeLogic.js         Today/Morning logic (recovery estimate + breakdown, week grid, deltas)
    effort.js            effort score: training load + everyday steps against your own 28-day usual; daily target from recovery
    resilience.js        14-day recovery vs 14-day effort: a four-state balance, change vs the 14 days before, next-day bounce after hard days
    timeline.js          one day's window (opens at last night's bedtime): sleep and workout segments, gap-broken HR and Body Battery, stats, hourly rows, events
    health.js            health monitor: overnight vitals against your own 30-night normal range
    activities.js        activity helpers (type groups, pace, training effect, load)
    name.js              greeting-name resolution (local override, ignores Garmin UUIDs)
    prefs.js             UI preferences in localStorage + usePrefs()
    lock.js              optional Face ID / PIN app lock
    csv.js               CSV + file download helpers
  components/            UI kit (Card, StatTile, Ring, Sheet, RangeTabs, …) — see "UI kit"
  charts/                TrendChart, StackedBars, Sparkline, chartTheme, ChartParts
  pages/                 one file per route; pages/reports/* for the report pages
                         *Logic.js next to a page = its pure, unit-tested logic
  styles/                tokens.css (all colours) · base.css · components.css · one css per page area
scripts/                 Node tests (test-*.mjs), screenshot + chart tools, icon generator
worker/                  Cloudflare Worker (Garmin proxy) — rarely changes
public/                  icons
```

## Data model (`src/data/schema.js`)

Everything is keyed by **local calendar day** (`'YYYY-MM-DD'`, see `lib/dates.js`).

- **DayRecord** — one per day, made of optional sections, each optional field possibly `null`:
  `steps`, `stress`, `bodyBattery`, `sleep`, `hrv`, `heartRate`, `respiration`, `movement`,
  `intensity`, `readiness`, `weight`, `training` (derived from that day's activities, never fetched).
- **JournalEntry** — `{ date, tags, updatedAt }`, entered by the user and kept in its own `journal` store.
  Never part of a DayRecord and never touched by sync. `tags: []` means "checked in, nothing to tag".
  `heartRate.samples` is intraday HR in 10-minute buckets (`[bucketTs, bpm]`, only with ≥ 2 buckets);
  `sleep.subScores` holds Garmin's per-component sleep qualifiers (duration, stress, awakenings,
  restlessness, rem, light, deep), shown on the Sleep page through `pages/sleepLogic.js`
  (`subScoreRows`, `subScoreSummary`, `subScoreTally`). The sleep coach (`sleepCoach` → bank,
  usual wake, time-awake buffer, `tonightPlan`) is also there and feeds Sleep and Today. Demo data mirrors a Personal API key (no
  readiness, no SpO2, no sleep-time HR/HRV) except the hypnogram, which is kept so the timeline chart
  stays exercised.
- **Activity** — normalised activity summary (`id`, `type`, `day`, `startTs`, durations, distance,
  HR, training load/effect, HR zones, `raw` = original Garmin JSON for the detail page).
- **Profile** — `displayName`, `fullName`, `timeZone`, `stepGoal`, `sleepNeedSec`.

Conventions: durations in seconds (`…Sec`), distances in metres (`…M`), instants as epoch ms (`…Ts`).
**Sleep belongs to the day you woke up** (Garmin's `calendarDate` convention), so "stress on the day
after a poor night" is the *same* record as that night.

## Store (`src/state/store.js`)

One plain object with subscribers; read with `useStore(selector)`, write only through `actions`.

| State | Meaning |
|---|---|
| `ready` | cached data loaded |
| `source` | `'garmin'` or `'demo'` (header shows a DEMO chip) |
| `days` | `{ 'YYYY-MM-DD': DayRecord }` |
| `activities` | `Activity[]`, newest first |
| `journal` | `{ 'YYYY-MM-DD': JournalEntry }` — user-entered tags, never synced |
| `profile` | `Profile` |
| `syncMeta` | `{ lastSuccessAt, lastAttemptAt, lastFullAt, lastResult, lastError, coverage }` |
| `endpoints` | `{ [endpointId]: EndpointStatus }` (see Sync) |
| `sync` | live progress `{ running, mode, phase, done, total, current, rateLimitedUntil, message }` |
| `log` | last 200 sync log lines |

Actions: `init`, `applyDays`, `applyActivities`, `setProfile`, `setJournal`, `toggleTag`, `clearJournalDay`, `applyJournal`, `setSync`, `resetSync`, `setEndpoint`,
`setSyncMeta`, `log`, `importData`, `clearLocalData`, `switchSource`.

> **Selector rule:** a selector must return an existing reference or a primitive
> (`useStore(s => s.days)`). Building a new object/array inside it re-renders forever.
> Derive with `useMemo` instead.

## Persistence

| Where | Key | What |
|---|---|---|
| IndexedDB `garmin-personal-dashboard` (v3) | store `days` (keyPath `date`) | DayRecords |
| | store `activities` (keyPath `id`) | Activities |
| | store `journal` (keyPath `date`) | JournalEntries (user-entered tags) |
| | store `meta` | `profile`, `syncMeta`, `endpoints`, `log`, `demoJournal` |
| | store `data` | legacy v1 blobs — migrated then cleared by `migrate.js` |
| IndexedDB `mk-fitness-demo` | same stores | demo data only |
| localStorage | `garmin_dashboard_session` | `{ accessToken, expiresAt }` — the API key itself is never stored |
| | `mk_fitness_prefs` | UI preferences (`lib/prefs.js` `DEFAULT_PREFS`) incl. local `displayName`, `sleepNeedHours`, `wakeTime` (minutes after midnight, `null` = usual) |
| | `mk_fitness_source` | `'garmin'` / `'demo'` |
| | `mk_fitness_lock`, `mk_fitness_lock_fails` | lock credential id or salted PIN hash; wrong-PIN throttle |
| | `mk_fitness_theme` | legacy v1 theme (read once into prefs) |

To change the data model: add optional fields (never rename), bump nothing for additive changes.
For a breaking change bump `VERSION` in `db.js` and `SCHEMA_VERSION` in `schema.js`, add an upgrade
path, and teach `portable.js parseImport` to accept the old format.

## Sync (`src/sync/`)

**`garmin.js`** — the only code that talks HTTP. `tokenFromApiKey(key)` exchanges the Personal API
key for a JWT (stored with its `exp`); `request(path, params, { signal })` returns parsed JSON, `null`
for empty bodies, or throws `GarminError { status, kind, retryAfterMs }` where `kind` is one of
`auth | not-found | rate-limit | server | network | aborted | session | bad-request`.

**`endpoints.js`** — one entry per Garmin endpoint:
```js
{ id, label, group, kind: 'single' | 'paged' | 'range' | 'perDay', path(), params?, chunkDays?,
  normalize(json, ctx) → { days?: { date: partial }, activities?: [], profile? },
  fallback?: {...},          // e.g. sleep: per-day call when the range call returns nothing
  experimental?: true }      // may not be exposed to Personal API keys
```

**`engine.js`** — `startSync('incremental' | 'full')`, `retryFailed()`, `retryEndpoint(id)`,
`cancelSync()`, `maybeAutoSync()`.
1. `planRequests()` builds an ordered task list. Incremental: from each endpoint's last OK minus 2
   days (≥ 3 days). Full: `prefs.historyDays` for range endpoints, `prefs.perDayDays` for per-day.
   Range and per-day tasks run newest → oldest so useful data lands first.
2. Tasks run **one at a time** with a 250 ms gap (1 s after a rate limit). 429 → wait `Retry-After` or
   exponential backoff (2 s → 60 s) with a countdown in `sync.rateLimitedUntil`; 5xx retried 3×;
   network errors retried 2×; 401/403/404 → endpoint marked `unavailable` (except a 401 on a known
   endpoint before anything succeeded, which means the session is bad and aborts the run).
3. Each response is normalised and **written to the store immediately**, so progress is visible and a
   cancel keeps everything fetched so far. After activities change, `training` is recomputed per day.
4. Four consecutive failures park an endpoint; its remaining ranges go into `failedRanges` for
   "Retry failed".
5. `syncMeta.lastSuccessAt` is set for `ok` **and** `partial` runs; auto-sync is throttled on the last
   attempt too, so a permanently failing endpoint can't trigger a sync on every app open.

**EndpointStatus**: `{ status, lastOkAt, lastAttemptAt, error, httpStatus, requests, failedRequests,
records, failedRanges, coverage }` with `status` ∈ `idle | queued | running | ok | empty | partial |
failed | unavailable | cancelled`. `empty` = Garmin answered with no data ("Garmin has no data for this
yet"); `unavailable` = not offered to this API key (skipped on incremental syncs, retried on full).

**`probe.js`** — the capability check behind Sync Center → "What your Garmin key allows". `PROBES`
lists candidate endpoints (URL templates with `{date}`, `{weekAgo}`, `{monthAgo}`, `{displayName}`,
`{profileId}`, `{activityId}`); `runProbes()` calls each once, sequentially (400 ms gap, one 429
retry, stops after 3 rate limits or a session 401), and keeps per probe only `{ status, http, ms,
shape, extra, note }` with `status` ∈ `ok | empty | unavailable | error | limited | skipped`.
`shapeOf()` reduces JSON to field names and types (`{sleepScores:{overall:{value:num}}}`), redacting
keys that look like dates, numbers, UUIDs or emails. Template values captured along the way
(display name, profile number, activity ID) live only in the run's `ctx` and never reach results,
notes or the report; error notes are fixed copy because `GarminError.message` can embed the filled
path. `buildReport()` prints templates, not filled paths. Its own tiny store (`probeState`,
`subscribeProbe`, `startProbe`, `cancelProbe`) is in memory only — nothing is persisted.
Tests: `scripts/test-probe.mjs` (includes sentinel checks that captured values never leak).

## Routing (`src/router.js`, `src/App.jsx`)

Hash routes (work on static hosting): `useRoute()` → `{ path, segments, params }`.

| Hash | Page file |
|---|---|
| `#/` | `pages/Today.jsx` |
| `#/morning` | `pages/Morning.jsx` |
| `#/trends`, `#/trends/:metric?range=&g=&end=` | `pages/Trends.jsx`, `pages/TrendDetail.jsx` |
| `#/sleep?date=&range=` | `pages/Sleep.jsx` (`#/reports/sleep` redirects here) |
| `#/reports`, `#/reports/:kind?range=` (recovery and timeline also `&date=`) | `pages/Reports.jsx`, `pages/reports/*` (map in `App.jsx` `REPORTS`) |
| `#/activities`, `#/activities/:id` | `pages/Activities.jsx`, `pages/ActivityDetail.jsx` |
| `#/journal?date=` | `pages/Journal.jsx` |
| `#/insights` | `pages/Insights.jsx` |
| `#/sync` | `pages/SyncCenter.jsx` |
| `#/settings` | `pages/Settings.jsx` |
| `#/__kit` | `pages/Kit.jsx` — UI kit gallery, **dev only** |
| anything else | not-found page |

Pages are `React.lazy` chunks; recharts loads only with pages that chart. Navigation lists live in
`App.jsx` (`NAV` = bottom/top bar, `MORE` = the More sheet). Every route is wrapped in an
`ErrorBoundary`. Controls that change the view (range, granularity, date) write to the URL with
`navigate(…, { replace: true })` so Back leaves the page instead of undoing each tap.

**Connect gate:** the full-screen Connect page shows only when there is no valid session, no cached
data and not demo mode. Otherwise cached data renders and an expired session shows a slim banner
linking to the Sync Center.

## Metric registry (`src/lib/metrics.js`)

`METRICS[key]` = `{ label, short, unit, pick(day), format(v), axis?(v), agg: 'mean'|'sum',
better: 'up'|'down'|null, hue, domain?, band?(v) → {label, tone}, goal?(day), group, report }`.
Home tiles, trend pages, reports, CSV export, insights and delta chips all read it, so a new key
appears everywhere consistently (Trends lists only keys you have data for, so a key like `spo2`
stays hidden on watches that never record it). Also exported: `SLEEP_STAGES`, `STRESS_LEVELS` (validated palettes),
`isMeaningfulDelta(key, delta)` (noise floor below which a change shows as "Same"), `deltaTone`.

## UI kit (`src/components/`, barrel in `index.js`)

| Component | Use |
|---|---|
| `Card` | surface; `title`, `subtitle`, `action`, `href`/`onClick` (whole card tappable), `flush` |
| `StatTile` | metric tile driven by `metricKey` (label/format/band from registry) + `delta`, `spark`, `href` |
| `DeltaChip` | signed change with tone + arrow (never colour alone); "Same" under the noise floor |
| `Ring`, `Meter` | circular score / progress bar |
| `RangeTabs`, `Segmented`, `DateStepper` | filters (7D…1Y, options, day stepping) |
| `PageHeader`, `SectionTitle`, `KeyValue`, `DataTable`, `MissingNote` | layout + data display |
| `Badge`/`StatusPill`, `Button`, `Empty`, `Icon` | basics (`Icon` is an inline SVG set) |
| `TagChips` | toggle chips for journal tags (check icon when on) |
| `Sheet`, `ConfirmDialog`, `toast()` + `Toaster` | overlays and feedback |
| `PullToRefresh`, `InstallHint`, `ConnectForm`, `ErrorBoundary`, `LockScreen` | app-level |

Charts (`src/charts/`): `TrendChart` (single series: line/area/bar, goal/baseline lines, shaded band,
gaps for missing days), `StackedBars` (stacked columns + legend), `Sparkline` (plain SVG, no recharts).
`pages/reports/ReportLayout.jsx` also exports report building blocks (`ReportLayout`, `useRange`,
`MiniTrend`, `LinesChart`, `StackedColumns`, `WeekdayBars`, `TableView`, `HowToRead`, `ReportNote`) — see
[ROADMAP.md](ROADMAP.md) "chart duplication".

## Design system

- **Brand:** mint accent `#20c997`, dark teal-black night theme, Space Grotesk for headings/values,
  DM Mono for small labels/eyebrows, system UI font for body text.
- **Themes:** `night` (default), `day`, `color` (violet accent), `auto` (follows the OS). Set as
  `data-theme` on `<html>`; all colours are CSS custom properties in `styles/tokens.css`.
- **Token groups:** surfaces (`--bg --surface --surface-2 --surface-hover --border --border-strong`),
  text (`--text --text-2 --text-3`), accent (`--accent --accent-ink --accent-soft --accent-text`),
  status (`--good --warning --serious --critical`), metric hues (`--hue-sleep --hue-stress
  --hue-battery --hue-steps --hue-intensity --hue-readiness --hue-hrv --hue-heart`), chart palettes
  (`--stage-*`, `--stress-*`), layout (`--radius* --shadow* --nav-h --header-h --safe-*`).
- **Validated palettes** (colour-blind checked on all three theme surfaces — re-validate before changing):
  sleep stages deep→light→REM→awake, dark `#3987e5 #199e70 #9085e9 #d95926` / day `#2a78d6 #1baf7a #4a3aa7 #eb6834`;
  stress rest→high, dark `#1c5cab #3987e5 #6da7ec #b7d3f6` / day `#86b6ef #3987e5 #256abf #104281`.
  Use at most 4 hues in one chart.

**Chart rules** (apply to every chart):
- 2px lines, area fill ≈10% opacity, bars ≤ 24px with 4px rounded tops, 2px gap between stacked segments.
- Hairline solid horizontal gridlines only; dashed lines only for labelled reference lines (goal, baseline).
- **One y-axis per chart — never dual-axis.** Two measures → two charts.
- Single series: no legend box (the title names it). Two or more: legend.
- Text uses text tokens, never the series colour.
- Every chart has a tooltip and a table view (or the numbers elsewhere on the page).
- Missing days render as gaps (`connectNulls={false}`) and the page says how many are missing.
- If a shaded band (e.g. HRV balanced range) is drawn, draw the series as a line, not an area.

**Mobile:** bottom nav with safe-area padding, touch targets ≥ 44px (`pointer: coarse`), no
horizontal scroll at 390px, `prefers-reduced-motion` respected.

## PWA

`vite.config.js` (vite-plugin-pwa): manifest with PNG + maskable icons, `autoUpdate` service
worker that precaches the app shell (~1 MB) and caches Google Fonts. **Garmin responses are never
cached by the service worker** — health data lives only in IndexedDB. iOS keeps the previous version
until the app is closed and reopened once after a deploy.

## Security & privacy model

- The API key is used once for the token exchange and never stored or logged.
- The token lives in localStorage; health data in IndexedDB; both stay on the device.
- The app lock (WebAuthn platform authenticator or PIN) keeps casual eyes out; it does **not**
  encrypt data. PINs are stored as salted SHA-256; wrong PINs are throttled (5 free, then 30 s
  doubling to 15 min, persisted).
- The journal stays on the device and is included in JSON exports (additive; export format stays 1).
- Exports contain health data but never the token, sync log or lock settings.
- The Worker forwards any request it receives (it only sets CORS for `ALLOWED_ORIGIN`); Garmin
  still requires the user's token. See [ROADMAP.md](ROADMAP.md) for hardening.
