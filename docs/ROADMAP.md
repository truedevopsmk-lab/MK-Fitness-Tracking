# Roadmap

Ideas, known gaps and tech debt. Move items to "Done" (with the PR) as they land.

## Next up (accuracy first)

- [ ] **Training readiness / sleep need from Garmin.** The owner's account shows "Recovery estimate"
  and sleep need falls back to 8 h. Check the Sync Center endpoint list (`readiness`, `profile`),
  capture the real responses, and fix the normalisers or record in `GARMIN-API.md` that they're
  unavailable to Personal API keys.
- [ ] **Sleep need setting default.** `prefs.sleepNeedHours` (8) drives sleep debt and the recovery
  cap when Garmin sends no need — surface it more clearly (Settings → Profile?).
- [ ] **Verify experimental endpoints** (`userSummary`, `intensity`, `heartRate`) with a real key and
  promote or drop them.

## Features

- [ ] Activity detail: per-km splits (pace/HR) and a route map (one extra request per activity, on open).
- [ ] Weekly summary card on Today (this week vs last: sleep, steps, training time, RHR).
- [ ] User-defined goals (steps, sleep, intensity) with streaks.
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
