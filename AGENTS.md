# AGENTS.md

Instructions for AI coding tools (Codex, Cursor, Copilot, Aider, Gemini CLI, …).

The canonical guide is **[CLAUDE.md](CLAUDE.md)** — same rules apply to every tool. Read it first,
then `docs/ARCHITECTURE.md` and `docs/RECIPES.md`.

Quick reference:

- Stack: Vite 7, React 19, recharts 3, vite-plugin-pwa. Plain JS/JSX, no TypeScript, no router or
  state library.
- Run: `npm install && npm run dev`, open `/unified-pwa/?demo=1` for demo data (no Garmin key needed).
- Verify: `npm test` and `npm run build` must pass. For UI changes, screenshot with
  `node scripts/shot.mjs <outDir> '<route>[@day|@color|@desktop|@empty]'` and inspect the images.
- Hard rules: local day keys from `src/lib/dates.js` (never `toISOString()` for dates); UI reads only
  the normalised shapes in `src/data/schema.js`; metrics come from `src/lib/metrics.js`; sync merges
  and never deletes; colours only via CSS tokens; insights are trends, not medical advice; never commit
  keys, tokens, `.env` or data exports.
- Style: 2-space indent, single quotes, no semicolons, compact functional components.
