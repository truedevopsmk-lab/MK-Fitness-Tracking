import { Suspense, lazy, useCallback, useEffect, useState } from 'react'
import './styles/tokens.css'
import './styles/base.css'
import './styles/components.css'
import { getState, useStore } from './state/store'
import { getPrefs, setPrefs, usePrefs } from './lib/prefs'
import { fmtAgo } from './lib/format'
import { isSessionValid } from './sync/garmin'
import { navigate, useRoute } from './router'
import { useLockState } from './lib/lock'
import ErrorBoundary from './components/ErrorBoundary'
import Toaster from './components/Toaster'
import Sheet from './components/Sheet'
import Segmented from './components/Segmented'
import PullToRefresh from './components/PullToRefresh'
import LockScreen from './components/LockScreen'
import Icon from './components/Icon'
import PageHeader from './components/PageHeader'
import Empty from './components/Empty'
import Button from './components/Button'
import { toast } from './components/toast'
import Connect from './pages/Connect'

const page = loader => lazy(loader)
const Today = page(() => import('./pages/Today'))
const Morning = page(() => import('./pages/Morning'))
const Trends = page(() => import('./pages/Trends'))
const TrendDetail = page(() => import('./pages/TrendDetail'))
const Sleep = page(() => import('./pages/Sleep'))
const Reports = page(() => import('./pages/Reports'))
const Activities = page(() => import('./pages/Activities'))
const ActivityDetail = page(() => import('./pages/ActivityDetail'))
const Insights = page(() => import('./pages/Insights'))
const SyncCenter = page(() => import('./pages/SyncCenter'))
const Settings = page(() => import('./pages/Settings'))
const REPORTS = {
  stress: page(() => import('./pages/reports/Stress')), 'body-battery': page(() => import('./pages/reports/BodyBattery')),
  hrv: page(() => import('./pages/reports/Hrv')), 'heart-rate': page(() => import('./pages/reports/HeartRate')),
  steps: page(() => import('./pages/reports/Steps')), recovery: page(() => import('./pages/reports/Recovery')),
  health: page(() => import('./pages/reports/Health')), effort: page(() => import('./pages/reports/Effort')),
  resilience: page(() => import('./pages/reports/Resilience')), timeline: page(() => import('./pages/reports/Timeline')),
  activities: page(() => import('./pages/reports/ActivitiesReport')), 'training-load': page(() => import('./pages/reports/TrainingLoad')),
}
const Kit = import.meta.env.DEV ? page(() => import('./pages/Kit')) : null

const NAV = [
  { id: 'today', label: 'Today', icon: 'today', to: '#/', match: p => p === '/' || p === '/morning' },
  { id: 'trends', label: 'Trends', icon: 'trends', to: '#/trends', match: p => p.startsWith('/trends') },
  { id: 'sleep', label: 'Sleep', icon: 'sleep', to: '#/sleep', match: p => p.startsWith('/sleep') },
  { id: 'reports', label: 'Reports', icon: 'reports', to: '#/reports', match: p => p.startsWith('/reports') },
  { id: 'more', label: 'More', icon: 'more', to: null, match: p => ['/insights', '/activities', '/sync', '/settings'].some(x => p.startsWith(x)) },
]
const MORE = [
  { label: 'Insights', icon: 'insights', to: '#/insights' }, { label: 'Activities', icon: 'activity', to: '#/activities' },
  { label: 'Sync Center', icon: 'sync', to: '#/sync' }, { label: 'Settings', icon: 'settings', to: '#/settings' },
]
const THEMES = [{ value: 'night', label: 'Night' }, { value: 'day', label: 'Day' }, { value: 'color', label: 'Color' }, { value: 'auto', label: 'Auto' }]
const THEME_ICON = { night: 'moon', day: 'sun', color: 'palette', auto: 'sun' }

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme
  const meta = document.querySelector('meta[name="theme-color"]:not([media])') || document.head.appendChild(Object.assign(document.createElement('meta'), { name: 'theme-color' }))
  meta.content = getComputedStyle(document.documentElement).getPropertyValue('--meta-theme').trim()
}

const loadEngine = () => import('./sync/engine')
const autoSync = () => loadEngine().then(e => e.maybeAutoSync()).catch(e => console.warn('auto sync', e))

function Splash() { return <div className="splash"><div className="splash-logo">MK<span>FITNESS</span></div></div> }
function NotFound() {
  return <div className="page"><PageHeader title="Page not found" back="#/" /><Empty icon="more" title="That page doesn’t exist" body="The link may be out of date." action={<Button variant="primary" href="#/">Back to Today</Button>} /></div>
}
const Loading = () => <div className="page" aria-busy="true" />

function SyncChip() {
  const { running, mode } = useStore(s => s.sync)
  const last = useStore(s => s.syncMeta.lastSuccessAt)
  const [, tick] = useState(0)
  useEffect(() => { const id = setInterval(() => tick(n => n + 1), 30000); return () => clearInterval(id) }, [])
  const ago = last ? fmtAgo(last) : null
  const text = running ? (mode === 'full' ? 'Full sync' : 'Syncing') : ago ? `Synced ${ago}` : 'Not synced'
  return <a className={`sync-chip${!running && last && Date.now() - last > 24 * 3600e3 ? ' is-stale' : ''}`} href="#/sync" aria-label={`${text}. Open Sync Center`}>
    {running ? <span className="spinner" aria-hidden="true" /> : <Icon name="sync" size={16} />}
    <span className="sync-chip-text">{running || !ago ? text : <><span className="sync-pre">Synced </span>{ago.replace(/ ago$/, '')}{/ ago$/.test(ago) && <span className="sync-pre"> ago</span>}</>}</span>
  </a>
}

