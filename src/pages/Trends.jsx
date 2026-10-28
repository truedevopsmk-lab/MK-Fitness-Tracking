import { useMemo } from 'react'
import { useStore } from '../state/store'
import { href } from '../router'
import { METRICS, deltaTone, valueOf } from '../lib/metrics'
import { dataBounds, latestValue, metricSeries } from '../data/select'
import { summarize } from '../lib/stats'
import { addDays, today } from '../lib/dates'
import { fmtDay, fmtPct } from '../lib/format'
import Sparkline from '../charts/Sparkline'
import Button from '../components/Button'
import Card from '../components/Card'
import DeltaChip from '../components/DeltaChip'
import Empty from '../components/Empty'
import Icon from '../components/Icon'
import PageHeader from '../components/PageHeader'
import SectionTitle from '../components/SectionTitle'
import '../styles/trends.css'

const dateContext = (date, asOf) => {
  const age = Math.round((new Date(asOf.replace(/-/g, '/')) - new Date(date.replace(/-/g, '/'))) / 86400000)
  return age === 0 ? 'Today' : age === 1 ? 'Yesterday' : fmtDay(date)
}

function TrendRow({ k, row }) {
  const m = METRICS[k], { latest, spark, summary } = row
  const band = latest && m.band ? m.band(latest.value) : null
  return <a className="trend-row" href={href(`/trends/${k}`)} style={{ '--tile-hue': `var(--hue-${m.hue})` }}>
    <div className="trend-row-top">
      <span className="tile-label"><i className="tile-dot" />{m.label}</span>
      <Icon name="chevron-right" size={16} className="tile-chev" />
    </div>
    <div className="trend-row-main">
      <div className="trend-row-val">
        <span className="tile-value num">{latest ? m.format(latest.value) : '—'}</span>
        <span className="tile-sub">{latest ? dateContext(latest.date, row.asOf) : 'No data in 30 days'}{band ? ` · ${band.label}` : ''}</span>
      </div>
      <div className="trend-row-spark">
        <Sparkline data={spark} hue={m.hue} height={44} label={`${m.label}, last 30 days`} />
      </div>
    </div>
    <div className="trend-row-delta">
      {summary.change != null
        ? <DeltaChip delta={summary.delta} metricKey={k} tone={deltaTone(k, summary.delta)} text={Math.abs(summary.change) < 0.5 ? '0%' : fmtPct(summary.change, 0)} note="vs previous 30 days" />
        : <span className="tile-sub">No comparison yet</span>}
    </div>
  </a>
}

export default function Trends() {
  const days = useStore(s => s.days)
  const model = useMemo(() => {
    const asOf = today(), from = addDays(asOf, -29), pFrom = addDays(asOf, -59), pTo = addDays(asOf, -30)
    const rows = {}
    for (const k of Object.keys(METRICS)) {
      const spark = metricSeries(days, k, from, asOf)
      rows[k] = { asOf, spark, latest: latestValue(days, k, { asOf }), summary: summarize(spark, metricSeries(days, k, pFrom, pTo)) }
    }
    const groups = []
    for (const k of Object.keys(METRICS)) {
      if (!Object.values(days).some(d => valueOf(k, d) != null)) continue
      const g = METRICS[k].group
      let grp = groups.find(x => x.name === g)
      if (!grp) groups.push(grp = { name: g, keys: [] })
      grp.keys.push(k)
    }
    return { rows, groups }
  }, [days])
  const hasAny = dataBounds(days) != null

  return <div className="page page-fade">
    <PageHeader title="Trends" subtitle="Every metric over the last 30 days" />
    {!hasAny
      ? <Card><Empty icon="trends" title="No data yet" body="Sync your Garmin data to see trends for sleep, stress, heart and activity." action={<Button variant="primary" href="#/sync">Open Sync Center</Button>} /></Card>
      : model.groups.map(grp => <section key={grp.name} className="trend-group">
        <SectionTitle>{grp.name}</SectionTitle>
        <div className="trend-rows">{grp.keys.map(k => <TrendRow key={k} k={k} row={model.rows[k]} />)}</div>
      </section>)}
  </div>
}
