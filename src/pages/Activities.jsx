import { useMemo, useState } from 'react'
import { useStore } from '../state/store'
import { addDays, today, weekStart } from '../lib/dates'
import { fmtClock, fmtDay, fmtDuration, fmtNumber } from '../lib/format'
import { GROUP, TYPE_GROUPS, fmtKm, paceOrSpeed, sortActivities, typeGroup, typeName } from '../lib/activities'
import { href } from '../router'
import Button from '../components/Button'
import Empty from '../components/Empty'
import Card from '../components/Card'
import Icon from '../components/Icon'
import PageHeader from '../components/PageHeader'
import '../styles/activities.css'

const PAGE = 50
const chipStyle = hue => ({ '--act-hue': `var(--hue-${hue})` })

export function TypeBadge({ type, size = 44 }) {
  const g = GROUP[typeGroup(type)]
  return <span className="act-ico" style={{ ...chipStyle(g.hue), width: size, height: size }}><Icon name={g.icon} size={Math.round(size * .5)} /></span>
}

function weekLabel(key, now) {
  const cur = weekStart(now)
  if (key === cur) return 'This week'
  if (key === addDays(cur, -7)) return 'Last week'
  const end = addDays(key, 6), a = fmtDay(key, { day: 'numeric' }), b = fmtDay(end, { day: 'numeric', month: 'short' })
  return key.slice(5, 7) === end.slice(5, 7) ? `${a} – ${b}` : `${fmtDay(key, { day: 'numeric', month: 'short' })} – ${b}`
}

function Row({ a }) {
  const ps = paceOrSpeed(a)
  return <li><a className="act-row" href={href(`/activities/${encodeURIComponent(a.id)}`)}>
    <TypeBadge type={a.type} />
    <div className="act-main">
      <div className="act-name">{a.name || typeName(a.type)}</div>
      <div className="act-when">{fmtDay(a.day, { weekday: 'short', day: 'numeric', month: 'short' })}{a.startTs != null && `, ${fmtClock(a.startTs)}`}</div>
      <div className="act-meta">
        {a.durationSec != null && <span>{fmtDuration(a.durationSec)}</span>}
        {ps && <span>{ps.value} <small>{ps.unit}</small></span>}
        {a.avgHr != null && <span><Icon name="heart" size={13} />{fmtNumber(a.avgHr)} <small>bpm</small></span>}
        {a.trainingLoad != null && <span>Load {fmtNumber(a.trainingLoad)}</span>}
      </div>
    </div>
    <div className="act-dist num">{a.distanceM > 0 ? <>{fmtKm(a.distanceM)}<small>km</small></> : <span className="act-dist-none">{fmtDuration(a.durationSec)}</span>}</div>
    <Icon name="chevron-right" size={16} className="act-chev" />
  </a></li>
}

export default function Activities() {
  const activities = useStore(s => s.activities)
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [shown, setShown] = useState(PAGE)
  const now = today()

  const sorted = useMemo(() => sortActivities(activities), [activities])
  const counts = useMemo(() => {
    const c = { all: sorted.length }
    for (const a of sorted) { const g = typeGroup(a.type); c[g] = (c[g] || 0) + 1 }
    return c
  }, [sorted])
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return sorted.filter(a => (filter === 'all' || typeGroup(a.type) === filter) && (!q || `${a.name || ''} ${typeName(a.type)}`.toLowerCase().includes(q)))
  }, [sorted, filter, query])
  const groups = useMemo(() => {
    const map = new Map()
    for (const a of filtered.slice(0, shown)) { const k = weekStart(a.day); if (!map.has(k)) map.set(k, []); map.get(k).push(a) }
    // totals must cover the whole week, not just the visible slice
    const totals = new Map()
    for (const a of filtered) { const k = weekStart(a.day); if (!map.has(k)) continue; const t = totals.get(k) || { n: 0, m: 0, s: 0 }; t.n += 1; t.m += a.distanceM || 0; t.s += a.durationSec || 0; totals.set(k, t) }
    return [...map].map(([key, items]) => ({ key, items, total: totals.get(key) }))
  }, [filtered, shown])

  if (!activities.length) return <div className="page page-fade">
    <PageHeader title="Activities" subtitle="Runs, rides, walks and strength sessions" />
    <Card><Empty icon="activity" title="No activities yet" body="Sync your Garmin account to see runs, rides, walks and strength sessions here." action={<Button variant="primary" href="#/sync">Open Sync Center</Button>} /></Card>
  </div>

  const set = fn => v => { fn(v); setShown(PAGE) }
  const chips = [{ key: 'all', label: 'All' }, ...TYPE_GROUPS.map(g => ({ key: g.key, label: g.label }))].filter(c => c.key === 'all' || c.key === filter || counts[c.key])
  return <div className="page page-fade acts">
    <PageHeader title="Activities" subtitle={`${fmtNumber(sorted.length)} activities, newest first`} />
    <div className="act-tools">
      <label className="act-search">
        <input className="input" type="search" inputMode="search" placeholder="Search by name" aria-label="Search activities" value={query} onChange={e => set(setQuery)(e.target.value)} />
      </label>
      <div className="act-chips" role="radiogroup" aria-label="Activity type">
        {chips.map(c => <button key={c.key} type="button" role="radio" aria-checked={filter === c.key} className={`act-chip${filter === c.key ? ' is-on' : ''}`} onClick={() => set(setFilter)(c.key)}>
          {c.label}<span className="act-chip-n">{counts[c.key] ?? 0}</span></button>)}
      </div>
    </div>

    {!filtered.length
      ? <Empty icon="activity" title="Nothing matches" body="Try a different type or clear the search." action={<Button onClick={() => { setFilter('all'); setQuery('') }}>Clear filters</Button>} />
      : groups.map(g => <section key={g.key} className="act-week">
        <header className="act-week-head">
          <h2>{weekLabel(g.key, now)}</h2>
          <p>{g.total.n} {g.total.n === 1 ? 'activity' : 'activities'}{g.total.m > 0 && <> · {fmtKm(g.total.m)} km</>} · {fmtDuration(g.total.s)}</p>
        </header>
        <ul className="act-list">{g.items.map(a => <Row key={a.id} a={a} />)}</ul>
      </section>)}

    {filtered.length > shown && <div className="act-more"><Button onClick={() => setShown(n => n + PAGE)}>Show more ({filtered.length - shown} left)</Button></div>}
  </div>
}
