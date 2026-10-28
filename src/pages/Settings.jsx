import { useEffect, useMemo, useRef, useState } from 'react'
import { actions, getState, useStore } from '../state/store'
import { SLEEP_NEED_OPTIONS, setPrefs, usePrefs } from '../lib/prefs'
import { resolveName } from '../lib/name'
import { fmtAgo, fmtDay, fmtNumber } from '../lib/format'
import { today } from '../lib/dates'
import { downloadFile } from '../lib/csv'
import { estimateUsage } from '../data/db'
import { activitiesToCsv, buildExport, daysToCsv, parseImport } from '../data/portable'
import { biometricAvailable, disableLock, lockNow, registerBiometric, setPin, validPin } from '../lib/lock'
import { isSessionValid, session, signOut } from '../sync/garmin'
import Badge from '../components/Badge'
import Button from '../components/Button'
import Card from '../components/Card'
import ConfirmDialog from '../components/ConfirmDialog'
import Icon from '../components/Icon'
import KeyValue from '../components/KeyValue'
import PageHeader from '../components/PageHeader'
import SectionTitle from '../components/SectionTitle'
import Segmented from '../components/Segmented'
import Sheet from '../components/Sheet'
import { toast } from '../components/toast'
import '../styles/settings.css'

const VERSION = '2.0.0'
const REPO = 'https://github.com/truedevopsmk-lab/MK-Fitness-Tracking'
const THEMES = [{ value: 'night', label: 'Night' }, { value: 'day', label: 'Day' }, { value: 'color', label: 'Color' }, { value: 'auto', label: 'Auto' }]
const START = [{ value: 'today', label: 'Today' }, { value: 'morning', label: 'Morning check' }]
const HISTORY = [{ value: 90, label: '90 days' }, { value: 180, label: '180 days' }, { value: 365, label: '365 days' }]
const PERDAY = [{ value: 30, label: '30 days' }, { value: 60, label: '60 days' }, { value: 90, label: '90 days' }]
const AFTER = [{ value: 1, label: '1 min' }, { value: 5, label: '5 min' }, { value: 15, label: '15 min' }]

