// Screenshot the app in demo mode (no Garmin key needed).
//   node scripts/shot.mjs <outDir> <route>[@theme][@desktop] ...
//   node scripts/shot.mjs /tmp/mkfit/shots '#/' '#/sleep@day' '#/trends/steps@desktop'
// @real skips ?demo=1 (shows the Connect screen when there is no session).
// @empty = real (empty) DB with a fake session, no demo data.
// Themes: @night (default) @day @color. @desktop = 1280×900, otherwise iPhone 390×844 @2x.
// @t2130 = today at 21:30 local (fixed clock, for time-of-day UI like the Sleep coach).
// Prints console errors / page errors per route. Exit code 1 if any route threw.
import { launch } from './browser.mjs'
import { mkdirSync } from 'node:fs'
import { createServer } from 'vite'


const [outDir = '/tmp/mkfit/shots', ...routes] = process.argv.slice(2)
mkdirSync(outDir, { recursive: true })

// Separate dep-optimizer cache per caller so parallel runs don't race (SHOT_NAME=sleep node scripts/shot.mjs ...)
const cacheDir = `/tmp/mkfit/vite-cache-${process.env.SHOT_NAME || 'default'}`
const server = await createServer({ cacheDir, server: { port: 0, strictPort: false }, logLevel: 'error', clearScreen: false })
await server.listen()
const base = server.resolvedUrls.local[0] // includes the /unified-pwa/ base
const browser = await launch()
let failed = false

for (const spec of routes.length ? routes : ['#/']) {
  const [route, ...flags] = spec.split('@')
  const desktop = flags.includes('desktop'), theme = flags.find(f => ['night', 'day', 'color'].includes(f)) || 'night'
  const context = await browser.newContext(desktop
    ? { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 }
    : { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  if (flags.includes('empty')) await context.addInitScript(() => { window.__EMPTY = 1 })
  const at = flags.find(f => /^t\d{4}$/.test(f))
  if (at) { const d = new Date(); d.setHours(+at.slice(1, 3), +at.slice(3), 0, 0); await context.clock.setFixedTime(d) }
  await context.addInitScript(t => {
    const p = JSON.parse(localStorage.getItem('mk_fitness_prefs') || '{}')
    localStorage.setItem('mk_fitness_prefs', JSON.stringify({ ...p, theme: t, installDismissed: true, autoSync: false }))
    if (window.__EMPTY) { localStorage.setItem('mk_fitness_source', 'garmin'); localStorage.setItem('garmin_dashboard_session', JSON.stringify({ accessToken: 'x', expiresAt: Date.now() + 3600e3 })) }
  }, theme)
  const page = await context.newPage()
  const errors = []
  page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`) })
  page.on('pageerror', e => { errors.push(`pageerror: ${e.message}`); failed = true })
  await page.goto(`${base}${flags.includes('real') || flags.includes('empty') ? '' : '?demo=1'}${route}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(700)
  // Full-page capture resizes the viewport mid-shot, so recharts re-lays out and its bar/line animation
  // restarts (blank or half-drawn charts). Instead: grow the viewport to the content height, let charts
  // settle at their final size, then take a normal screenshot.
  const vw = page.viewportSize()
  const h = await page.evaluate(() => Math.ceil(document.documentElement.scrollHeight))
  await page.setViewportSize({ width: vw.width, height: Math.min(Math.max(h, vw.height), 12000) })
  await page.waitForTimeout(1500)
  const name = `${route.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'home'}-${theme}${desktop ? '-desktop' : ''}${flags.includes('empty') ? '-empty' : ''}${at ? `-${at}` : ''}.png`
  await page.screenshot({ path: `${outDir}/${name}` })
  console.log(`${errors.length ? '✗' : '✓'} ${spec} → ${outDir}/${name}`)
  errors.forEach(e => console.log(`    ${e}`))
  await context.close()
}

await browser.close()
await server.close()
process.exit(failed ? 1 : 0)
