# Handoff — state on 2026-10-30

Any AI tool picking this up: read `CLAUDE.md`, then `docs/ARCHITECTURE.md`, `docs/RECIPES.md` and `docs/DECISIONS.md`.
Then read this file. It holds the next piece's full spec (§3) and the steps that close out every piece (§2).

## 1. Where things stand

- **Branch:** `v2-dashboard-overhaul`, pushed and deployed to GitHub Pages through E1 (see ROADMAP → Done), checked on the live site.
- **`main` has not been merged.** Merging is the owner's call. After merging, remove `v2-dashboard-overhaul` from the
  `github-pages` environment's allowed branches (ROADMAP → Tech debt).

**Done** (details in `docs/ROADMAP.md` → Done):

- v2 overhaul, the Garmin capability check, and Phase 1: A1 Effort, A2 Recovery breakdown, A3 Health monitor, A4 Sleep coach,
  A5 Sleep sub-scores, A6 Resilience and A7 Day timeline.
- Phase 2: B1 Daily tags, B2 Habit impact, B3 Day status and B4 Counters.
- E1 Copy for AI (Sync Center), built at the owner's request.
- F1 Workout lab (`#/lab`): FIT import and analysis, built at the owner's request. Follow-ups in §6.

**Pending, in this order:**

0. **Workout lab follow-ups F2–F7** (§6), if the owner wants more there first.
1. **C1 Fitness / fatigue / form + C2 Training status + C3 Intensity mix 80/20.** Fully designed in §3; no code written yet.
2. **C4 Personal records + C7 Race predictor.** Outline in §4.
3. **C5 Splits + route map**, from the activity `details` endpoint. Needs a normaliser; outline in §4.
4. **C9 Gear mileage** (logged by the user). Outline in §4.
5. **Phase 4:** D1 Weekly review, D2 Goals + streaks, D3 Calendar heatmaps, D7 Share card, D4 Year in review, D5 Compare periods,
   D6 Correlation explorer, D8 Customise Today. Outline in §5.
6. **Undecided:** E2 in-app LLM chat. It sends data off the device, so **ask the owner first.**
   (E1 "Copy for AI" was built on 2026-10-29: Sync Center → "Share with AI", `src/lib/aiSummary.js`.)
7. **Tech debt / hardening:** see the lists in `docs/ROADMAP.md`.

## 2. Steps that close out every piece

1. Write the pure logic in `src/lib/<x>.js` with tests in `scripts/test-<x>.mjs`.
   Add `<x>` to the `for t in …` list in the `test` script in `package.json`.
2. Run `npm test` and `npm run build`. Both must pass.
3. Take screenshots with demo data and **open the PNGs**:
   `node scripts/shot.mjs /tmp/shots '#/reports/<x>' '#/reports/<x>@day' '#/reports/<x>@color' '#/reports/<x>@desktop' '#/reports/<x>@empty' '#/reports'`
   Tall PNGs: crop them into ~1500 px slices before viewing.
4. Update the docs:
   - `ARCHITECTURE.md`: the lib list (~line 58) and the routes table if a route was added.
   - `DECISIONS.md`: a "Health logic" entry explaining any thresholds.
   - `ROADMAP.md`: tick the item and add a Done line ending in `` (`TBD`) ``.
5. Commit, then make a second commit, "Roadmap: record the <X> commit", that replaces `TBD` with the hash.
6. Push and deploy (personal GitHub account):
   ```bash
   gh auth status            # must show truedevopsmk-lab active; if not: gh auth switch -u truedevopsmk-lab
   git -c credential.helper= -c credential.helper='!gh auth git-credential' push origin v2-dashboard-overhaul
   gh workflow run deploy-pages.yml -R truedevopsmk-lab/MK-Fitness-Tracking --ref v2-dashboard-overhaul
   gh run list -R truedevopsmk-lab/MK-Fitness-Tracking --limit 1        # get the run id
   gh run watch <id> -R truedevopsmk-lab/MK-Fitness-Tracking --exit-status
   ```
7. Check the live site:
   - curl `https://truedevopsmk-lab.github.io/MK-Fitness-Tracking/`, find `assets/index-*.js` and fetch it.
   - Grep it and the lazy chunks it names for a new copy string.

Never: commit `.env*`, keys, tokens or `mk-fitness-export-*`; change `worker/`; edit the workflow trigger; add runtime dependencies;
use hex colours outside `src/styles/tokens.css`; build day keys with `toISOString()`.

