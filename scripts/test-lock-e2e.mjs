// End-to-end check of the PIN lock in Chrome (demo data): exact-length submit + wrong-PIN throttle.
import { launch } from './browser.mjs'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
const server = await createServer({ cacheDir: '/tmp/mkfit/vite-cache-lock', server: { port: 0 }, logLevel: 'error' })
await server.listen()
const browser = await launch()
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage()
await page.goto(`${server.resolvedUrls.local[0]}?demo=1#/`, { waitUntil: 'networkidle' })
// set a 6-digit PIN through the real module, then reload (cold start locks)
await page.evaluate(async () => { const m = await import('/unified-pwa/src/lib/lock.js'); await m.setPin('482916') })
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(500)
const tap = async digits => { for (const d of digits) await page.getByRole('button', { name: d, exact: true }).click() }
const dots = () => page.locator('.lock-dots i.is-on').count()
assert.ok(await page.locator('.lock').isVisible(), 'locked on cold start')
await tap('4829'); await page.waitForTimeout(1200)
assert.equal(await dots(), 4, '6-digit PIN is not submitted early at 4 digits')
assert.ok(await page.locator('.lock').isVisible())
await tap('16'); await page.waitForTimeout(400)
assert.ok(!(await page.locator('.lock').isVisible()), 'correct 6-digit PIN unlocks')
// wrong PINs → throttle after 5 free tries
await page.evaluate(async () => { const m = await import('/unified-pwa/src/lib/lock.js'); m.lockNow() }); await page.waitForTimeout(300)
for (let i = 0; i < 6; i++) { await tap('111111'); await page.waitForTimeout(250) }
const msg = await page.locator('.lock').innerText()
assert.match(msg, /Too many wrong PINs/, 'throttle message shown')
await tap('482916'); await page.waitForTimeout(400)
assert.ok(await page.locator('.lock').isVisible(), 'correct PIN rejected while throttled')
await page.evaluate(() => localStorage.setItem('mk_fitness_lock_fails', JSON.stringify({ n: 6, until: Date.now() - 1 })))
await tap('482916'); await page.waitForTimeout(400)
assert.ok(!(await page.locator('.lock').isVisible()), 'unlocks once the wait is over')
assert.equal(await page.evaluate(() => localStorage.getItem('mk_fitness_lock_fails')), null, 'success clears the counter')
console.log('lock e2e: all passed')
await browser.close(); await server.close()
