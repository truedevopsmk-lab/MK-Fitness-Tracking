import { useMemo } from 'react'
import { useStore } from '../../state/store'
import { metricSeries, latestValue } from '../../data/select'
import { eachDay } from '../../lib/dates'
import { mean, stdev, summarize } from '../../lib/stats'
import { hrvStatusBand } from '../../lib/metrics'
import { fmtDay, fmtNumber } from '../../lib/format'
import Card from '../../components/Card'
import Badge from '../../components/Badge'
import Icon from '../../components/Icon'
import ReportLayout, { HowToRead, MiniTrend, ReportNote, TableView, rangeBounds, useRange } from './ReportLayout'

const GROUPS = [
  { key: 'balanced', label: 'Balanced', tone: 'good', color: 'var(--good)', match: s => s === 'BALANCED' },
  { key: 'unbalanced', label: 'Unbalanced', tone: 'warning', color: 'var(--warning)', match: s => s === 'UNBALANCED' },
  { key: 'low', label: 'Low', tone: 'serious', color: 'var(--serious)', match: s => s === 'LOW' || s === 'POOR' },
]

export default function Hrv() {
  const days = useStore(s => s.days)
  const [range, setRange] = useRange()
  const { from, to, prevFrom, prevTo } = useMemo(() => rangeBounds(range), [range])
  const d = useMemo(() => {
    const v = metricSeries(days, 'hrv', from, to), wk = metricSeries(days, 'hrvWeekly', from, to)
    const sum = summarize(v, metricSeries(days, 'hrv', prevFrom, prevTo))
    const rows = eachDay(from, to).map((date, i) => ({ date, value: v[i].value, baseline: wk[i].value, status: days[date]?.hrv?.status?.toUpperCase() || null }))
    // 7-day mean computed from the series when Garmin's weekly average is missing
    rows.forEach((r, i) => { if (r.baseline == null) r.baseline = mean(rows.slice(Math.max(0, i - 6), i + 1).map(x => x.value)) })
    const bl = latestValue(days, 'hrv', { lookbackDays: range })
    const rec = bl && days[bl.date].hrv
    let band = null, estimated = false
    if (rec?.baselineLow != null && rec?.baselineHigh != null) band = { low: rec.baselineLow, high: rec.baselineHigh, label: 'Your balanced range' }
    else if (sum.avg != null && stdev(v.map(p => p.value)) != null) { const sd = stdev(v.map(p => p.value)); band = { low: Math.round(sum.avg - sd), high: Math.round(sum.avg + sd), label: 'Your typical range (estimated)' }; estimated = true }
    const counts = GROUPS.map(g => ({ ...g, n: rows.filter(r => r.status && g.match(r.status)).length }))
    const withStatus = counts.reduce((a, c) => a + c.n, 0)
    let streak = 0
    if (band) for (let i = rows.length - 1; i >= 0; i -= 1) { if (rows[i].value == null) { if (i === rows.length - 1) continue; break } if (rows[i].value < band.low) streak += 1; else break }
    return { rows, sum, band, estimated, counts, withStatus, streak, all: Object.values(days).some(x => x.hrv?.lastNight != null || x.sleep?.avgHrv != null), latest: rec?.status }
  }, [days, from, to, prevFrom, prevTo, range])
  const sb = hrvStatusBand(d.latest)
  const csv = () => ({ filename: `hrv-${from}_${to}.csv`, rows: d.rows, columns: [{ key: 'date', label: 'Date' }, { key: 'value', label: 'Overnight HRV (ms)' }, { key: 'baseline', label: '7-day average (ms)', value: r => r.baseline == null ? '' : Math.round(r.baseline) }, { key: 'status', label: 'Status' }] })
  return <ReportLayout title="HRV" icon="heart" hue="hrv" subtitle="Heart rate variability overnight" range={range} onRange={setRange} hasData={d.all} csv={csv}
    missing={{ missing: d.sum.missing, total: d.sum.total }}
    summary={[
      { label: 'Average overnight', value: d.sum.avg == null ? '—' : `${Math.round(d.sum.avg)} ms`, sub: d.sum.delta == null ? 'No earlier period to compare' : (Math.round(d.sum.delta) === 0 ? 'No change vs previous period' : `${d.sum.delta > 0 ? '+' : '−'}${Math.abs(Math.round(d.sum.delta))} ms vs previous`) },
      { label: 'Lowest night', value: d.sum.min == null ? '—' : `${Math.round(d.sum.min)} ms`, sub: 'In this range' },
      { label: 'Highest night', value: d.sum.max == null ? '—' : `${Math.round(d.sum.max)} ms`, sub: 'In this range' },
      { label: 'Latest status', value: sb ? sb.label : '—', sub: sb ? 'From Garmin' : 'Not reported', tone: sb?.tone },
    ]}>
    {d.streak >= 2 && <div className="rp-callout"><Icon name="alert" size={18} /><span>Your HRV has been below its {d.estimated ? 'typical' : 'balanced'} range for {d.streak} nights in a row. Lower readings often follow hard training, poor sleep or a busy stretch, and recover with rest.</span></div>}
    {d.streak < 2 && d.band && d.sum.avg != null && d.rows.some(r => r.value != null) && <div className="rp-callout is-good"><Icon name="check" size={18} /><span>Your recent nights are inside or above your {d.estimated ? 'typical' : 'balanced'} range.</span></div>}
    <Card title="Overnight HRV" subtitle="Shaded band is your range; dashed line is the 7-day average">
      <MiniTrend data={d.rows} label="Overnight HRV" hue="hrv" kind="line" height={240} band={d.band || undefined} line2="baseline" line2Label="7-day average" format={v => `${fmtNumber(Math.round(v))}`} ariaLabel="Overnight HRV with 7-day average and range" />
    </Card>
    {d.withStatus > 0 ? <Card title="Status over this period" subtitle={`${d.withStatus} nights with a Garmin status`}>
      <div className="rp-bar100" role="img" aria-label={d.counts.map(c => `${c.label} ${c.n} nights`).join(', ')}>
        {d.counts.filter(c => c.n).map(c => <i key={c.key} style={{ flex: c.n, background: c.color }} />)}
      </div>
      <ul className="rp-legend">{d.counts.map(c => <li key={c.key}><span className="rp-leg-l"><Badge tone={c.tone}>{c.label}</Badge></span><span className="num">{c.n} {c.n === 1 ? 'night' : 'nights'} · {Math.round(c.n / d.withStatus * 100)}%</span></li>)}</ul>
    </Card> : <ReportNote>Garmin has not reported an HRV status for this period.</ReportNote>}
    <Card>
      <TableView caption="Nightly HRV" rows={[...d.rows].reverse()} columns={[
        { key: 'date', label: 'Night', format: v => fmtDay(v) }, { key: 'value', label: 'HRV', align: 'right', format: v => v == null ? '—' : `${fmtNumber(v)} ms` },
        { key: 'baseline', label: '7-day avg', align: 'right', format: v => v == null ? '—' : `${fmtNumber(v)} ms` },
        { key: 'status', label: 'Status', align: 'right', format: v => hrvStatusBand(v)?.label || '—' }]} />
    </Card>
    <HowToRead>HRV is the small variation in time between heartbeats, measured while you sleep. Higher than your own usual range generally points to good recovery; a run of lower nights suggests your body is under extra load. Compare against your own range, not other people's numbers. One low night is noise; a week is a trend.</HowToRead>
  </ReportLayout>
}
