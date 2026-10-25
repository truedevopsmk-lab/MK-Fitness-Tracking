// Count rendered data marks in each recharts surface at a normal phone viewport (no resizing).
import { createRequire } from 'node:module'
import { createServer } from 'vite'
const require = createRequire(import.meta.url)
const { chromium } = require('/Users/muthukumar/.npm/_npx/9833c18b2d85bc59/node_modules/playwright-core')
const server = await createServer({ root: process.argv[2], cacheDir: '/tmp/mkfit/vite-cache-chk', server: { port: 0 }, logLevel: 'error' })
await server.listen(); const base = server.resolvedUrls.local[0]
const b = await chromium.launch({ channel: 'chrome' })
for (const r of process.argv.slice(3)) {
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 })).newPage()
  await p.addInitScript(() => localStorage.setItem('mk_fitness_prefs', JSON.stringify({ installDismissed: true, autoSync: false })))
  await p.goto(`${base}?demo=1${r}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(1500)
  // scroll through so lazy/intersection content mounts, then measure
  for (let y = 0; y < 12000; y += 700) { await p.evaluate(y => window.scrollTo(0, y), y); await p.waitForTimeout(120) }
  await p.waitForTimeout(800)
  const res = await p.evaluate(() => [...document.querySelectorAll('.recharts-wrapper')].map(w => {
    const bars = [...w.querySelectorAll('.recharts-bar-rectangle path, .recharts-bar-rectangle rect, .recharts-rectangle')].filter(e => { const bb = e.getBBox?.(); return bb && bb.height > 0.5 && bb.width > 0.5 }).length
    const lines = [...w.querySelectorAll('.recharts-line-curve, .recharts-area-curve')].filter(e => (e.getAttribute('d') || '').length > 20).length
    return `${bars}b/${lines}l`
  }))
  console.log(r.padEnd(26), res.join(' '))
}
await b.close(); await server.close()
