# MK Fitness — guide for AI coding assistants

Local-first Garmin dashboard PWA (Vite 7 + React 19 + recharts 3), iPhone-first, deployed to
GitHub Pages. Data is fetched from Garmin through a Cloudflare Worker proxy and stored only in
the browser (IndexedDB). There is no backend and no account system.

Start here, in this order:
1. This file (rules + commands).
2. `docs/ARCHITECTURE.md` — data flow, store, sync engine, routing, design system.
3. `docs/RECIPES.md` — step-by-step for the common changes (new metric, endpoint, page, report, insight).
4. `docs/GARMIN-API.md` before touching anything under `src/sync/` or `src/data/normalize.js`.
5. `docs/DECISIONS.md` before "fixing" something that looks odd — it may be deliberate.

## Commands

```bash
npm install                 # once
npm run dev                 # http://localhost:5173/unified-pwa/  (add ?demo=1 for demo data)
npm test                    # all Node unit tests — must pass before every commit
npm run test:e2e            # PIN lock flow in Chrome
npm run build               # production build into dist/
node scripts/shot.mjs /tmp/shots '#/' '#/sleep@day' '#/reports/hrv@desktop'   # screenshots (demo data)
node scripts/chartcheck.mjs "$PWD" '#/trends/steps'                           # counts rendered chart marks
```

Browser scripts need Google Chrome installed (they drive it via the `playwright-core` devDependency).
No Garmin key is needed for development: `?demo=1` loads 400 days of generated data into a
separate database.

## Rules (non-negotiable)

- **Day keys are local `YYYY-MM-DD` strings from `src/lib/dates.js`.** Never use
  `toISOString().slice(0, 10)` for a day — it shifts the date in timezones east of UTC (the user is in IST).
- **Pages never read raw Garmin JSON.** Garmin payloads are converted to the shapes in
  `src/data/schema.js` by `src/data/normalize.js`; the UI reads only those shapes.
- **Every metric goes through the registry** in `src/lib/metrics.js` (label, unit, format, colour,
  bands, which direction is better). Add a key there; don't hard-code labels or formatting in pages.
- **Sync never deletes data.** All writes go through `actions.applyDays` / `actions.applyActivities`
  (merge rules in `src/data/merge.js`: null never overwrites a value).
- **No hex colours outside `src/styles/tokens.css`.** Use CSS custom properties (`var(--accent)`, `var(--hue-sleep)`).
  Charts read tokens via `src/charts/chartTheme.js`.
- **Copy is trends, not medical advice.** "Your HRV has been below its baseline for 4 days", never
  "you are sick/overtrained". Insights need a minimum sample size and must state it.
- **Never commit personal data**: Garmin API keys, tokens, `.env*`, exports (`mk-fitness-export-*`).
  Never log the API key or token.
- **Don't change `worker/` unless the proxy itself must change** — dashboard work never needs it, and
  redeploying it needs `wrangler` + the owner's Cloudflare login.
- No new runtime dependencies without a strong reason. No router, CSS framework or state library.

## Code style

Match the surrounding code: compact functional React, hooks, 2-space indent, single quotes,
**no semicolons**, comments only where something is non-obvious. Files in `src/lib`, `src/data`,
`src/state`, `src/sync` use explicit `.js` extensions on relative imports so Node can import them in
tests; components may omit extensions.

## Before you finish a change

1. `npm test` passes (add a `scripts/test-*.mjs` for new pure logic and add it to the `test` script in `package.json`).
2. `npm run build` passes.
3. For UI changes: screenshot the affected routes on mobile night, `@day`, `@color` and `@desktop`
   with `scripts/shot.mjs`, **open the PNGs and look at them**, and check `@empty` for empty states.
4. Update the relevant doc in `docs/` if you changed a contract (store shape, route, endpoint, token).

## Git

- `main` deploys to GitHub Pages automatically. Work on a branch; merge via PR.
- The repo uses the owner's **personal** GitHub account (`truedevopsmk-lab`). On the owner's Mac,
  check `gh auth status` shows it active before pushing.
