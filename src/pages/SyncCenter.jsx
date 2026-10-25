import { useEffect, useMemo, useState } from 'react'
import { useStore, actions } from '../state/store'
import { usePrefs } from '../lib/prefs'
import { fmtAgo, fmtDateTime, fmtDay, fmtNumber } from '../lib/format'
import { today } from '../lib/dates'
import { ENDPOINTS } from '../sync/endpoints'
import { cancelSync, estimateFullSync, retryEndpoint, retryFailed, startSync } from '../sync/engine'
import { isSessionValid, session, signOut } from '../sync/garmin'
import Badge from '../components/Badge'
import Button from '../components/Button'
import Card from '../components/Card'
import ConfirmDialog from '../components/ConfirmDialog'
import ConnectForm from '../components/ConnectForm'
import Icon from '../components/Icon'
import Meter from '../components/Meter'
import PageHeader from '../components/PageHeader'
import SectionTitle from '../components/SectionTitle'
import '../styles/sync.css'

const STATUS = {
  idle: { tone: 'neutral', label: 'Not synced yet' },
  queued: { tone: 'neutral', label: 'Waiting' },
  running: { tone: 'accent', label: 'Syncing' },
  ok: { tone: 'good', label: 'Up to date' },
  empty: { tone: 'neutral', label: 'No data' },
  partial: { tone: 'warning', label: 'Partly synced' },
  failed: { tone: 'critical', label: 'Failed' },
  unavailable: { tone: 'neutral', label: 'Not available' },
  cancelled: { tone: 'warning', label: 'Cancelled' },
}
const RESULT = { ok: ['good', 'Succeeded'], partial: ['warning', 'Partly succeeded'], failed: ['critical', 'Failed'], cancelled: ['warning', 'Cancelled'] }
const GROUP_ORDER = ['Account', 'Training', 'Activity', 'Sleep', 'Recovery', 'Heart', 'Body']

const clock = secs => { const s = Math.max(0, Math.round(secs)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }

function useNow(active) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { if (!active) return; setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [active])
  return now
}

function note(ep, st) {
  if (st.status === 'empty') return 'Garmin has no data for this yet.'
  if (st.status === 'unavailable') return 'Not available for your Garmin API key.'
  if (st.error && st.status !== 'ok') return st.error
  if (st.status === 'ok' && st.failedRanges?.length) return `${st.failedRanges.length} older ranges still to retry.`
  return null
}

function EndpointRow({ ep, st, busy, canSync, onRetry }) {
  const meta = STATUS[st.status] || STATUS.idle
  const text = note(ep, st)
  const cov = st.coverage ? `${fmtDay(st.coverage.first, { day: 'numeric', month: 'short', year: '2-digit' })} – ${fmtDay(st.coverage.last, { day: 'numeric', month: 'short' })}` : null
  const retryable = ['failed', 'partial', 'cancelled'].includes(st.status)
  return <li className="sync-ep">
    <div className="sync-ep-main">
      <div className="sync-ep-title">
        <span className="sync-ep-name">{ep.label}</span>
        {ep.experimental && <span className="sync-ep-tag">experimental</span>}
      </div>
      <div className="sync-ep-facts">
        <span>{st.lastOkAt ? `OK ${fmtAgo(st.lastOkAt)}` : 'Never synced'}</span>
        {st.records != null && st.status !== 'idle' && <span>{fmtNumber(st.records)} records</span>}
        {cov && <span>{cov}</span>}
      </div>
      {text && <p className={`sync-ep-note ${st.status === 'failed' || st.status === 'partial' ? 'is-error' : ''}`}>{text}</p>}
    </div>
    <div className="sync-ep-side">
      <Badge tone={meta.tone} icon={st.status !== 'running'}>{st.status === 'running' && <span className="spinner" aria-hidden="true" />}{meta.label}</Badge>
      {(retryable || st.status === 'unavailable') && <Button size="sm" variant="ghost" icon="refresh" disabled={busy || !canSync} onClick={() => onRetry(ep.id)} aria-label={`Retry ${ep.label}`}>Retry</Button>}
    </div>
  </li>
}

