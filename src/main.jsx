import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { actions } from './state/store'
import { getPrefs } from './lib/prefs'

// Theme before first paint; index.html carries an inline splash until the cache is read.
document.documentElement.dataset.theme = getPrefs().theme

const root = createRoot(document.getElementById('root'))

async function boot() {
  // App (and its CSS) loads in parallel with the cache read; nothing renders until both are ready.
  const [{ default: App, applyTheme }] = await Promise.all([import('./App'), actions.init()])
  applyTheme(getPrefs().theme)
  document.getElementById('boot')?.remove()
  root.render(<StrictMode><App /></StrictMode>)
}
boot().catch(err => {
  console.error(err)
  document.getElementById('boot')?.remove()
  root.render(<div style={{ padding: 24, fontFamily: 'system-ui' }}><h1>MK Fitness could not start</h1><p>{String(err?.message || err)}</p></div>)
})
