import { useMemo, useState } from 'react'
import { useStore } from '../state/store'
import { fmtClock, fmtDay, fmtDuration, fmtNumber } from '../lib/format'
import { HR_ZONES, activityContext, fmtKm, paceOrSpeed, sortActivities, trainingEffect, typeGroup, typeName, GROUP } from '../lib/activities'
import { href } from '../router'
import Badge from '../components/Badge'
import Button from '../components/Button'
import Card from '../components/Card'
import Empty from '../components/Empty'
import Icon from '../components/Icon'
import PageHeader from '../components/PageHeader'
import { TypeBadge } from './Activities'
import '../styles/activities.css'

function Stat({ label, value, unit, sub }) {
  const has = value != null && value !== '' && value !== '—'
  return <div className="ad-stat">
    <span className="ad-stat-label">{label}</span>
    <span className="ad-stat-value num">{has ? value : '—'}{has && unit && <small>{unit}</small>}</span>
    {sub && <span className="ad-stat-sub">{sub}</span>}
  </div>
}

function Zones({ secs }) {
  const total = secs.reduce((a, b) => a + (b || 0), 0)
  if (!(total > 0)) return null
  return <Card title="Heart rate zones" subtitle="Time spent in each zone">
    <div className="ad-zbar" role="img" aria-label={`Time in heart rate zones: ${HR_ZONES.map((z, i) => `${z.label} ${fmtDuration(secs[i] || 0)}`).join(', ')}`}>
      {HR_ZONES.map((z, i) => secs[i] > 0 && <i key={z.key} style={{ flexGrow: secs[i], background: `var(--zone-${z.key})` }} />)}
    </div>
    <ul className="ad-zlist">
      {HR_ZONES.map((z, i) => {
        const s = secs[i] || 0, pct = Math.round(s / total * 100)
        return <li key={z.key}><i style={{ background: `var(--zone-${z.key})` }} /><span className="ad-zname">{z.label}<small>{z.note}</small></span>
          <span className="ad-ztime num">{s ? fmtDuration(s) : '—'}</span><span className="ad-zpct num">{pct}%</span></li>
      })}
    </ul>
  </Card>
}

function Effect({ label, v }) {
  if (v == null) return null
  const w = trainingEffect(v)
  return <div className="ad-te">
    <div className="ad-te-top"><span>{label}</span><strong className="num">{v.toFixed(1)}</strong></div>
    <div className="ad-te-track" aria-hidden="true"><i style={{ width: `${Math.min(100, v / 5 * 100)}%` }} /></div>
    <Badge tone={v >= 5 ? 'serious' : v >= 3 ? 'good' : 'neutral'}>{w}</Badge>
  </div>
}

export default function ActivityDetail({ id }) {
  const activities = useStore(s => s.activities)
  const sorted = useMemo(() => sortActivities(activities), [activities])
  const idx = sorted.findIndex(a => String(a.id) === String(id))
  const a = sorted[idx]
  const ctx = useMemo(() => a ? activityContext(a, sorted) : null, [a, sorted])
  const [rawOpen, setRawOpen] = useState(false)

  if (!a) return <div className="page page-fade">
    <PageHeader title="Activity" back="#/activities" />
    <Empty icon="activity" title="Activity not found" body="It may not have synced yet, or the link is out of date." action={<Button variant="primary" href="#/activities">All activities</Button>} />
  </div>

  const newer = sorted[idx - 1], older = sorted[idx + 1], g = typeGroup(a.type), ps = paceOrSpeed(a)
  const link = x => href(`/activities/${encodeURIComponent(x.id)}`)
  const hasZones = Array.isArray(a.hrZonesSec) && a.hrZonesSec.some(v => v > 0)
  const when = `${fmtDay(a.day, { weekday: 'long', day: 'numeric', month: 'long' })}${a.startTs != null ? `, ${fmtClock(a.startTs)}` : ''}`
  const context = ctx && `Your ${ctx.nth} ${GROUP[g].label.toLowerCase()} this month${ctx.compare ? ` · ${ctx.compare}` : ''}`

  return <div className="page page-fade ad" style={{ '--act-hue': `var(--hue-${GROUP[g].hue})` }}>
    <PageHeader title={a.name || typeName(a.type)} subtitle={when} back="#/activities" />
    <div className="ad-hero">
      <TypeBadge type={a.type} size={52} />
      <div>
        <div className="ad-type">{typeName(a.type)}</div>
        {context && <p className="ad-context">{context}</p>}
      </div>
    </div>

    <div className="ad-stats">
      <Stat label="Distance" value={a.distanceM > 0 ? fmtKm(a.distanceM) : null} unit="km" />
      <Stat label="Duration" value={fmtDuration(a.durationSec)} sub={a.movingSec && a.durationSec && Math.abs(a.durationSec - a.movingSec) > 60 ? `Moving ${fmtDuration(a.movingSec)}` : null} />
      {ps ? <Stat label={ps.label} value={ps.value} unit={ps.unit} /> : <Stat label="Moving time" value={a.movingSec ? fmtDuration(a.movingSec) : null} />}
      <Stat label="Average heart rate" value={a.avgHr != null ? fmtNumber(a.avgHr) : null} unit="bpm" />
      <Stat label="Max heart rate" value={a.maxHr != null ? fmtNumber(a.maxHr) : null} unit="bpm" />
      <Stat label="Calories" value={a.calories != null ? fmtNumber(a.calories) : null} unit="kcal" />
      <Stat label="Elevation gain" value={a.elevationGainM != null ? fmtNumber(a.elevationGainM) : null} unit="m" />
      <Stat label="Training load" value={a.trainingLoad != null ? fmtNumber(a.trainingLoad) : null} />
      {a.steps != null && <Stat label="Steps" value={fmtNumber(a.steps)} />}
    </div>

    {(a.aerobicTE != null || a.anaerobicTE != null) && <Card title="Training effect" subtitle="How much this session built fitness, on Garmin's 0 to 5 scale">
      <div className="ad-te-grid"><Effect label="Aerobic" v={a.aerobicTE} /><Effect label="Anaerobic" v={a.anaerobicTE} /></div>
    </Card>}

    {hasZones && <Zones secs={a.hrZonesSec} />}

    <div className="ad-nav">
      {older ? <a className="ad-nav-btn" href={link(older)}><Icon name="chevron-left" size={18} /><span><small>Previous</small>{older.name || typeName(older.type)}<em>{fmtDay(older.day)}</em></span></a> : <span />}
      {newer ? <a className="ad-nav-btn is-next" href={link(newer)}><span><small>Next</small>{newer.name || typeName(newer.type)}<em>{fmtDay(newer.day)}</em></span><Icon name="chevron-right" size={18} /></a> : <span />}
    </div>

    <section className="ad-raw">
      <button type="button" className="ad-raw-btn" aria-expanded={rawOpen} onClick={() => setRawOpen(v => !v)}>
        <span>Raw Garmin data</span><Icon name="chevron-down" size={18} className={rawOpen ? 'is-open' : ''} />
      </button>
      {rawOpen && (a.raw ? <pre className="ad-pre">{JSON.stringify(a.raw, null, 2)}</pre> : <p className="ad-raw-none">No raw data was kept for this activity.</p>)}
    </section>
  </div>
}
