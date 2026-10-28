# Recipes

Step-by-step guides for the changes you'll make most often. Each ends with the same check:
`npm test`, `npm run build`, then screenshots of the affected routes
(`node scripts/shot.mjs /tmp/shots '<route>' '<route>@day' '<route>@desktop' '<route>@empty'`).

---

## 1. Add a metric (from data you already sync)

Example: show **average respiration** (already stored as `sleep.avgRespiration`).

1. **Registry** — add a key to `METRICS` in `src/lib/metrics.js`:
   ```js
   respiration: { label: 'Respiration', short: 'Breathing', unit: 'br/min',
     pick: d => d.sleep?.avgRespiration, format: v => v == null ? '—' : `${fmtNumber(v, 1)} br/min`,
     axis: v => fmtNumber(v, 0), agg: 'mean', better: null, hue: 'sleep', group: 'Sleep', report: 'sleep' },
   ```
   - `agg: 'sum'` for additive metrics (steps-like totals per week), `'mean'` otherwise.
   - `better: 'up' | 'down' | null` colours deltas; `null` = neither direction is "good".
   - `hue` must be an existing `--hue-*` token. `domain: [0, 100]` only for fixed-scale scores.
   - Optional `band: v => ({ label, tone })` for "Good / Fair / Poor" badges.
2. **Noise floor (optional)** — add the key to `MIN_DELTA` in the same file if small changes are
   noise (e.g. `respiration: 0.5`), so tiles show "Same" instead of `+0.2`.
3. That's it for the basics: it now appears on `#/trends` (grouped by `group`), has a trend page at
   `#/trends/respiration`, is in CSV exports and is available to `StatTile metricKey="respiration"`.
4. **Demo data** — if the field isn't generated yet, add it in `src/data/demo.js` so screenshots show it.

## 2. Add a Garmin endpoint (new data)

Read [GARMIN-API.md](GARMIN-API.md) first.

1. **Schema** — add the new optional fields to the right section in `src/data/schema.js`
   (or a new section on `DayRecord`). Fields are optional and may be `null`.
2. **Normaliser** — add a `<thing>From(row, fallbackDay)` in `src/data/normalize.js`. Rules:
   - Accept every shape variant you've seen (array vs wrapped object, `calendarDate` vs `date`).
   - Use `num()`, `pickNumber()`, `rowDay()`, `tsOf()`; return `null` when there's nothing useful.
   - Never throw. Garmin's "no data" sentinels (`-1`, `-2`) become `null`.
3. **Registry entry** — add to `ENDPOINTS` in `src/sync/endpoints.js`:
   ```js
   { id: 'respirationDaily', label: 'Respiration', group: 'Sleep', kind: 'range', chunkDays: 27, experimental: true,
     path: (from, to) => `/wellness-service/wellness/daily/respiration/${from}/${to}`,
     normalize: wrap((json, ctx) => days(json, ['respirationValues'], respirationFrom, ctx)) },
   ```
   `kind`: `single` (one call), `paged` (`start`/`limit`), `range` (chunked date range, preferred),
   `perDay` (one request per day — slow; keep `prefs.perDayDays` in mind). Mark it `experimental`
   until you've seen it work with a real Personal API key.
4. **Test** — add a fixture-based case to `scripts/test-data.mjs` (realistic JSON + junk variants).
5. **Use it** — add metric keys (recipe 1). The Sync Center lists the endpoint automatically (grouped
   by `group`; add a new group name to `GROUP_ORDER` in `pages/SyncCenter.jsx` if needed).
6. Try a real sync locally (`npm run dev`, Sync Center → Sync latest) and check the endpoint row.

## 3. Add a page

1. Create `src/pages/MyPage.jsx` (default export) and `src/styles/mypage.css` (import it from the page).
   Start from an existing page of similar shape; use `PageHeader`, `Card`, kit components.
2. Register the route in `src/App.jsx`: `const MyPage = page(() => import('./pages/MyPage'))` and a
   line in `Routes` (e.g. `if (a === 'mypage') return <MyPage />`).
