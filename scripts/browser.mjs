// Shared browser launcher for the dev scripts (screenshots, chart check, lock e2e, icons).
// Uses playwright-core (a devDependency, no bundled browser) driving the installed Google Chrome.
// Override with PLAYWRIGHT_CORE=/path/to/playwright-core or CHROME_CHANNEL=chromium|msedge.
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core')

export async function launch() {
  try { return await chromium.launch({ channel: process.env.CHROME_CHANNEL || 'chrome' }) }
  catch (e) {
    throw new Error(`Could not start Chrome (${e.message.split('\n')[0]}).\nInstall Google Chrome, or set CHROME_CHANNEL=chromium after "npx playwright-core install chromium".`)
  }
}
