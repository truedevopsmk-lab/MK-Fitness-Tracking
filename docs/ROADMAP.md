# Roadmap

Ideas, known gaps and tech debt. Move items to "Done" (with the PR) as they land.

## Next up (accuracy first)

- [x] **Training readiness / sleep need from Garmin.** Both 404 for Personal API keys (capability
  check, 2026-10-28) — recorded in `GARMIN-API.md`. The Recovery estimate is the permanent hero.
- [x] **Sleep need setting drives recovery.** `prefs.sleepNeedHours` is the only source of sleep need
  on Personal keys; sleep debt, the recovery estimate and the bedtime planner use it; it is also set from the Tonight card (A4).
- [x] **Verify experimental endpoints** — `userSummary` and `heartRate` promoted; `intensity` and
  `readiness` 404 and stay experimental.

## Coaching plan (agreed 2026-10-28)

Inspired by Bevel, WHOOP, Oura, Athlytic and Garmin Connect, built in this order. Each phase ships
with tests, screenshots in every theme and an updated doc, and is deployed when done. Data source
per item: **Have** = already synced, **Check** = depends on the capability check, **Log** = entered
by the user and kept on the device.

- [x] **Garmin capability check** — Sync Center tool that calls candidate endpoints once and reports
  status + field names only. Results go into `GARMIN-API.md` and decide which **Check** items happen.
  - [x] Run it on the owner's key and record the findings (`GARMIN-API.md § Findings`, 2026-10-28).
- **Phase 1 · Daily coach**
  - [x] A2 Recovery breakdown — what moved today's recovery (sleep, HRV, RHR, respiration) (Have)
  - [x] A3 Health monitor — RHR / HRV / respiration against the 30-day normal range; SpO₂ only if present (Have)
  - [x] A5 Garmin sleep sub-scores — duration, stress, awakenings, restlessness, stage mix (Have — in sleep summaries)
  - [x] A4 Sleep coach — 7-day sleep bank, tonight's need, bedtime planner from a wake time (Have)
  - [x] A1 Effort score + daily target — strain-like 0–100 from training load and steps, target from recovery (Have)
  - [x] A6 Resilience — 14-day recovery vs strain balance (Have)
  - [x] A7 Day timeline — sleep, activities, intraday HR and Body Battery on one line (Have; no stress timeline)
- **Phase 2 · Journal** (Log; never leaves the device)
  - [x] B1 Daily tags (alcohol, late meal, caffeine, travel, …) with a quick morning check-in
  - [x] B2 Habit impact — ≥ 5 days with and ≥ 5 without before showing a difference, with sample sizes
  - [x] B3 Day status — sick / injured / travelling / break, excluded from baselines
  - [x] B4 Counters — water, caffeine, alcohol
- **Phase 3 · Training**
  - [ ] C1 Fitness / fatigue / form (Have) · C2 Training status from it (Have) · C3 Intensity mix 80/20 (Have)
  - [ ] C4 Personal records from synced activities (Have) · C7 Race predictor, computed locally (Have)
  - [ ] C5 Splits + route map from the activity `details` endpoint (Have, needs a normaliser)
  - [ ] C9 Gear mileage (Log; Garmin gear unknown until the next capability check)
  - Dropped unless Garmin opens them: C6 VO₂ max + fitness age, C8 Strength sets (404 on Personal keys)
- **Phase 4 · Reviews**
  - [ ] D1 Weekly review · D2 Goals + streaks · D3 Calendar heatmaps · D7 Share card
  - [ ] D4 Year in review · D5 Compare periods · D6 Correlation explorer · D8 Customise Today
- **Undecided:** E1 "Copy for AI" anonymised summary · E2 in-app chat with your own LLM key (would send
  data off the device, so opt-in only). Ask the owner before building.
- **Not planned:** smart alarm, widgets and push (iOS PWA limits), nutrition logging, blood work.

## Features

- [ ] Morning check reachable from the iPhone home screen (iOS ignores manifest shortcuts — needs an
  Apple Shortcuts recipe or a separate bookmark to `#/morning`).
- [ ] Notifications/reminders (limited on iOS PWAs — investigate Web Push support).
- [ ] Custom tags (Log) — let the user add their own journal tags (the store and export already accept any valid tag key).
- [ ] Optional encrypted export (password-protected JSON).

