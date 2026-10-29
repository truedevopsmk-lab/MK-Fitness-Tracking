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

- **The journal is its own store, never synced.** Tags are entered by the user, so they live in a `journal`
  store beside `days`, never inside a DayRecord, and no sync path can overwrite them. JSON exports include them.
- **A tag belongs to the day it happened.** "A drink last night" goes on yesterday, so it lines up with the
  night that followed. The check-in day is yesterday before 18:00 and today from 18:00.
- **An entry with no tags means "logged, nothing to tag".** A day with no entry is "not logged". Comparing days
  with a tag against logged days without it (Habit impact) needs that difference, so removing the last tag keeps
  the entry and only "Clear day" deletes it.
- **Journal import: newest edit wins, ties keep local.** An incoming entry replaces the local one only when it
  has a later `updatedAt` and different tags, status, counts or check-in state.
- **Day status leaves out the day and the day after.** A DayRecord holds the night ending that morning plus the daytime, so
  a status on D touches record D (daytime, often the onset night) and D+1 (the night after). Both are skipped in every baseline or
  comparison window (normal ranges, HRV/RHR baselines, usual effort, insights, habit impact, 7-day averages). The value of a status
  day itself is never hidden. Garmin-provided baselines (HRV balanced range, weeklyAvg, resting7d) are kept unless a status day falls
  inside their window, and then replaced by our own from the other days only when there are enough of them (else Garmin's stays).
  Resilience's 14-day windows still count status days: they describe the current state, not a baseline.
- **Demo journal has its own seed and follows sleep.** `generateDemoJournal` uses a separate RNG so `generateDemo`
  output is unchanged, and makes alcohol, late meals and late caffeine likelier before nights scoring under 80, and meditation and
  stretching likelier before nights of 88 or more, so Habit impact has something to show. Yesterday stays unlogged to show the check-in prompt; today holds counts only (not checked in). Counts come from a second RNG so the tag draws never move.
- **Counts don't check a day in.** Tapping "+ water" at noon stores `checkedIn: false` on a counts-only entry, so it is not a
  "logged day" for Journal stats, the Today prompt or Habit impact (whose "without" sample is logged days with the tag absent).
  Tapping a tag, setting a status or pressing "Nothing to tag" / "Done" checks the day in; taking the last count back removes an entry that holds nothing else.
- **The Alcohol count sets the Alcohol tag.** Counting a drink adds the tag so Habit impact sees it without double entry.
  Removing the tag clears the count, and taking the count back to 0 removes the tag. Entry text drops the tag when the count is shown.

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

- **Habit impact pairs a tag with the night after.** Day D's tags are compared on D + 1's sleep score, recovery, HRV and resting HR, against logged days without the tag; unlogged days are left out. A comparison needs 5 days each way and always shows both counts. A difference below the metric's delta noise floor reads "about the same"; one smaller than twice its standard error reads "varies a lot" and is never listed under "What stands out". Copy says what follows a tag, never what it causes.
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
- **Sleep sub-scores are Garmin's, shown as-is.** The rating and optimal range come straight from
  Garmin; we only pair them with the night's own number. Restlessness has no raw value on Personal
  keys, so it shows the rating alone. Stage shares there are of time asleep (Garmin's definition),
  while the Sleep stages card counts time awake too — the card's footnote says so. The trend tally
  appears from 7 rated nights and states the count.
- **Bedtime = wake − (need + payback + usual time awake).** Garmin's sleep window starts when it
  detects sleep, so the planner adds the median time spent awake in bed over the last 14 nights
  (from 3 nights, capped at 90 min). Payback spreads the 7-night bank over 4 nights and is capped
  at 1 h a night; being ahead never shortens the night below need. The bank, like sleep debt, counts
  extra sleep only up to 1 h a night and needs 3 nights. The usual wake time is the median of the
  last 14 nights of the same type (weekday or weekend) when there are 3, else of all nights. Before
  4 am the plan is for this morning's wake, and the bank is always the 7 nights before the planned
  wake. "Past this bedtime" (how much sleep is still left) only shows between 6 pm and 4 am, so an
  early riser at 5 am is never told they are late.
- **Delta noise floor.** Day-to-day changes like "−0.4" are noise; `isMeaningfulDelta()` turns them
  into "Same". Thresholds per metric in `MIN_DELTA` (`lib/metrics.js`).
- **Insights are trends with sample sizes**, never causal or medical claims, and stay silent below
  minimum data/effect thresholds. "Standout of the week" is suppressed when a specific detector
  already covers that metric.
- **Sleep belongs to the wake-up day.** Garmin's convention; it means "stress after poor sleep" is
  same-record, not next-day.
- **Greeting name ignores Garmin IDs.** Garmin's `displayName` is often a UUID. A local override
  (Settings → Profile) wins; otherwise a human-looking Garmin name; otherwise no name.
- **Effort is relative to your own previous 28 days.** Points = training load + 2 per 1,000 steps
  outside workouts (so a 10k-step day is about a light 20-load workout), scored as
  `100 × (1 − 2^(−points / usual))`: a usual day is 50, twice usual about 75, and the curve
  saturates so it never reaches 100. The usual is floored at 10 so a near-zero history cannot inflate
  every day, and it needs 14 days of data before any score shows. The daily target (60–80, 40–60,
  20–40) reuses the recovery headline cut points (75 and 50). It is not in the metric registry because
  it needs activities and history, same as the recovery estimate. Copy calls it an estimate, not a Garmin number.
- **Resilience is a four-state label, not a number.** It compares the 14-day average recovery with the
  14-day average effort. A single score would suggest precision the inputs don't have, and a fortnight
  moves slowly, so a state (Strong, Fresh, Stretched, Low recovery) is honest and stable. The split
  points reuse numbers already in the app: recovery 60 (the midpoint of the recovery scale) and
  effort 50 (a usual day for you). Only days with both a recovery and an effort score count, and it needs 7
  of the 14 before showing a state. "After hard days" compares recovery on the day after a day with effort 65
  or more with recovery after other days, using the *next* day's recovery because sleep belongs to the
  wake-up day; it needs 3 hard and 3 other days in the last 28. The change line compares with the 14 days before
  and needs 7 recovery days there.
- **Day timeline opens at last night's bedtime.** Sleep belongs to the day you woke up, so the window for a
  day starts at the hour you fell asleep the night before (never more than 6 hours before midnight) and runs
  to midnight, or to now for today. Tonight's sleep is drawn clipped at midnight. Heart rate and Body Battery
  are two aligned charts, never a dual axis. Sleep stages are not drawn: the Sleep page has them, and four
  stage hues plus the other three would exceed four hues. There is no stress curve because Garmin does not
  send one to Personal API keys.

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
- **"Copy for AI" builds text on the device and only copies or shares it.** Nothing is sent anywhere until the
  user pastes it or picks a share target, so it doesn't break the local-first rule (an in-app LLM chat, E2, would).
  The text leaves out the display name, Garmin ids, workout titles (Garmin's default titles name the city) and raw
  payloads; it reads only `days`, `activities` and `journal`. Values go through the metric registry, the recovery
  estimate is marked "(est.)", insights keep their sample sizes, and the prompt asks for trends, not a diagnosis.
  The "30 days before" comparison skips status days like every other baseline. Ranges are capped at 365 days
  (≈ 110 KB of text), which fits in the major assistants' context.

## Tooling

- **Node `assert` tests, no framework.** Zero setup on any machine; the pure-logic split
  (`*.js` modules with `.js` imports) is what makes it work.
- **`scripts/shot.mjs` grows the viewport instead of full-page capture.** Full-page capture resizes
  mid-shot, recharts re-lays out, and charts come out blank — this cost a debugging round once.
- **`playwright-core` + installed Chrome** instead of full Playwright: small install, no browser download.
- **`node_modules/` and `dist/` are not committed** (they were in the first commit by accident).