3. Navigation: add to `MORE` in `App.jsx` (More sheet) — or `NAV` for a bottom-bar tab (keep it at 5).
4. Handle the three data states: none (`Empty` with a link to `#/sync`), partial (gaps +
   `MissingNote`), stale (say which day a value is from — `whenLabel` in `lib/homeLogic.js`).
5. Put non-trivial logic in `src/pages/MyPageLogic.js` (pure, `.js` imports) + `scripts/test-mypage.mjs`.

## 4. Add a report

1. Create `src/pages/reports/MyReport.jsx` using `ReportLayout` (template: `reports/Steps.jsx`):
   ```jsx
   const [range, setRange] = useRange()
   const { from, to, prevFrom, prevTo } = useMemo(() => rangeBounds(range), [range])
   return <ReportLayout title="…" icon="…" hue="…" subtitle="…" range={range} onRange={setRange}
     hasData={…} csv={csv} missing={{ missing, total }} summary={[{ label, value, sub, tone }]}>
     <Card title="…">{/* TrendChart / StackedBars / MiniTrend */}</Card>
     <HowToRead>Plain-language explanation…</HowToRead>
   </ReportLayout>
   ```
2. Add it to the `REPORTS` map in `src/App.jsx` (key = URL kind, e.g. `'respiration'`).
3. Add a card to the `REPORTS` list in `src/pages/Reports.jsx` (`{ id, title, icon, hue, to, desc, key, label }`).

## 5. Add an insight

1. Write a detector in `src/lib/insights.js`: `function myDetector(days, asOf) → Insight | null`.
   - Enforce a **minimum sample size** and a **minimum effect size**; return `null` otherwise.
   - Wording: "was higher / tends to / after / when". Never causal, never medical advice.
   - Fill every field: `id`, `title` (one sentence), `body` (the numbers), `evidence`
     ("Based on 41 nights in the last 90 days"), `tone`, `metrics`, `href`, `strength` (0–1).
2. Add it to the `detectors` list in `computeInsights()` and describe it in `DETECTORS_INFO`
   (shown on the Insights page under "What we look at").
3. Test in `scripts/test-insights.mjs`: one synthetic dataset that fires, one that must stay silent,
   and the sample-size guard.
4. If it covers a metric in `STANDOUT_KEYS`, the generic "standout of the week" insight is
   suppressed for that metric automatically (no duplicates).

## 6. Add a UI-kit component or chart

- Components go in `src/components/` and are exported from `components/index.js`. Keep props
  backwards compatible — many pages use them. Add it to `pages/Kit.jsx` so it shows in `#/__kit`.
- Charts go in `src/charts/`, read colours via `useChartTheme()` and follow the chart rules in
  [ARCHITECTURE.md](ARCHITECTURE.md#design-system). Use `scripts/chartcheck.mjs` to confirm marks render.

## 7. Add or change a theme colour

1. Edit `src/styles/tokens.css` — define the token in **every** theme block (`night`, `day`, `color`,
   and the `auto` media query).
2. For any categorical colours used together in a chart, re-validate colour-blind separation (the
   sleep-stage and stress palettes were validated with the `dataviz` skill's
   `validate_palette.js`; any OKLab ΔE checker works — target ≥ 8 between adjacent colours).
3. Check text contrast in `day` theme (≥ 4.5:1 for body text).

## 8. Add a setting

1. Add the default to `DEFAULT_PREFS` in `src/lib/prefs.js` (with a comment).
2. Add a `Row` in `src/pages/Settings.jsx` under the right section; write with `setPrefs({ key })`.
3. Read it anywhere with `usePrefs()` (React) or `getPrefs()` (non-React).
Preferences are per device and are not included in data exports.

## 9. Change the data model (breaking)

Additive optional fields need nothing special. For renames/restructures:
1. Bump `VERSION` in `src/data/db.js`, add the upgrade in `onupgradeneeded`, and/or transform records
   in a migration (pattern: `src/data/migrate.js`).
2. Bump `SCHEMA_VERSION` in `src/data/schema.js`; make `parseImport` in `src/data/portable.js`
   accept and convert older exports.
3. Update `docs/ARCHITECTURE.md` and the relevant tests.