function Header({ onTheme, route }) {
  const source = useStore(s => s.source)
  const prefs = usePrefs()
  return <header className="app-header"><div className="app-header-in">
    <a className="logo" href="#/" aria-label="MK Fitness, Today">MK<span>FITNESS</span></a>
    <nav className="top-nav" aria-label="Main">{NAV.map(n => <NavItem key={n.id} n={n} on={n.match(route.path)} />)}</nav>
    <div className="header-spacer" />
    <span className={`chip ${source === 'demo' ? 'chip-demo' : ''}`}><i className="chip-dot" />{source === 'demo' ? 'Demo data' : 'Garmin'}</span>
    <SyncChip />
    <button type="button" className="icon-btn" onClick={onTheme} aria-label={`Theme: ${prefs.theme}. Change theme`}><Icon name={THEME_ICON[prefs.theme] || 'moon'} size={20} /></button>
  </div></header>
}

function NavItem({ n, on }) {
  const props = { className: `nav-item${on ? ' is-on' : ''}`, 'aria-current': on ? 'page' : undefined }
  const inner = <><Icon name={n.icon} size={22} /><span>{n.label}</span></>
  return n.to ? <a href={n.to} {...props}>{inner}</a> : <button type="button" {...props} onClick={() => window.dispatchEvent(new Event('mk:more'))}>{inner}</button>
}

function Routes({ route }) {
  const { path, segments } = route
  const [a, b] = segments
  if (!a) return <Today />
  if (a === 'morning') return <Morning />
  if (a === 'trends') return b ? <TrendDetail key={b} metricKey={b} /> : <Trends />
  if (a === 'sleep') return <Sleep />
  if (a === 'reports') { const R = b && REPORTS[b]; return R ? <R /> : <Reports /> }
  if (a === 'activities') return b ? <ActivityDetail key={b} id={b} /> : <Activities />
  if (a === 'insights') return <Insights />
  if (a === 'sync') return <SyncCenter />
  if (a === 'settings') return <Settings />
  if (a === '__kit' && Kit) return <Kit />
  return <NotFound key={path} />
}

export default function App() {
  const route = useRoute()
  const ready = useStore(s => s.ready)
  const source = useStore(s => s.source)
  const hasData = useStore(s => Object.keys(s.days).length > 0 || s.activities.length > 0)
  const prefs = usePrefs()
  const lock = useLockState()
  const [more, setMore] = useState(false)
  const [valid, setValid] = useState(isSessionValid)

  useEffect(() => { applyTheme(prefs.theme) }, [prefs.theme])
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: light)'), on = () => getPrefs().theme === 'auto' && applyTheme('auto')
    mq.addEventListener('change', on); return () => mq.removeEventListener('change', on)
  }, [])
  useEffect(() => {
    const open = () => setMore(true)
    window.addEventListener('mk:more', open)
    const check = () => setValid(isSessionValid())
    const vis = () => { if (document.visibilityState === 'visible') { check(); autoSync() } }
    document.addEventListener('visibilitychange', vis)
    const id = setInterval(check, 60000)
    autoSync()
    return () => { window.removeEventListener('mk:more', open); document.removeEventListener('visibilitychange', vis); clearInterval(id) }
  }, [])
  useEffect(() => { if (route.path === '/reports/sleep') navigate('#/sleep', { replace: true }) }, [route.path])
  useEffect(() => { setMore(false) }, [route.path])
  useEffect(() => { if (route.path === '/' && prefs.startPage === 'morning' && !sessionStorage.getItem('mk_start_done')) { sessionStorage.setItem('mk_start_done', '1'); navigate('#/morning', { replace: true }) } }, [])

  const refresh = useCallback(async () => {
    if (getState().source === 'demo') { toast('Demo data does not sync', { tone: 'neutral' }); return }
    if (!isSessionValid()) { toast('Reconnect Garmin to sync', { tone: 'warning' }); navigate('#/sync'); return }
    const e = await loadEngine()
    await e.startSync('incremental')
  }, [])

  if (!ready) return <Splash />
  if (!valid && !hasData && source !== 'demo') return <><Connect onConnected={() => setValid(true)} /><Toaster /></>
  if (lock.locked) return <LockScreen onUnlock={lock.unlock} />

  const reportsSleep = route.path === '/reports/sleep'
  return <div className="app">
    <Header route={route} onTheme={() => setPrefs({ theme: THEMES[(THEMES.findIndex(t => t.value === prefs.theme) + 1) % THEMES.length].value })} />
    <PullToRefresh onRefresh={refresh}>
      <main className="main" id="main">
        {!valid && source !== 'demo' && <div className="banner" style={{ marginBottom: 14 }} role="status"><Icon name="alert" size={18} /><span>Garmin session expired. Reconnect to sync.</span><a href="#/sync">Reconnect</a></div>}
        <ErrorBoundary resetKey={route.path}>
          <Suspense fallback={<Loading />}><div className="page-fade" key={route.segments[0] || 'home'}>{reportsSleep ? null : <Routes route={route} />}</div></Suspense>
        </ErrorBoundary>
      </main>
    </PullToRefresh>
    <nav className="bottom-nav" aria-label="Main">{NAV.map(n => <NavItem key={n.id} n={n} on={n.match(route.path)} />)}</nav>
    <Sheet open={more} onClose={() => setMore(false)} title="More">
      <div className="more-list">{MORE.map(m => <a key={m.label} className="more-item" href={m.to}><span className="more-ico"><Icon name={m.icon} size={20} /></span>{m.label}<Icon name="chevron-right" size={18} className="more-chev" /></a>)}</div>
      <div className="theme-opts"><span className="field-label">Theme</span><Segmented value={prefs.theme} onChange={theme => setPrefs({ theme })} options={THEMES} label="Theme" /></div>
    </Sheet>
    <Toaster />
  </div>
}