export default function SyncCenter() {
  const source = useStore(s => s.source), syncMeta = useStore(s => s.syncMeta), endpoints = useStore(s => s.endpoints)
  const sync = useStore(s => s.sync), log = useStore(s => s.log), days = useStore(s => s.days)
  const prefs = usePrefs()
  const [, bump] = useState(0)
  const [confirm, setConfirm] = useState(null) // 'full' | 'signout'
  const [showLog, setShowLog] = useState(false)
  const demo = source === 'demo', running = sync.running
  const now = useNow(running || sync.rateLimitedUntil != null)
  const valid = isSessionValid(), hasSession = !!session()?.accessToken
  const canSync = !demo && valid

  const failed = useMemo(() => ENDPOINTS.filter(e => ['failed', 'partial', 'cancelled'].includes(endpoints[e.id]?.status)), [endpoints])
  const dayCount = useMemo(() => Object.keys(days).length, [days])
  const cov = syncMeta.coverage
  const rate = sync.rateLimitedUntil && sync.rateLimitedUntil > now ? Math.ceil((sync.rateLimitedUntil - now) / 1000) : null
  const grouped = useMemo(() => GROUP_ORDER.map(g => [g, ENDPOINTS.filter(e => e.group === g)]).filter(([, l]) => l.length), [])
  const fullEstimate = useMemo(() => confirm === 'full' ? estimateFullSync(prefs) : 0, [confirm, prefs])
  const result = RESULT[syncMeta.lastResult]

  const run = fn => { fn() }
  const logLines = log.slice(-30).reverse()

  return <div className="page page-fade sync-page">
    <PageHeader title="Sync" subtitle="Keep your Garmin data up to date" />

    <Card className="sync-hero">
      <div className="sync-hero-top">
        <div>
          <div className="sync-eyebrow">Last successful sync</div>
          <div className="sync-big num">{syncMeta.lastSuccessAt ? fmtAgo(syncMeta.lastSuccessAt) : 'Never'}</div>
          {syncMeta.lastSuccessAt && <div className="sync-sub">{fmtDateTime(syncMeta.lastSuccessAt)}</div>}
        </div>
        <Badge tone={demo ? 'accent' : 'neutral'} icon={false}>{demo ? 'Demo data' : 'Garmin'}</Badge>
      </div>
      <dl className="sync-facts">
        <div><dt>Last attempt</dt><dd>{syncMeta.lastAttemptAt ? <>{fmtAgo(syncMeta.lastAttemptAt)} {result && <Badge tone={result[0]}>{result[1]}</Badge>}</> : '—'}</dd></div>
        <div><dt>Coverage</dt><dd>{cov ? `${fmtDay(cov.first, { day: 'numeric', month: 'short', year: 'numeric' })} to ${cov.last >= today() ? 'today' : fmtDay(cov.last, { day: 'numeric', month: 'short', year: 'numeric' })} · ${fmtNumber(dayCount)} days` : 'No data yet'}</dd></div>
      </dl>
      {syncMeta.lastError && !running && <p className="sync-error" role="alert"><Icon name="alert" size={16} />{syncMeta.lastError}</p>}
    </Card>

    {demo ? <Card title="Demo mode" subtitle="Sync is switched off while you explore demo data.">
      <p className="muted sync-p">Demo data is generated on this device and is never sent anywhere. To sync real data, switch back to your Garmin account.</p>
      <Button variant="primary" icon="link" onClick={() => actions.switchSource('garmin')}>Switch to my Garmin data</Button>
    </Card> : <>
      <Card className="sync-actions-card">
        <div className="sync-actions">
          <Button variant="primary" size="lg" icon="refresh" disabled={running || !canSync} onClick={() => run(() => startSync('incremental'))}>Sync latest</Button>
          <Button variant="secondary" size="lg" icon="download" disabled={running || !canSync} onClick={() => setConfirm('full')}>Full sync</Button>
          {failed.length > 0 && !running && <Button variant="secondary" size="lg" icon="alert" disabled={!canSync} onClick={() => run(retryFailed)}>Retry failed ({failed.length})</Button>}
          {running && <Button variant="danger" size="lg" icon="x" onClick={cancelSync}>Cancel</Button>}
        </div>
        {!canSync && <p className="sync-hint">Reconnect Garmin below to sync.</p>}
        {running && <div className="sync-progress" role="status" aria-live="polite">
          <Meter value={sync.done} max={Math.max(sync.total, 1)} hue="steps" label={sync.mode === 'full' ? 'Full sync' : sync.mode === 'retry' ? 'Retrying' : 'Syncing latest'} valueLabel={`${sync.done} / ${sync.total} requests`} />
          <div className="sync-progress-meta">
            <span>{sync.phase || 'Working'}</span>
            <span className="num">{clock((now - (sync.startedAt || now)) / 1000)} elapsed</span>
          </div>
          {rate != null && <p className="sync-rate"><Icon name="alert" size={16} />Garmin asked us to slow down — resuming in {rate} s</p>}
          {sync.message && rate == null && <p className="sync-hint">{sync.message}</p>}
          <p className="sync-hint">Your saved data stays visible. You can keep browsing while this runs, but keep the app open.</p>
        </div>}
        {!running && sync.message && <p className="sync-hint">{sync.message}</p>}
      </Card>

      <Card title="Garmin connection" subtitle={valid ? undefined : hasSession ? 'Your session has expired.' : 'Not connected.'}>
        <div className="sync-session">
          <Badge tone={valid ? 'good' : 'warning'}>{valid ? 'Connected' : hasSession ? 'Session expired' : 'Not connected'}</Badge>
          {valid && <span className="sync-sub">until {fmtDateTime(session().expiresAt)}</span>}
          {hasSession && <Button size="sm" variant="ghost" onClick={() => setConfirm('signout')}>Sign out</Button>}
        </div>
        {!valid && <div className="sync-connect"><ConnectForm compact onConnected={() => bump(n => n + 1)} /></div>}
      </Card>
    </>}

    <SectionTitle>Data sources</SectionTitle>
    <div className="sync-groups">
      {grouped.map(([group, list]) => <Card key={group} title={group} flush className="sync-group">
        <ul className="sync-eps">{list.map(ep => <EndpointRow key={ep.id} ep={ep} st={endpoints[ep.id] || { status: 'idle' }} busy={running} canSync={canSync} onRetry={id => run(() => retryEndpoint(id))} />)}</ul>
      </Card>)}
    </div>

    <Card title="Sync log" subtitle={`${log.length} entries`} action={<Button size="sm" variant="ghost" icon="chevron-down" aria-expanded={showLog} onClick={() => setShowLog(v => !v)}>{showLog ? 'Hide' : 'Show'}</Button>}>
      {showLog && (logLines.length ? <ol className="sync-log">{logLines.map((l, i) => <li key={i} className={`sync-log-${l.level}`}><time className="num">{new Date(l.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time><span>{l.msg}</span></li>)}</ol> : <p className="muted sync-p">Nothing logged yet.</p>)}
    </Card>

    {confirm === 'full' && <ConfirmDialog title="Run a full sync?" confirmLabel="Start full sync"
      body={`This re-fetches up to ${prefs.historyDays} days of history and takes a few minutes (about ${fmtNumber(fullEstimate)} requests, one at a time). Your existing data is kept and only filled in.`}
      onCancel={() => setConfirm(null)} onConfirm={() => { setConfirm(null); startSync('full') }} />}
    {confirm === 'signout' && <ConfirmDialog title="Sign out of Garmin?" tone="danger" confirmLabel="Sign out"
      body="Your synced data stays on this device. You will need your Personal API key to sync again."
      onCancel={() => setConfirm(null)} onConfirm={() => { signOut(); setConfirm(null); bump(n => n + 1) }} />}
  </div>
}
