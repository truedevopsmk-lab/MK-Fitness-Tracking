# Deployment

Two independent pieces:

| Piece | Hosted on | Deployed by | Changes when |
|---|---|---|---|
| The app (static PWA) | GitHub Pages | `.github/workflows/deploy-pages.yml` | any app change |
| Garmin proxy | Cloudflare Workers | `npx wrangler deploy` in `worker/` | only if the proxy itself changes |

Live site: https://truedevopsmk-lab.github.io/MK-Fitness-Tracking/
Worker: https://mk-fitness-garmin-proxy.truedevopsmk.workers.dev

## The app (GitHub Pages)

The workflow runs `npm ci` → `npm run build` → uploads `dist/` → deploys to Pages. It triggers on
**push to `main`** and on manual **Run workflow**.

Build-time configuration (GitHub → Settings → Secrets and variables → Actions → **Variables**):

| Variable | Value | Used as |
|---|---|---|
| `GARMIN_API_BASE` | Worker URL | `VITE_GARMIN_API_BASE` (where the app sends Garmin calls) |

`VITE_BASE_PATH` is set by the workflow to `/<repo-name>/`, so asset URLs work under the Pages path.

Required repository settings (already configured):

- **Settings → Pages → Source: GitHub Actions.**
  ⚠️ Not "Deploy from a branch" — that publishes the unbuilt source and the site breaks
  (`index.html` points at `/src/main.jsx`). If the site ever shows a blank page, check this first:
  `gh api repos/truedevopsmk-lab/MK-Fitness-Tracking/pages --jq .build_type` must print `workflow`.
- **Settings → Environments → `github-pages` → Deployment branches:** must include every branch you
  deploy from (`main`; `v2-dashboard-overhaul` was added for the v2 preview).

### Deploy

```bash
# Normal: merge to main (PR) → deploys automatically.
# Preview a branch (replaces the live site until main is redeployed):
gh workflow run deploy-pages.yml -R truedevopsmk-lab/MK-Fitness-Tracking --ref <branch>
gh run watch -R truedevopsmk-lab/MK-Fitness-Tracking $(gh run list -R truedevopsmk-lab/MK-Fitness-Tracking -w deploy-pages.yml -L 1 --json databaseId --jq '.[0].databaseId')
```

The branch must be in the `github-pages` environment's allowed branches. There is only one live
site: a branch deploy replaces production.

### Roll back

Run the workflow on the previous good ref: Actions → Deploy MK's Fitness Dashboard → Run workflow →
pick `main` (or a tag/branch). Users' cached data is unaffected by app version changes.

### Verify a deploy

```bash
U=https://truedevopsmk-lab.github.io/MK-Fitness-Tracking
curl -s "$U/" | grep -o 'src="[^"]*"' | head -3          # built assets, not /src/main.jsx
curl -s -o /dev/null -w '%{http_code}\n' "$U/sw.js"        # 200 = service worker present
```

On iPhone, the installed app shows the previous version until it is closed and reopened once.

## The Garmin proxy (Cloudflare Worker)

`worker/garmin-proxy.js` forwards `https://<worker>/<path>` to `https://personal.connectapi.garmin.com/<path>`
and adds CORS headers for `ALLOWED_ORIGIN` (in `worker/wrangler.toml`, currently
`https://truedevopsmk-lab.github.io`).

```bash
cd worker
npx wrangler login      # once, owner's Cloudflare account
npx wrangler deploy
```

Check it answers CORS for the Pages origin:
```bash
curl -s -o /dev/null -D - -X OPTIONS https://mk-fitness-garmin-proxy.truedevopsmk.workers.dev/userprofile-service/userprofile/settings \
  -H 'Origin: https://truedevopsmk-lab.github.io' -H 'Access-Control-Request-Method: GET' | grep -i access-control-allow-origin
```

**Hosting your own copy** (someone else running this): fork the repo, deploy the Worker under your
Cloudflare account with `ALLOWED_ORIGIN` set to your Pages origin, set the `GARMIN_API_BASE`
variable in your fork to your Worker URL, enable Pages (source: GitHub Actions), push to `main`.
Each user enters their own Garmin key and their name in Settings → Profile; nothing is shared.

## Release checklist

1. `npm test` and `npm run test:e2e` pass; `npm run build` passes.
2. Screenshots of changed pages (mobile night/day/color, desktop, `@empty`) look right.
3. Merge to `main`; watch the workflow.
4. Verify the live site (above) and open it on the phone.
5. If the data model changed, confirm an existing install migrates (open the live site in a browser
   profile that has old data).