## Tech debt

- [ ] **Chart duplication.** `pages/reports/ReportLayout.jsx` has its own `MiniTrend` /
  `StackedColumns` / `WeekdayBars`, built when the kit charts looked blank (that was a screenshot
  artifact, since fixed). Visually aligned with `charts/TrendChart` / `StackedBars`; consolidate into
  `src/charts/` when touching reports.
- [ ] Kit charts set `isAnimationActive` from a ref that flips after mount; harmless in practice
  (verified with `chartcheck.mjs`) but worth simplifying to "animate on first mount only".
- [ ] GitHub Actions use Node 20 actions (`checkout@v4`, `setup-node@v4`, `deploy-pages@v4`, …) —
  GitHub warns they're deprecated; bump to Node 24-compatible versions.
- [ ] `npm audit`: 4 low-severity advisories in `vite-plugin-pwa → workbox-build → @rollup/plugin-node-resolve`
  (build-time only, not shipped). `npm audit fix --force` would downgrade the plugin — wait for an upstream fix.
- [ ] `navigateFallbackDenylist: [/^\/garmin-api/]` in `vite.config.js` is a no-op (navigations only); remove.
- [ ] Remove `v2-dashboard-overhaul` from the `github-pages` environment's allowed branches after merging to `main`.

## Hardening

- [ ] Worker: reject requests whose `Origin` isn't `ALLOWED_ORIGIN` (currently it forwards anything,
  only CORS is restricted) and restrict paths to the Garmin services the app uses.
- [ ] Worker: basic rate limiting per IP.

## Done

- v2 overhaul — Sync Center, Today/Morning, trends, sleep, reports, insights, settings, lock, PWA (`fe7488f`).
- Greeting name: ignore Garmin UUIDs + local name setting; recovery estimate short-night cap (`de053da`).
- Garmin capability check in Sync Center (`e03dbf9`).
- Capability findings → richer sleep/daily data, one recovery score (`4cc02cf`).
- A2 Recovery breakdown: "What moved it" card on the Recovery report (any day via `?date=`),
  linked from Today and Morning; overnight respiration added to the registry (`eb581f7`).
- A3 Health monitor: `#/reports/health` compares resting HR, HRV, overnight breathing (and SpO₂
  when recorded) with your own 30-night normal range; status row on Today, card on Reports (`740fb7e`).
- A5 Sleep sub-scores: "What shaped your score" on Sleep shows Garmin's rating, your value and the
  optimal range for each part of the night; "What holds your score back" tallies fair/poor nights per range (`3f7a64a`).
- A4 Sleep coach: "Tonight" card on Sleep turns a wake time (your usual weekday/weekend one, or
  your choice) into a bedtime covering sleep need + sleep-bank payback + usual time awake; 7-night
  "Sleep bank" card; "Tonight" row on Today; sleep need settable in the card (`16a3c80`).
- A1 Effort score: daily effort 0–100 from training load and steps against a target from recovery,
  `#/reports/effort`, Effort row on Today (`e847bcb`).
- A6 Resilience: 14-day recovery vs effort balance with a quadrant map, `#/reports/resilience` (`e3b3a1d`).
- A7 Day timeline: `#/reports/timeline?date=` shows sleep, workouts, intraday heart rate and Body Battery
  on one axis with an event list (`e2cda50`).
- B1 Daily tags: on-device journal of tags (alcohol, late meal, travel, …) in its own IndexedDB store; check-in
  card on Morning, Journal row on Today, `#/journal?date=`, included in JSON export/import (`22f769e`).
- B2 Habit impact: `#/reports/habits` compares the night after each tag with logged days without it (5+ each way, sample sizes always shown, clear vs varies), "What stands out" lead, card on Reports, link from Journal (`fbf52bb`).
- B3 Day status: Sick / Injured / Travelling / Break on Journal and Morning check-in; the day and the day after are left out of normal ranges, HRV/RHR baselines, usual effort, insights, habit impact and 7-day averages (`c85315f`).
- B4 Counters: water, caffeine and alcohol counts with − / + on Today (for today) and on Journal (any day, with 30-day averages); counts alone don't check a day in, and the Alcohol count sets the Alcohol tag (`TBD`).
