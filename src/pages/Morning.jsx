import { useMemo } from 'react'
import { useDisplayName, withName } from '../lib/name'
import '../styles/home.css'
import { useStore } from '../state/store'
import { usePrefs } from '../lib/prefs'
import { today } from '../lib/dates'
import { fmtDuration } from '../lib/format'
import { METRICS, SLEEP_STAGES, hrvStatusBand } from '../lib/metrics'
import { latestValue } from '../data/select'
import { bodyBatteryNow, deltaVs7, greetingFor, headlineFor, recommendationFor, recoveryFor, whenLabel } from '../lib/homeLogic'
import { Badge, Button, Card, Empty, Icon, Ring } from '../components'

const hueStyle = h => ({ '--m-hue': `var(--hue-${h})` })

export default function Morning() {
  const days = useStore(s => s.days)
  const profile = useStore(s => s.profile)
  const name = useDisplayName()
  const asOf = today(), { sleepNeedHours } = usePrefs()
  const rec = useMemo(() => recoveryFor(days, asOf, { sleepNeedHours }), [days, asOf, sleepNeedHours])
  if (!Object.keys(days).length) return <div className="page morning"><Card><Empty icon="sync" title="No data yet" body="Sync with Garmin to see your morning check." action={<Button variant="primary" href="#/sync" icon="sync">Open Sync Center</Button>} /></Card></div>

  const sleep = latestValue(days, 'sleepScore', { asOf }), bb = latestValue(days, 'bodyBatteryHigh', { asOf })
  const hrv = latestValue(days, 'hrv', { asOf }), rhr = latestValue(days, 'restingHr', { asOf })
  const s = sleep?.record.sleep
  const stages = s ? SLEEP_STAGES.map(st => ({ ...st, sec: s[st.field] || 0 })).filter(st => st.sec > 0) : []
  const total = stages.reduce((a, x) => a + x.sec, 0)
  const band = sleep ? METRICS.sleepScore.band(sleep.value) : null
  const hb = hrvStatusBand(hrv?.record.hrv?.status)
  const rd = deltaVs7(days, 'restingHr', asOf)
  const bbNow = bb ? bodyBatteryNow(bb.record) : null
  const bbBand = bbNow != null ? METRICS.bodyBatteryHigh.band(bbNow) : null

  return <div className="page morning">
    <h1 className="page-title morning-title">{withName(greetingFor(), name)}</h1>
    <Card className="morning-card" href="#/sleep" style={hueStyle('sleep')}>
      <span className="morning-label"><i className="tile-dot" aria-hidden="true" />Sleep · {sleep ? whenLabel(sleep.date, asOf, true) : 'no data'}</span>
      <div className="morning-row">
        <div className="morning-big num">{sleep ? Math.round(sleep.value) : '—'}<small>{s?.durationSec ? fmtDuration(s.durationSec) : ''}</small></div>
        {band && <Badge tone={band.tone}>{band.label}</Badge>}
      </div>
      {total > 0 && <>
        <div className="stagebar" role="img" aria-label="Sleep stages">{stages.map(st => <i key={st.key} style={{ flex: st.sec, background: st.color }} />)}</div>
        <div className="stagekey">{stages.map(st => <span key={st.key}><i style={{ background: st.color }} />{st.label} {fmtDuration(st.sec)}</span>)}</div>
      </>}
    </Card>

    <div className="morning-pair">
      <Card className="morning-card" href="#/trends/bodyBatteryHigh" style={hueStyle('battery')}>
        <span className="morning-label"><i className="tile-dot" aria-hidden="true" />Body Battery</span>
        <div className="morning-big num">{bbNow ?? '—'}</div>
        {bbBand && <Badge tone={bbBand.tone}>{bbBand.label}</Badge>}
      </Card>
      <Card className="morning-card" href="#/reports/recovery" style={hueStyle('readiness')}>
        <span className="morning-label"><i className="tile-dot" aria-hidden="true" />{rec.kind === 'garmin' ? 'Readiness' : 'Recovery'}</span>
        <div className="morning-row"><Ring value={rec.score} hue="readiness" size={64} thickness={8} /></div>
        {rec.kind === 'estimate' && <span className="tile-sub">Estimate</span>}
      </Card>
      <Card className="morning-card" href="#/trends/hrv" style={hueStyle('hrv')}>
        <span className="morning-label"><i className="tile-dot" aria-hidden="true" />HRV</span>
        <div className="morning-mid num">{hrv ? Math.round(hrv.value) : '—'}<small>ms</small></div>
        {hb ? <Badge tone={hb.tone}>{hb.label}</Badge> : null}
      </Card>
      <Card className="morning-card" href="#/trends/restingHr" style={hueStyle('heart')}>
        <span className="morning-label"><i className="tile-dot" aria-hidden="true" />Resting HR</span>
        <div className="morning-mid num">{rhr ? Math.round(rhr.value) : '—'}<small>bpm</small></div>
        {rd && <span className="tile-sub">{Math.abs(rd.delta) < .5 ? 'Same as' : `${Math.abs(Math.round(rd.delta))} ${rd.delta < 0 ? 'below' : 'above'}`} 7-day avg</span>}
      </Card>
    </div>

    <Card className="morning-card">
      <p className="morning-reco"><strong>{headlineFor(rec.score)}</strong>{recommendationFor(rec.score)}</p>
    </Card>
    <a className="morning-link" href="#/">Full dashboard<Icon name="chevron-right" size={18} /></a>
  </div>
}
