# Roadmap

Ideas, known gaps and tech debt. Move items to "Done" (with the PR) as they land.

## Next up (accuracy first)

- [x] **Training readiness / sleep need from Garmin.** Both 404 for Personal API keys (capability
  check, 2026-10-28) — recorded in `GARMIN-API.md`. The Recovery estimate is the permanent hero.
- [x] **Sleep need setting drives recovery.** `prefs.sleepNeedHours` is the only source of sleep need
  on Personal keys; sleep debt and the recovery estimate both use it. Surfacing it better is part of A4.
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
  - [ ] A3 Health monitor — RHR / HRV / respiration against the 30-day normal range; SpO₂ only if present (Have)
  - [ ] A5 Garmin sleep sub-scores — duration, stress, awakenings, restlessness, stage mix (Have — in sleep summaries)
  - [ ] A4 Sleep coach — 7-day sleep bank, tonight's need, bedtime planner from a wake time (Have)
  - [ ] A1 Effort score + daily target — strain-like 0–100 from training load and steps, target from recovery (Have)
  - [ ] A6 Resilience — 14-day recovery vs strain balance (Have)
  - [ ] A7 Day timeline — sleep, activities, intraday HR and Body Battery on one line (Have; no stress timeline)
- **Phase 2 · Journal** (Log; never leaves the device)
  - [ ] B1 Daily tags (alcohol, late meal, caffeine, travel, …) with a quick morning check-in
  - [ ] B2 Habit impact — ≥ 5 days with and ≥ 5 without before showing a difference, with sample sizes
  - [ ] B3 Day status — sick / injured / travelling / break, excluded from baselines
  - [ ] B4 Counters — water, caffeine, alcohol
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
  linked from Today and Morning; overnight respiration added to the registry.