const bytes = n => n == null ? '—' : n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`

function NameField({ value, placeholder }) {
  const [draft, setDraft] = useState(value || '')
  useEffect(() => setDraft(value || ''), [value])
  const commit = () => { const v = draft.trim().slice(0, 40); if (v !== (value || '')) { setPrefs({ displayName: v }); toast(v ? `Hello, ${v}` : 'Name cleared') } }
  return <input className="input" type="text" value={draft} maxLength={40} autoComplete="given-name" enterKeyHint="done"
    placeholder={placeholder} aria-label="Your name" onChange={e => setDraft(e.target.value)} onBlur={commit}
    onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} />
}

function Row({ title, hint, children, stack }) {
  return <div className={`set-row${stack ? ' is-stack' : ''}`}>
    <div className="set-row-text"><div className="set-row-title">{title}</div>{hint && <div className="set-row-hint">{hint}</div>}</div>
    <div className="set-row-ctl">{children}</div>
  </div>
}

function Switch({ checked, onChange, label }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className={`switch${checked ? ' is-on' : ''}`} onClick={() => onChange(!checked)}><i /></button>
}

function PinSheet({ open, onClose, onDone }) {
  const [a, setA] = useState(''), [b, setB] = useState(''), [err, setErr] = useState('')
  useEffect(() => { if (open) { setA(''); setB(''); setErr('') } }, [open])
  const save = async () => {
    if (!validPin(a)) return setErr('Use 4 to 6 digits.')
    if (a !== b) return setErr('The two PINs do not match.')
    try { await setPin(a); onDone() } catch (e) { setErr(e.message) }
  }
  return <Sheet open={open} onClose={onClose} title="Set a PIN" size="sm" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Save PIN</Button></>}>
    <div className="set-form">
      <label className="field"><span className="field-label">PIN (4 to 6 digits)</span><input className="input" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={a} onChange={e => { setA(e.target.value.replace(/\D/g, '')); setErr('') }} data-autofocus /></label>
      <label className="field"><span className="field-label">Repeat PIN</span><input className="input" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={b} onChange={e => { setB(e.target.value.replace(/\D/g, '')); setErr('') }} /></label>
      {err && <p className="set-error" role="alert"><Icon name="alert" size={16} />{err}</p>}
    </div>
  </Sheet>
}

export default function Settings() {
  const prefs = usePrefs()
  const profile = useStore(s => s.profile)
  const garminName = resolveName('', profile)
  const source = useStore(s => s.source), syncMeta = useStore(s => s.syncMeta)
  const days = useStore(s => s.days), activities = useStore(s => s.activities), journal = useStore(s => s.journal)
  const [usage, setUsage] = useState(null)
  const [confirm, setConfirm] = useState(null) // 'source' | 'clear' | 'signout' | 'import'
  const [typed, setTyped] = useState('')
  const [imp, setImp] = useState(null) // { name, parsed } | { name, error }
  const [bioOk, setBioOk] = useState(false)
  const [pinOpen, setPinOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)
  const demo = source === 'demo'
  const hasSession = !!session()?.accessToken

  const dayCount = useMemo(() => Object.keys(days).length, [days])
  const journalCount = useMemo(() => Object.keys(journal).length, [journal])
  const cov = useMemo(() => {
    if (syncMeta.coverage) return syncMeta.coverage
    const k = Object.keys(days).sort()
    return k.length ? { first: k[0], last: k.at(-1) } : null
  }, [syncMeta.coverage, days])
  useEffect(() => { estimateUsage().then(setUsage) }, [dayCount, activities.length])
  useEffect(() => { biometricAvailable().then(setBioOk) }, [])

  const stamp = today()
  const exportJson = () => { downloadFile(`mk-fitness-export-${stamp}.json`, JSON.stringify(buildExport(getState()), null, 1), 'application/json'); toast('Export ready', { tone: 'good' }) }
  const exportDays = () => { downloadFile(`mk-fitness-daily-${stamp}.csv`, daysToCsv(days)); toast('Daily metrics CSV ready', { tone: 'good' }) }
  const exportActs = () => { downloadFile(`mk-fitness-activities-${stamp}.csv`, activitiesToCsv(activities)); toast('Activities CSV ready', { tone: 'good' }) }
  const empty = dayCount === 0 && activities.length === 0 && journalCount === 0

  const pickFile = async e => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try { setImp({ name: file.name, parsed: parseImport(await file.text()) }) } catch (err) { setImp({ name: file.name, error: err.message }) }
  }
  const doImport = async () => {
    const parsed = imp.parsed
    setConfirm(null); setBusy(true)
    try {
      const r = await actions.importData(parsed)
      toast(`Imported ${fmtNumber(r.days)} new or changed days${r.journal ? ',' : ' and'} ${fmtNumber(r.activities)} activities${r.journal ? ` and ${fmtNumber(r.journal)} journal days` : ''}`, { tone: 'good' })
      setImp(null)
    } catch (err) { toast(`Import failed: ${err.message}`, { tone: 'critical' }) }
    setBusy(false)
  }

  const enableBio = async () => {
    try { await registerBiometric(); toast('Face ID / Touch ID lock is on', { tone: 'good' }) } catch (e) { toast(e?.name === 'NotAllowedError' ? 'Setup was cancelled' : (e.message || 'Could not set up biometrics'), { tone: 'warning' }) }
  }
  const switchLock = on => { if (!on) { disableLock(); toast('App lock is off') } else if (bioOk) enableBio(); else setPinOpen(true) }
  const method = prefs.lockMethod
  const pickMethod = m => { if (m === method) return; if (m === 'biometric') enableBio(); else setPinOpen(true) }

  const doClear = async () => { await actions.clearLocalData(); disableLock(); setConfirm(null); setTyped(''); toast('Local data cleared', { tone: 'good' }) }
  const doSignOut = () => { signOut(); setConfirm(null); toast('Signed out of Garmin on this device'); location.hash = '#/sync' }

  const lastSynced = syncMeta.lastSuccessAt ? fmtAgo(syncMeta.lastSuccessAt) : 'Never'

  return <div className="page page-fade settings-page">
    <PageHeader title="Settings" subtitle="Data, appearance, privacy and backups" />

    <section className="set-sec">
      <SectionTitle>Profile</SectionTitle>
      <Card>
        <Row title="Your name" hint={`Used in the greeting. Stays on this device.${!prefs.displayName && garminName ? ` Garmin's name: ${garminName}.` : ''}`} stack>
          <NameField value={prefs.displayName} placeholder={garminName || 'e.g. Asha'} />
        </Row>
      </Card>
    </section>

    <section className="set-sec" aria-labelledby="s-source">
      <SectionTitle>Data source</SectionTitle>
      <Card>
        <div className="set-source">
          <Badge tone={demo ? 'accent' : 'good'} icon={false}>{demo ? 'Demo data' : 'Garmin'}</Badge>
          <p className="set-lead">{demo ? 'You are exploring generated demo data. Nothing here is yours and nothing is sent anywhere.' : 'Showing the Garmin data stored on this device.'}</p>
        </div>
        <KeyValue rows={[
          { label: 'Last synced', value: demo ? 'Not applicable' : lastSynced },
          { label: 'Coverage', value: cov ? `${fmtDay(cov.first, { day: 'numeric', month: 'short', year: 'numeric' })} to ${cov.last >= stamp ? 'today' : fmtDay(cov.last, { day: 'numeric', month: 'short', year: 'numeric' })}` : 'No data yet' },
          { label: 'Stored', value: `${fmtNumber(dayCount)} days, ${fmtNumber(activities.length)} activities${journalCount > 0 ? `, ${fmtNumber(journalCount)} journal days` : ''}` },
          { label: 'Storage used', value: usage ? `${bytes(usage.usage)}` : 'Unknown', hint: 'Whole app, including cached files' },
        ]} />
        <div className="set-actions">
          <Button href="#/sync" icon="sync">Open Sync Center</Button>
          <Button icon="link" onClick={() => setConfirm('source')}>{demo ? 'Switch to my Garmin data' : 'Switch to demo data'}</Button>
        </div>
      </Card>
    </section>

    <section className="set-sec">
      <SectionTitle>Appearance</SectionTitle>
      <Card>
        <Row title="Theme" stack><Segmented value={prefs.theme} onChange={theme => setPrefs({ theme })} options={THEMES} label="Theme" /></Row>
        <Row title="Start page" hint="Opens when you launch the app." stack><Segmented value={prefs.startPage} onChange={startPage => setPrefs({ startPage })} options={START} label="Start page" /></Row>
      </Card>
    </section>

    <section className="set-sec">
      <SectionTitle>Sync preferences</SectionTitle>
      <Card>
        <Row title="Sync when I open the app" hint="Fetches new data if the last sync is over 30 minutes old."><Switch checked={!!prefs.autoSync} onChange={autoSync => setPrefs({ autoSync })} label="Sync when I open the app" /></Row>
        <Row title="Full sync history" hint="How far back a full sync reaches for daily summaries." stack><Segmented value={prefs.historyDays} onChange={historyDays => setPrefs({ historyDays })} options={HISTORY} label="History depth" /></Row>
        <Row title="Per-day detail depth" hint="Some data needs one request per day, so deeper means a slower full sync." stack><Segmented value={prefs.perDayDays} onChange={perDayDays => setPrefs({ perDayDays })} options={PERDAY} label="Per-day depth" /></Row>
        <Row title="Sleep need" hint="Used for sleep debt, the recovery estimate and tonight’s bedtime when Garmin does not provide your sleep need." stack>
          <Segmented value={prefs.sleepNeedHours} onChange={sleepNeedHours => setPrefs({ sleepNeedHours })} options={SLEEP_NEED_OPTIONS.map(v => ({ value: v, label: `${v} h` }))} label="Sleep need in hours" />
        </Row>
      </Card>
    </section>

    <section className="set-sec">
      <SectionTitle>Export</SectionTitle>
      <Card>
        <p className="set-lead">Files are created on this device and stay here until you share or move them.</p>
        {empty && <p className="set-hint">There is no data to export yet.</p>}
        <div className="set-list">
          <button type="button" className="set-item" disabled={empty} onClick={exportJson}><span className="set-ico"><Icon name="download" size={20} /></span><span className="set-item-text"><b>All data (JSON)</b><small>Full backup you can import again</small></span><Icon name="chevron-right" size={18} /></button>
          <button type="button" className="set-item" disabled={!dayCount} onClick={exportDays}><span className="set-ico"><Icon name="download" size={20} /></span><span className="set-item-text"><b>Daily metrics (CSV)</b><small>One row per day, for spreadsheets</small></span><Icon name="chevron-right" size={18} /></button>
          <button type="button" className="set-item" disabled={!activities.length} onClick={exportActs}><span className="set-ico"><Icon name="download" size={20} /></span><span className="set-item-text"><b>Activities (CSV)</b><small>One row per workout</small></span><Icon name="chevron-right" size={18} /></button>
        </div>
      </Card>
    </section>

    <section className="set-sec">
      <SectionTitle>Import</SectionTitle>
      <Card>
        <p className="set-lead">Restore from an MK Fitness JSON export. CSV files cannot be imported. Importing merges with what is here and never deletes anything.</p>
        <input ref={fileRef} type="file" accept="application/json,.json" className="set-file" onChange={pickFile} aria-label="Choose an export file" />
        <Button icon="upload" loading={busy} onClick={() => fileRef.current?.click()}>Choose JSON file</Button>
        {imp?.error && <p className="set-error" role="alert"><Icon name="alert" size={16} /><span><b>{imp.name}</b>: {imp.error}</span></p>}
        {imp?.parsed && <div className="set-preview">
          <div className="set-preview-name"><Icon name="check" size={16} />{imp.name}</div>
          <KeyValue rows={[
            { label: 'Days', value: fmtNumber(imp.parsed.summary.days) },
            { label: 'Activities', value: fmtNumber(imp.parsed.summary.activities) },
            ...(imp.parsed.summary.journal > 0 ? [{ label: 'Journal days', value: fmtNumber(imp.parsed.summary.journal) }] : []),
            { label: 'Date range', value: imp.parsed.summary.from ? `${fmtDay(imp.parsed.summary.from, { day: 'numeric', month: 'short', year: 'numeric' })} to ${fmtDay(imp.parsed.summary.to, { day: 'numeric', month: 'short', year: 'numeric' })}` : '—' },
          ]} />
          <div className="set-actions"><Button variant="primary" onClick={() => setConfirm('import')}>Import this data</Button><Button variant="ghost" onClick={() => setImp(null)}>Cancel</Button></div>
        </div>}
      </Card>
    </section>

    <section className="set-sec">
      <SectionTitle>App lock</SectionTitle>
      <Card>
        <Row title="Lock the app" hint={prefs.lockEnabled ? (method === 'biometric' ? 'Unlocks with Face ID or Touch ID.' : 'Unlocks with your PIN.') : 'Ask to unlock when the app opens.'}><Switch checked={!!prefs.lockEnabled} onChange={switchLock} label="Lock the app" /></Row>
        {prefs.lockEnabled && <>
          <Row title="Method" stack><Segmented value={method} onChange={pickMethod} label="Lock method" options={[...(bioOk || method === 'biometric' ? [{ value: 'biometric', label: 'Face ID / Touch ID' }] : []), { value: 'pin', label: 'PIN' }]} /></Row>
          {method === 'pin' && <Row title="PIN" hint="Stored only as a salted hash."><Button size="sm" onClick={() => setPinOpen(true)}>Change PIN</Button></Row>}
          <Row title="Lock after" hint="Time in the background before the app locks again." stack><Segmented value={prefs.lockAfterMin} onChange={lockAfterMin => setPrefs({ lockAfterMin })} options={AFTER} label="Auto-lock delay" /></Row>
          <div className="set-actions"><Button icon="lock" onClick={lockNow}>Lock now</Button></div>
        </>}
        {!bioOk && !prefs.lockEnabled && <p className="set-hint">Face ID and Touch ID are not available here, so a PIN is used.</p>}
        <p className="set-note"><Icon name="alert" size={16} />This lock keeps casual eyes out on a shared device. Your data is stored unencrypted in this browser.</p>
      </Card>
    </section>

    <section className="set-sec">
      <SectionTitle>Privacy</SectionTitle>
      <Card>
        <ul className="set-bullets">
          <li><b>Health data</b> is stored in this browser, on this device.</li>
          <li><b>Your Garmin session token</b> is kept on this device. Your Personal API key is never stored.</li>
          <li><b>Nothing is sent anywhere</b> except requests to Garmin through the proxy you configured.</li>
          <li><b>No analytics, no accounts, no cloud copy.</b> Backups happen only when you export.</li>
        </ul>
        <p className="set-note"><Icon name="alert" size={16} />Never commit personal exports to GitHub. Keep them somewhere private.</p>
      </Card>
    </section>

    <section className="set-sec">
      <SectionTitle>Danger zone</SectionTitle>
      <Card className="set-danger">
        <Row title="Clear local data" hint="Deletes all health data stored on this device. Your Garmin session and preferences stay."><Button variant="danger" size="sm" onClick={() => { setTyped(''); setConfirm('clear') }}>Clear data</Button></Row>
        <Row title="Sign out of Garmin" hint={hasSession ? (isSessionValid() ? 'Removes the session token from this device.' : 'Your session has expired. This removes the old token.') : 'No Garmin session on this device.'}><Button variant="danger" size="sm" disabled={!hasSession} onClick={() => setConfirm('signout')}>Sign out</Button></Row>
      </Card>
    </section>

    <footer className="set-foot">
      <span>MK Fitness {VERSION}</span>
      <span className="set-foot-dot" aria-hidden="true" />
      <span>{demo ? 'Demo data' : 'Garmin data'}</span>
      <span className="set-foot-dot" aria-hidden="true" />
      <a href={REPO} target="_blank" rel="noopener noreferrer">GitHub</a>
    </footer>

    <PinSheet open={pinOpen} onClose={() => setPinOpen(false)} onDone={() => { setPinOpen(false); toast('PIN lock is on', { tone: 'good' }) }} />

    {confirm === 'source' && <ConfirmDialog title={demo ? 'Switch to your Garmin data?' : 'Switch to demo data?'} confirmLabel="Switch and reload"
      body={demo ? 'The app reloads and shows the data stored from your Garmin account. Demo data stays separate.' : 'The app reloads and shows generated demo data. Your Garmin data stays on this device, untouched.'}
      onConfirm={() => actions.switchSource(demo ? 'garmin' : 'demo')} onCancel={() => setConfirm(null)} />}
    {confirm === 'import' && imp?.parsed && <ConfirmDialog title="Import this data?" confirmLabel="Import"
      body={`${fmtNumber(imp.parsed.summary.days)} days${imp.parsed.summary.journal > 0 ? ',' : ' and'} ${fmtNumber(imp.parsed.summary.activities)} activities${imp.parsed.summary.journal > 0 ? ` and ${fmtNumber(imp.parsed.summary.journal)} journal days` : ''} will be merged into ${demo ? 'the demo data' : 'your data'}. Nothing is deleted.`}
      onConfirm={doImport} onCancel={() => setConfirm(null)} />}
    {confirm === 'signout' && <ConfirmDialog tone="danger" title="Sign out of Garmin?" confirmLabel="Sign out"
      body="This removes the session token from this device. Cached data stays unless you also clear it. To fully revoke access, revoke the Personal API key in your Garmin Connect settings."
      onConfirm={doSignOut} onCancel={() => setConfirm(null)} />}
    {confirm === 'clear' && <Sheet open onClose={() => setConfirm(null)} title="Clear local data?" size="sm"
      footer={<><Button variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button><Button variant="danger" disabled={typed !== 'DELETE'} onClick={doClear}>Delete everything</Button></>}>
      <p className="muted">This permanently deletes {fmtNumber(dayCount)} days{journalCount > 0 ? ',' : ' and'} {fmtNumber(activities.length)} activities{journalCount > 0 && ` and ${fmtNumber(journalCount)} journal days`} from this device and turns off the app lock. Export first if you want a backup.</p>
      <label className="field set-confirm"><span className="field-label">Type DELETE to confirm</span><input className="input" value={typed} onChange={e => setTyped(e.target.value)} autoCapitalize="characters" autoComplete="off" spellCheck={false} data-autofocus /></label>
    </Sheet>}
  </div>
}
