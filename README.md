# MK's Fitness Dashboard

A local-first Garmin Personal API dashboard, designed as an iPhone home-screen PWA.
Your data is fetched from Garmin, stored only in this browser (IndexedDB), and never
sent anywhere else.

## What's in it

| Page | What it shows |
|---|---|
| **Today** | Readiness (or a labelled recovery estimate), sleep, Body Battery, stress, HRV, resting HR, steps vs goal, weekly intensity minutes, latest activity, week strip, top insights. Pull down to sync. |
| **Morning check** | One-screen glance for the morning: last night, Body Battery, HRV, RHR and one recommendation. Home-screen shortcut. |
| **Trends** | Every metric over 7D / 30D / 60D / 4M / 1Y, daily / weekly / monthly, average / min / max / change vs previous period, date navigation, missing-day markers, table view, CSV export. |
| **Sleep** | Score, stages, hypnogram timeline, overnight HR / HRV / respiration / SpO2, sleep debt, bedtime consistency, sleep vs Body Battery recovery. |
| **Reports** | Garmin-style reports: stress, Body Battery, HRV, heart rate, steps, activities, training load (acute vs chronic), recovery. |
| **Insights** | Plain-language patterns from your own data, each with its sample size. Trends, not medical advice. |
| **Sync Center** | Latest / full sync, live progress, per-endpoint status, retry failed, cancel, rate-limit countdown, sync log. |
| **Settings** | Theme (night / day / color / auto), sync preferences, JSON + CSV export, JSON import, optional Face ID / PIN lock, clear local data, sign out. |

## Run locally

```bash
npm install
npm run dev
```

Open the URL Vite prints, then either paste your Garmin Personal API key or choose
**Explore with demo data**. The key is used once to get a short-lived token and is never stored.
Append `?demo=1` to any URL to open the demo directly (a separate database — your real data is untouched).

```bash
npm test           # unit tests (dates, sync engine, normalisers, insights, export/import, …)
npm run test:e2e   # PIN lock flow in Chrome
npm run build
```

`scripts/shot.mjs` screenshots any route with demo data at iPhone size
(`node scripts/shot.mjs /tmp/shots '#/' '#/sleep@day' '#/trends/steps@desktop'`). It needs
Google Chrome and a cached `playwright-core` (set `PLAYWRIGHT_CORE` to its path).

## How sync works

- **Sync latest** fetches from just before each endpoint's last successful sync up to today.
  **Full sync** fetches the configured history (Settings → Sync).
- Requests run one at a time. If Garmin rate-limits (429), the app waits as asked and shows a countdown.
- Every chunk is saved as it arrives and merged into what you already have — a sync never deletes data,
  and a cancelled sync keeps everything fetched so far.
- Each endpoint shows its own status. "Garmin has no data for this yet" and "Not available for your
  Garmin API key" are normal and are not errors. **Retry failed** re-fetches only the failed date ranges.
- Data from v1 of this app is migrated automatically on first launch.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the data model and code layout.

## Publish with GitHub Pages

The included workflow builds and deploys the app when `main` changes.

1. In repository Settings → Pages, choose **GitHub Actions** as the source.
2. Set the repository variable `GARMIN_API_BASE` to your Garmin proxy URL (below).
3. Push to `main`. The app is served at `https://YOUR-USER.github.io/REPOSITORY-NAME/`.

### Garmin proxy

GitHub Pages is static hosting and Garmin does not allow browser requests (CORS), so the app talks to
Garmin through the small Cloudflare Worker in `worker/`. Dashboard changes don't require redeploying it.

```bash
cd worker
npx wrangler deploy
```

`ALLOWED_ORIGIN` in `wrangler.toml` must be your GitHub Pages origin.

## Privacy

- Health data: IndexedDB in this browser only. Garmin session token: localStorage. API key: never stored.
- The service worker caches the app itself, never Garmin responses.
- The optional app lock keeps casual eyes out on a shared device; it does not encrypt the data.
- **Never commit Garmin API keys, tokens, `.env` files or personal exports.** `.gitignore` covers
  `.env*` and `mk-fitness-export-*`.

## Install on iPhone

Open the site in Safari → Share → **Add to Home Screen**, then launch it from the icon.