## 3. Spec — C1 + C2 + C3 (ready to build)

Thresholds below were tested on the 400-day demo data (`generateDemo()`), not guessed.

### 3.1 `src/lib/fitness.js` (pure, `.js` imports)

Input is `dailyLoadMap(days, activities)` from `src/lib/activities.js` (`{ 'YYYY-MM-DD': load }`, Garmin's daily load, else the
sum of activity loads).

```
FIT_DAYS = 42, FAT_DAYS = 7, TREND_DAYS = 14, MIN_HISTORY = 42
BUILD = 10, EASE = -10, DETRAIN = -20          // % change in fitness over 14 days
FRESH = 15, HEAVY = -30                        // form %, the descriptor
FIT_FLOOR = 5                                  // denominator floor for the % change
```

**Formulas:**

- **Fitness:** `kf = 1 − e^(−1/42)`, `f += (load − f) · kf`.
- **Fatigue:** `ka = 1 − e^(−1/7)`, `a += (load − a) · ka`.
- **Running the series:**
  - Both start at 0 on the **first day that has load**.
  - They step through every day to `to` with `eachDay` from `lib/dates.js`. A missing day counts as load 0.
  - Warm up from the first load day even when `from` is later.
- **Form:** `form = f − a`, and `formPct = f > 0 ? form / f × 100 : null`.
- **Change:** `change = (f[t] − f[t−14]) / max(f[t−14], FIT_FLOOR) × 100`.

**Status** (`status`):

| Status | Rule |
|---|---|
| `building` | change ≥ +10 |
| `detraining` | change ≤ −20 |
| `easing` | change ≤ −10 |
| `maintaining` | otherwise |

**Form descriptor** (`formState`):

| Form | Rule |
|---|---|
| `fresh` | formPct > +15 |
| `heavy` | formPct < −30 |
| `balanced` | otherwise |

**History rule:** while fewer than 42 days have passed since the first load day, set `status`/`formState` to `null` and
`reason: 'history'`. Return the number of days so far so the UI can say "builds after 42 days (n so far)".

**Status days** (Journal sick/injured/…) are **not** excluded. Load on those days really was ~0, and fitness describes the
current state, as with Resilience's 14-day windows. Say so in DECISIONS.

**Exports** (follow `src/lib/resilience.js`):

- `fitnessSeries(loadMap, from, to)` returns one row per day:
  `{ date, load, fitness, fatigue, form, formPct, change, status, formState }`.
- `fitnessFor(loadMap, asOf)` returns the last row plus `{ reason, historyDays }`.
- `stateInfo(key)` and `formInfo(key)` look up `Object.hasOwn` maps of `{ short, title, tone, text }`:

| key | short | title | tone | text |
|---|---|---|---|---|
| building | Building | Fitness is building | good | Your 42-day training load is at least 10% higher than two weeks ago. |
| maintaining | Maintaining | Fitness is holding steady | neutral | Your 42-day training load is within 10% of two weeks ago. |
| easing | Easing | Training has eased off | neutral | Your 42-day training load is 10–20% lower than two weeks ago, which is normal in a lighter week. |
| detraining | Detraining | Fitness is dropping | warning | Your 42-day training load is more than 20% lower than two weeks ago. |
| fresh (form) | Fresh | | good | Recent load is well below your usual. |
| balanced (form) | Balanced | | neutral | Recent load is close to your usual. |
| heavy (form) | Heavy load | | warning | Recent load is well above your usual. |

**Copy rule:** trends only. Never write "overtrained", "sick" or "injured". The footer says *"Estimate from Garmin's training load,
not a Garmin number. This is a trend in your own data, not medical advice."*

**Why not a form-based status** (put this in DECISIONS):

- The first rule tried (form % plus a 7-day fitness ramp) changed label 128–139 times in 340 demo days, about every 2.5 days.
- Form labels alone change every 2–3 days (median).
- The 14-day trend rule gave 41 changes in ~344 days: building 85, maintaining 202, easing 44, detraining 13.

**Demo reference values today:** fitness ≈ 22.5, fatigue ≈ 18.5, form ≈ +18%. That reads "Maintaining · Fresh".

### 3.2 Intensity mix (C3), in the same lib

`intensityMix(activities, from, to)` sums `hrZonesSec` (5 numbers, seconds) over activities with `day` in range:

