# Decisions

Why things are the way they are. Read before "fixing" something that looks odd.

## Architecture

- **No backend; local-first.** Personal health data stays on the user's device. GitHub Pages is free
  static hosting; the only server is a ~30-line proxy that exists because Garmin sends no CORS headers.
- **No router / state / CSS libraries.** The app is small enough that a hash router (~40 lines) and a
  plain store with `useSyncExternalStore` are simpler than dependencies. Hash routing works on static
  hosting without rewrite rules.
- **Normalise at the edge.** Garmin's JSON is inconsistent; converting it once in `normalize.js` keeps
  every page simple and makes the parsing testable with fixtures.
- **Metric registry.** One definition per metric (label, unit, format, colour, bands, direction) keeps
  tiles, trends, reports, exports and insights consistent and makes adding a metric a one-place change.
- **Demo mode in a separate database.** Lets development, screenshots and demos run without a Garmin
  key and without any risk to real data.
- **Demo mirrors a Personal API key.** No readiness, SpO2 or sleep-time HR/HRV, so the screens match
  what real users see (e.g. the Today hero shows "Recovery estimate"). The hypnogram is kept so the
  timeline chart stays covered.

## Sync

- **Sequential requests, not parallel.** Garmin rate-limits; one-at-a-time with a gap and backoff is
  slower but finishes. v1's parallel calls plus swallowed errors produced silent gaps.
- **Merge, never replace.** v1's incremental sync replaced the stored wellness blob and wiped
  history. Now a `null` never overwrites a value and nothing is deleted by a sync.
- **Write each chunk immediately.** Progress is visible, the UI updates during a long sync, and cancel
  keeps what was fetched.
- **Local day keys everywhere.** v1 used `toISOString()` and every date was a day early in IST.
- **Chunks built with `chunkRange()`.** v1's chunk loop used `setDate(start.getDate() - 1)` across
  months and never terminated — Full Sync froze the tab.
- **`partial` counts as a sync time.** Otherwise one permanently failing endpoint (e.g. weight) would
  make "Last synced" stale forever and trigger auto-sync on every open. The failure stays visible in
  the Sync Center.
- **Experimental endpoints degrade to `unavailable`.** Personal API keys may not expose every Connect
  endpoint; the rest of the sync must not care.

## Health logic

- **Recovery estimate is labelled as such.** When Garmin's training readiness isn't available the
  hero shows "Recovery estimate" with the note "It is not a Garmin number".
  It blends sleep score with duration vs need (0.4), HRV vs its own 7-day baseline (0.35, plateaus
  above baseline — higher HRV is not "extra" recovery) and Body Battery high (0.25), and is **capped
  after a short night** (> 1 h under need → max 70, > 2.5 h → max 55), as Garmin's readiness is.
  Need is Garmin's sleep need when present, else Settings → Sleep need. Today, Morning, the Reports
  tile and the Recovery report all use `recoveryFor` / `recoverySeries`, so they show the same number.
- **Recovery breakdown shares the model.** `recoveryBreakdown` and `recoveryFor` both call the
  private `recoveryModel`, so "What moved it" can never disagree with the hero. Resting HR and
  respiration appear as **context, not inputs**: they aren't in the score, and adding them would
  change every number users have seen. HRV points top out at 85 so the card never implies that
  HRV above your usual is extra recovery. Respiration is the overnight (sleep) value only; waking
  respiration moves with activity and isn't comparable night to night.
- **Health monitor normal range = your own 30 nights, mean ± 1 SD.** About two nights in three
  land inside it, so "outside" is common enough to be informative but not alarming; streaks are what
  the copy points at. The night itself is excluded from its own range, a range needs 14 nights, and a
  per-metric minimum half-width (`MIN_HALF`) stops a very steady metric flagging 1-bpm wobbles.
  Values are rounded to display precision before comparing so the verdict always matches the numbers
  shown. HRV uses Garmin's balanced range when the night has one. SpO₂ appears only when the watch
  records it. Outside in the "better" direction (lower RHR, higher HRV) is neutral, not good or bad.
- **Delta noise floor.** Day-to-day changes like "−0.4" are noise; `isMeaningfulDelta()` turns them
  into "Same". Thresholds per metric in `MIN_DELTA` (`lib/metrics.js`).
- **Insights are trends with sample sizes**, never causal or medical claims, and stay silent below
  minimum data/effect thresholds. "Standout of the week" is suppressed when a specific detector
  already covers that metric.
- **Sleep belongs to the wake-up day.** Garmin's convention; it means "stress after poor sleep" is
  same-record, not next-day.
- **Greeting name ignores Garmin IDs.** Garmin's `displayName` is often a UUID. A local override
  (Settings → Profile) wins; otherwise a human-looking Garmin name; otherwise no name.

## UI

- **iPhone first.** Bottom nav, ≥ 44px targets, safe areas, pull-to-refresh, one-screen Morning check.
- **Validated colour palettes.** Sleep stages and stress levels were checked for colour-blind
  separation on all three theme surfaces; violet next to blue failed, hence the current order.
- **Straight lines, not curves.** `monotone` curves overshoot real values on noisy daily data.
- **Line, not area, over a shaded band** (HRV balanced range) so the band stays readable.
- **Bands and fixed domains only for true 0–100 scores** shown as bars/rings; trend lines auto-zoom.

## Security

- **Lock is a privacy screen, not encryption** — and the UI says so. Anyone with DevTools can read
  IndexedDB. PINs are salted SHA-256 with a persisted wrong-PIN throttle; the keypad submits at the
  saved PIN's exact length so a 6-digit PIN isn't checked at 4 digits.
- **Service worker never caches Garmin responses.** Health data is only in IndexedDB, which "Clear
  local data" fully removes.

## Tooling

- **Node `assert` tests, no framework.** Zero setup on any machine; the pure-logic split
  (`*.js` modules with `.js` imports) is what makes it work.
- **`scripts/shot.mjs` grows the viewport instead of full-page capture.** Full-page capture resizes
  mid-shot, recharts re-lays out, and charts come out blank — this cost a debugging round once.
- **`playwright-core` + installed Chrome** instead of full Playwright: small install, no browser download.
- **`node_modules/` and `dist/` are not committed** (they were in the first commit by accident).
