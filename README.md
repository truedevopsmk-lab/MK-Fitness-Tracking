# MK's Fitness Dashboard

A local-first Garmin Personal API dashboard designed for an iPhone home-screen PWA.

## Run locally

```bash
npm install
npm run dev
```

Open the local URL shown by Vite, enter the Garmin Personal API key, and sync. The key is used in memory to obtain a short-lived token and is not saved by the app.

## Publish with GitHub Pages

The included workflow builds and deploys the app when `main` changes.

1. Create a GitHub repository and push this folder to its `main` branch.
2. In repository Settings → Pages, choose **GitHub Actions** as the source.
3. Deploy the included `Deploy MK's Fitness Dashboard` workflow.
4. The app will be available at `https://YOUR-USER.github.io/REPOSITORY-NAME/`.

### Garmin proxy requirement

GitHub Pages is static hosting. It cannot proxy Garmin's Personal API, and Garmin may reject direct browser requests because of CORS. Deploy the small Cloudflare Worker in `worker/` and set the repository variable `GARMIN_API_BASE` to its HTTPS URL before running the Pages workflow.

For the Worker:

```bash
cd worker
npx wrangler deploy
```

Update `ALLOWED_ORIGIN` in `wrangler.toml` to your GitHub Pages origin, then set the GitHub Actions repository variable:

`GARMIN_API_BASE=https://YOUR-WORKER.workers.dev`

Do not commit Garmin API keys, access tokens, `.env` files, or personal exports.

## PWA installation on iPhone

Open the GitHub Pages URL in Safari, tap Share, choose **Add to Home Screen**, and launch it from the new icon. The theme button cycles through night, day, and color modes.