- **Buckets:** easy = zones 1–2, moderate = zone 3, hard = zones 4–5.
- **Returns:** `{ easy, moderate, hard, total, easyPct, n, nAll }`. `n` counts activities with zone data and `nAll` counts all in range.
- **Minimum sample:** `MIN_MIX = 3` activities with zones, else `ready: false`. The UI states the sample: "From 12 workouts with heart rate zones, 6 h 10 min".
- **Weekly series:** `mixWeeks(activities, from, to)` uses `weekKeys` from `lib/activities.js` and returns `[{ date, easy, moderate, hard }]` in seconds.
- **Guide copy:** "A common guide for endurance training is about 80% of time easy." It's a guide, not a target judged good or bad.

**Colours: add new tokens.** Charts resolve `var(--x)` from `:root` (`src/charts/chartTheme.js`), but the existing `--zone-*` tokens
only exist on `.ad, .arep` (`styles/activities.css`), so recharts would get an empty colour.

Add `--mix-easy`, `--mix-moderate` and `--mix-hard` to **all four theme blocks** in `src/styles/tokens.css`: night, day, color,
and the `prefers-color-scheme: light` auto block. These values passed the dataviz ordinal validator (monotone lightness, step
gaps, light end ≥ 2:1 on the surface):

| Theme | easy | moderate | hard |
|---|---|---|---|
| night (surface #0e1b20) | #8d3c48 | #b14351 | #dd4b5b |
| day / auto-light (surface #ffffff) | #d87d89 | #d35a6a | #cc2f45 |
| color (surface #1a1630) | #933950 | #b44155 | #dd4b5b |

**Demo data note:** demo zones skew hard (only 14–16% easy), because `peak = clamp(round((avgHr − 95) / 14), 0, 4)` in
`src/data/demo.js:43`. Changing only that formula (e.g. `(avgHr − 115) / 18`) does not shift any RNG draw. Run `npm test` after
changing it. Optional, but it makes the demo look like a typical easy-heavy plan.

### 3.3 Page `src/pages/reports/Fitness.jsx` → `#/reports/fitness`

**Registration:**

- Add `fitness: page(() => import('./pages/reports/Fitness'))` to the `REPORTS` map in `src/App.jsx`.
- Use `ReportLayout` with `title="Fitness and form"`, `icon="trends"`, `hue="steps"` and
  `subtitle="Long-term load, recent load and how they compare"`.
- Ranges: `ranges={[60, 120, 365]}`, default `useRange(120)`.
- `hasData` = the load map is non-empty.

**Lead card:** copy the `Fortnight` card in `Resilience.jsx`, with classes `rb-card`, `rb-head`, `rb-kind`, `rb-lead`, `rs-text`,
`rp-chips` and `rb-foot`.

- Kind label: "Training status".
- Title and text come from `stateInfo`.
- Neutral badges: `Fitness 23`, `Fatigue 19`, `Form +18% · Fresh`, `14-day change +4%`.
- History state: "Fitness builds after 42 days of training (n so far)".

**Summary stats:** Status, Fitness, Fatigue, Form.

**Cards:**

1. **"Fitness and fatigue"**
   - `LinesChart` with fitness `var(--hue-steps)` and fatigue `var(--hue-heart)`: one y-axis, same units. These colours match
     chronic/acute on Training load.
   - A `TableView` sits below.
2. **"Form"**
   - `MiniTrend` of `formPct`, hue `readiness`, `band={{ low: -30, high: 15, label: 'Balanced' }}`.
   - **Pass an explicit `domain`.** MiniTrend clamps the lower bound to 0 for line charts, and form goes negative. Use
     `niceTicks(Math.min(-40, min), Math.max(30, max), 4).domain` (`niceTicks` is exported from `src/charts/chartTheme.js`).
3. **"Intensity mix"**
   - A horizontal share bar like `.ad-zbar` (`ActivityDetail.jsx`) with a marker at 80%, plus a legend list with the time and %.
   - `StackedColumns` per week (`unit={3600}` for hours), series easy → moderate → hard using `var(--mix-*)`.
   - Below the minimum sample, a `ReportNote`: "Needs 3 workouts with heart rate zones (n so far)".
4. **`HowToRead`**: fitness = 42-day weighted average of daily load; fatigue = 7-day; form = their difference as % of fitness;
   status from the 14-day change; the 80/20 guide; minimum history; estimate, not a Garmin number.

**CSV:** date, load, fitness, fatigue, formPct, status.

**Reports card** (`src/pages/Reports.jsx`, `REPORTS` array, after `load`):

- Entry: `{ id: 'fit', title: 'Fitness and form', icon: 'trends', hue: 'steps', to: '#/reports/fitness', desc: 'Fitness, fatigue, training status and 80/20 mix', custom: 'fit' }`.
- In `useCards()`, add a `custom === 'fit'` branch:
  - `value` = status short; `sub` = `fitness 23 · Fresh`.
  - `series` = last 7 days of fitness.
  - `emptyText` = 'Builds after 42 days of training'.

**Nice to have:** a link from `TrainingLoad.jsx` to the new report. A Today row is optional; skip it unless asked.

**Tests** (`scripts/test-fitness.mjs`):

- 200 days of constant load L: fatigue ≈ L and fitness ≈ L·(1 − e^(−200/42)).
- A load-free gap lowers both.
- Status at the exact boundaries (+10, −10, −20) and the `FIT_FLOOR`.
- History under 42 days.
- Form boundaries (+15, −30).
- Mix shares, with activities without zones counted in `nAll` only, and the `MIN_MIX` gate.
- `stateInfo('nope') === null`.

## 4. Outlines for C4/C7, C5, C9 (not designed in detail; check the data first)

**C4 Personal records + C7 Race predictor** (`src/lib/records.js`, `#/reports/records`)

- **Data available:** activities only have whole-activity fields (`distanceM`, `durationSec`, `movingSec`, `avgSpeed`,
  `elevationGainM`, `trainingLoad`). Until C5 adds splits, a "fastest 5K" can only be the fastest *average pace over a run of at
  least 5 km*. Label it that way.
- **Records:** longest run/ride/walk, longest duration, most elevation, highest load, and best average pace for runs ≥ 5 km and
  ≥ 10 km. Each links to `#/activities/:id`.
- **Predictor:** the Riegel formula `T2 = T1 · (D2 / D1)^1.06`, from the best qualifying run (≥ 5 km) in the last 90 days.
  - Predict 5K, 10K, half and marathon.
  - Hide predictions over ~4× the source distance.
  - Label: "computed on your device, not Garmin's prediction".

**C5 Splits + route map**

- Read `docs/GARMIN-API.md` first for the `details` endpoint shape and whether sync already fetches it.
- **Normaliser:** add it to `src/data/normalize.js`, with a new shape in `src/data/schema.js` (e.g. `{ id, splits: [{ km, sec, avgHr, elevGain }], track: [[lat, lon]] }`).
  Write fixture tests in `scripts/test-data.mjs`.
- **Fetching:** fetch on demand when an activity opens, and store it in IndexedDB without ever deleting.
- **Map:** draw the route as an SVG polyline; downsample it. No map tiles: tiles would send location to a third party and add a dependency.
- **Demo data** gets a synthetic loop. Never use real coordinates in fixtures.

**C9 Gear mileage** (Log)

- **Store:** its own IndexedDB store, like the journal (see DECISIONS "The journal is its own store"). Shape:
  `{ id, name, kind: run|ride, from, startKm, retireKm, retired }`.
- **Assignment:** by type and date by default, with a per-activity override. Mileage = sum of `distanceM`.
- **Export:** include it in JSON export/import (`src/lib/portable.js`), with tests like `test-journal.mjs`.
- Optionally probe Garmin's gear endpoint in the capability check first.

## 5. Phase 4 outlines

| Item | Outline |
|---|---|
| D1 Weekly review | `#/review?week=`: last week against the 4 before (sleep, recovery, effort, load, steps, tags), built from existing libs. |
| D2 Goals + streaks | Local goals (steps, sleep hours, workouts per week) stored like prefs; a streak = consecutive days/weeks met. |
| D3 Calendar heatmaps | A month grid per metric. Use a sequential single-hue ramp and validate it with the dataviz validator. |
| D7 Share card | A PNG rendered to canvas from on-screen numbers, shared via the Web Share API. No upload. |
| D4 Year in review | Totals and bests per year, reusing records (C4). |
| D5 Compare periods | Two ranges side by side, reusing `rangeBounds` and `summarize`. |
| D6 Correlation explorer | `correlation()` exists in `src/lib/stats.js`. Needs a minimum n and "follows, not causes" copy (like Habit impact). |
| D8 Customise Today | Show/hide and order Today rows, stored in prefs. |

## 6. Workout lab (F1 built) and what's left

**What exists (2026-10-30).**

- **Flow:** `src/data/zip.js` → `fit.js` (decoder) → `fitNormalize.js` → `fitImport.js` (dedupe, batches) → store actions
  `addFitBatch` / `getFitSeries` / `fitKnown` / `deleteFitWorkouts` / `ensureDemoFit`.
- **Storage:** IndexedDB v4 stores `fitWorkouts`, `fitSeries` and `fitFiles`. Shapes are in `schema.js` (FitWorkout,
  FitSeries).
- **Analysis:** `src/lib/fitAnalysis.js`. Pages are `pages/Lab.jsx` and `pages/LabWorkout.jsx`; styles are in
  `styles/lab.css`.
- **Tests:** `test-fit`, `test-fitencode`, `test-zip`, `test-fitanalysis`, `test-fitimport`. Thresholds are in
  DECISIONS → "Workout lab".
- **Validation:** checked against Garmin's SDK on the owner's 30 Oct run. Reproduce with `npm i @garmin/fitsdk` in a
  scratch folder, **never in the repo**, because the licence bars redistribution. Expected values:
  - 233 records, 3 laps (7:17, 6:26, 5:26 /km), timer 15:09 of 23:59 elapsed, 5 pauses (8:50)
  - zones from the watch, limits 94/113/132/150/169/188 (% of max 188)
  - recovery HR 158→140 and 174→130
  - workout "Base" with a 7:09–8:42 /km target
- **Personal data:** never commit the owner's FIT/zip files. Tests build synthetic FIT files with `fitEncode.js`, and
  demo GPS is at 0.5°N 0.5°E.

**Next pieces, in order.** Each closes out with the §2 steps.

| # | Piece | Plan |
|---|---|---|
| F2 | Garmin download probe | Add probes to `src/sync/probe.js`: `/download-service/files/activity/{activityId}` (zip of the original FIT) and `/activity-service/activity/{id}/splits`. `request()` parses JSON, so add `requestBytes(path)` in `garmin.js` that returns `arrayBuffer()` and does the same error mapping. The probe keeps only status, content type and size. Run it on the owner's key and record the result in `GARMIN-API.md`. |
| F3 | Auto-download after sync (only if F2 is 200) | Add an engine step after activities: for each synced activity with no FIT workout (`matchActivity`), fetch the zip (one at a time, 1 s gap, newest 30 first, the rest on full sync). Pass it to `importFit([new File([buf], id + '.zip')])`. Show its status in the Sync Center under "Original files". The Worker already forwards any path and body, so `worker/` stays unchanged. |
| F4 | Settings + export | Settings → Data: a "Workout lab" row showing the count and storage used (sum of `fitFiles` sizes), with "Remove all imported workouts" (`deleteFitWorkouts`). JSON export keeps excluding FIT bytes (too big); say so in the export hint. Add "Copy for AI" support: include FIT-derived splits for workouts in range (`aiSummary.js` `workoutLine` + `kmSplits` per workout, capped at 10 workouts). |
| F5 | Synced activity → lab link | In `ActivityDetail.jsx`, when `matchActivity` finds a FIT workout, show a "Second by second" card linking to `#/lab/:id`. Otherwise show a one-line hint on how to import the original. |
| F6 | Account export at scale | Test with a real Garmin account export (≈1 GB, thousands of files). Measure import time on the iPhone. If over ~2 min, move `importFit` into a Web Worker (`new Worker(new URL('./fitWorker.js', import.meta.url), { type: 'module' })`, posting batches back). Keep `MAX_FIT_BYTES`. Check that the IndexedDB quota (`estimateUsage`) holds: about 50 KB per hour of running. |
| F7 | More analysis | **Cycling:** speed charts already work; add power/cadence when present. **Strength:** `set` messages (num 225) give reps and weights. **HRV during workouts:** `hrv` messages (num 78) when beat-to-beat logging is on. **Heat:** adjust efficiency for `avgTempC` once 20+ runs span 10 °C. **Weekly running volume** chart from `fitWorkouts`. |

**Known limits.**

- Run shape is heuristic. "Intervals" needs 4+ fast stretches of 30 s or more.
- The 30 Oct run reads "Progression" because each third was faster.
- Efficiency mixes easy and hard runs, so the trend is what matters.
- Best efforts use GPS distance, which can run 1–3% long on twisty routes.
