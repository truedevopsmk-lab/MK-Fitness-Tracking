# Development guide

## Setup

Requirements: **Node 20+** (CI uses 20; developed on 25), npm, and **Google Chrome** (only for the
screenshot / e2e scripts).

```bash
git clone https://github.com/truedevopsmk-lab/MK-Fitness-Tracking.git
cd MK-Fitness-Tracking
npm install
npm run dev
```

Open the URL Vite prints (default `http://localhost:5173/unified-pwa/`).

- **Demo data:** add `?demo=1` (or tap "Explore with demo data"). Uses its own IndexedDB
  (`mk-fitness-demo`), so real data is never touched. Leave demo mode from Settings → Data source.
- **Real data:** paste a Garmin Personal API key (Garmin Connect → Account → Personal API access).
  In dev the Vite proxy forwards `/garmin-api/*` to Garmin, so the Worker isn't involved.

There are no required environment variables for local development. `.env.example` lists the two
build-time variables (`VITE_GARMIN_API_BASE`, `VITE_BASE_PATH`) used by the Pages build.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server with HMR and the Garmin proxy |
| `npm run build` | production build into `dist/` (don't commit `dist/`) |
| `npm run preview` | serve the production build locally |
| `npm test` | all Node unit tests (`scripts/test-*.mjs`, plain `node:assert`, no framework) |
| `npm run test:e2e` | PIN-lock flow in Chrome (`scripts/test-lock-e2e.mjs`) |
| `npm run shots -- <outDir> <routes…>` | screenshots (see below) |
| `npm run icons` | regenerate `public/*.png` from `public/icon.svg` |

### Tests

Each `scripts/test-<area>.mjs` imports pure modules directly with Node — that's why files in
`src/lib`, `src/data`, `src/state`, `src/sync` (and `pages/*Logic.js`) use explicit `.js` import
extensions and guard `import.meta.env` access.

| Test file | Covers |
|---|---|
| `test-lib.mjs` | dates (incl. month boundaries, timezones), stats, merge, format, csv |
| `test-data.mjs` | normalisers against Garmin-shaped fixtures, engine planning/backoff/full runs with fakes, migration |
| `test-home.mjs` | recovery estimate, week grid, deltas |
| `test-trends.mjs` | trend windows, granularity defaults, previous-window alignment, CSV |
| `test-sleep.mjs` | sleep debt, bedtime consistency across midnight, stage maths |
| `test-insights.mjs` | every detector: fires / stays silent / sample-size guards; demo run |
| `test-portable.mjs` | export → import round trip, rejects junk, no secrets in exports |
| `test-activities.mjs` | type grouping, pace/speed, training effect, load series |
| `test-name.mjs` | greeting name rules (Garmin UUIDs rejected) |

Run one file: `node scripts/test-sleep.mjs`. Timezone bugs are the classic failure here — run date
tests under another zone too: `TZ=America/Los_Angeles node scripts/test-lib.mjs`.

**Adding a test file:** create `scripts/test-<name>.mjs`, print a final "… passed" line, and add
`<name>` to the loop in the `test` script in `package.json`.

### Screenshots (`scripts/shot.mjs`)

```bash
node scripts/shot.mjs /tmp/shots '#/' '#/sleep@day' '#/reports/hrv@color' '#/trends/steps@desktop' '#/insights@empty'
```

| Flag | Effect |
|---|---|
| *(none)* | iPhone 390×844 @2x, night theme, demo data |
| `@day` `@color` | theme |
| `@desktop` | 1280×900 |
| `@empty` | real (empty) database with a fake session — checks empty states |
| `@real` | no demo data, no session — shows the Connect screen |

It prints console errors per route and exits 1 if a page threw. The script grows the viewport to
the page height before capturing (full-page capture makes recharts re-layout and draw blank charts).
Long PNGs: crop before viewing. Set `SHOT_NAME=<name>` to give parallel runs separate Vite caches.

`scripts/chartcheck.mjs "$PWD" '<route>' …` prints rendered marks per chart (`30b/0l` = 30 bars,
0 lines). `0b/0l` means a chart drew nothing (scatter dots aren't counted).

Browser scripts use `scripts/browser.mjs` → `playwright-core` (devDependency) driving installed
Chrome. Without Chrome: `npx playwright-core install chromium` and run with `CHROME_CHANNEL=chromium`.

### UI kit gallery

`#/__kit` (dev server only) renders every component and chart with demo data — the quickest way to
see how a component looks in all themes.

## Conventions

- **Style:** compact functional React, hooks, 2-space indent, single quotes, no semicolons. Comments
  explain *why*, only where non-obvious.
- **State:** read with `useStore(selector)` (selector returns an existing reference or primitive),
  derive with `useMemo`, write via `actions.*`.
- **Dates:** only `src/lib/dates.js` (`today()`, `addDays()`, `dayOf()`, …).
- **Metrics:** only through `src/lib/metrics.js`.
- **CSS:** each page imports its own `styles/<area>.css`; colours only via tokens; prefer existing
  classes in `components.css`.
- **Copy:** sentence case, plain language, units with a space (`58 ms`, `64 bpm`), durations
  `7h 05m`, en-IN number formatting. Empty states say what to do next.
- **Pure logic** that a page needs goes in `src/lib/*.js` or `pages/<Page>Logic.js` with a test.

## Debugging

- **Sync problems:** Sync Center shows per-endpoint status, HTTP status, error text and a log.
  Endpoint statuses and the log are persisted in IndexedDB `meta`.
- **Inspect data:** DevTools → Application → IndexedDB → `garmin-personal-dashboard` → `days`.
  Or in the console: `(await import('/unified-pwa/src/state/store.js')).getState().days`.
- **Reset everything:** Settings → Danger zone → Clear local data (keeps the session), or clear site
  data in DevTools. Demo data regenerates automatically when its database is empty.
- **"It still shows the old version" on iPhone:** close the app fully and reopen once (service worker
  update).
- **A chart is blank in a screenshot but fine in the app:** you used Playwright `fullPage: true`;
  use `scripts/shot.mjs`.
