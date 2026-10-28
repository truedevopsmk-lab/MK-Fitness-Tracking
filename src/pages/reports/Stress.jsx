import { useMemo } from 'react'
import { useStore } from '../../state/store'
import { metricSeries } from '../../data/select'
import { eachDay } from '../../lib/dates'
import { mean, summarize } from '../../lib/stats'
import { METRICS, STRESS_LEVELS } from '../../lib/metrics'
import { fmtDay, fmtDuration, fmtWeekday } from '../../lib/format'
import Card from '../../components/Card'
import Badge from '../../components/Badge'
import ReportLayout, { HowToRead, MiniTrend, ReportNote, StackedColumns, TableView, WeekdayBars, rangeBounds, useRange, weekdayAverages } from './ReportLayout'

const M = METRICS.stressAvg
const BANDS = 'Rest 0–25 · Low 26–50 · Medium 51–75 · High 76–100'

export default function Stress() {
  const days = useStore(s => s.days)
  const [range, setRange] = useRange()
  const { from, to, prevFrom, prevTo } = useMemo(() => rangeBounds(range), [range])
  const d = useMemo(() => {
    const avg = metricSeries(days, 'stressAvg', from, to), prev = metricSeries(days, 'stressAvg', prevFrom, prevTo)
    const rows = eachDay(from, to).map(date => { const s = days[date]?.stress; return { date, avg: s?.avg ?? null, ...Object.fromEntries(STRESS_LEVELS.map(l => [l.key, s?.[l.field] ?? null])) } })
    const hasBreakdown = rows.some(r => STRESS_LEVELS.some(l => r[l.key] != null))
    const totals = STRESS_LEVELS.map(l => ({ ...l, sec: mean(rows.map(r => r[l.key])) }))
    const wsum = totals.reduce((a, t) => a + (t.sec || 0), 0)
    const highest = rows.filter(r => r.high != null && r.high > 0).sort((a, b) => b.high - a.high).slice(0, 5)
    const all = Object.values(days).some(x => x.stress?.avg != null)
    return { avg, sum: summarize(avg, prev), rows, hasBreakdown, totals, wsum, highest, wk: weekdayAverages(avg), all }
  }, [days, from, to, prevFrom, prevTo])
  const band = M.band(d.sum.avg == null ? null : Math.round(d.sum.avg))
  const wkVals = d.wk.filter(w => w.value != null)
  const calm = wkVals.length ? wkVals.reduce((a, b) => a.value < b.value ? a : b) : null
  const busy = wkVals.length ? wkVals.reduce((a, b) => a.value > b.value ? a : b) : null
  const delta = d.sum.delta
  const csv = () => ({ filename: `stress-${from}_${to}.csv`, rows: d.rows, columns: [{ key: 'date', label: 'Date' }, { key: 'avg', label: 'Average stress' }, ...STRESS_LEVELS.map(l => ({ key: l.key, label: `${l.label} (min)`, value: r => r[l.key] == null ? '' : Math.round(r[l.key] / 60) }))] })
  return <ReportLayout title="Stress" icon="stress" hue="stress" subtitle="How tense your days were" range={range} onRange={setRange} hasData={d.all} csv={csv}
    missing={{ missing: d.sum.missing, total: d.sum.total }}
    summary={[
      { label: 'Average stress', value: d.sum.avg == null ? '—' : Math.round(d.sum.avg), sub: band ? `${band.label} on average` : 'No data in range', tone: band?.tone },
      { label: 'Vs previous period', value: delta == null ? '—' : Math.round(delta) === 0 ? '0' : `${delta > 0 ? '+' : '−'}${Math.abs(Math.round(delta))}`, sub: delta == null ? 'Not enough earlier data' : Math.round(delta) === 0 ? 'About the same as before' : delta > 0 ? 'More stress than before' : delta < 0 ? 'Less stress than before' : 'No change' },
      { label: 'Highest day', value: d.sum.max == null ? '—' : Math.round(d.sum.max), sub: 'Daily average, peak' },
      { label: 'High-stress time / day', value: d.hasBreakdown ? fmtDuration(d.totals[3].sec) : '—', sub: d.hasBreakdown ? 'Daily average' : 'Not reported' },
    ]}>
    <Card title="Average stress" subtitle="Daily score, 0–100">
      <MiniTrend data={d.avg} label="Average stress" hue="stress" kind="area" height={220} domain={[0, 100]} format={v => String(Math.round(v))} refLine={d.sum.avg == null ? undefined : { value: Math.round(d.sum.avg), label: `Period average ${Math.round(d.sum.avg)}` }} ariaLabel="Average daily stress" />
      <ul className="legend rp-bandkey" style={{ marginTop: 10, marginBottom: 0 }}>
        {[['Rest', '0–25'], ['Low', '26–50'], ['Medium', '51–75'], ['High', '76–100']].map(([l, r]) => <li key={l}><span className="num">{r}</span>{l}</li>)}
      </ul>
    </Card>
    {d.hasBreakdown ? <Card title="Time in each stress level" subtitle="Hours per day awake">
      <StackedColumns data={d.rows} series={STRESS_LEVELS.map(l => ({ key: l.key, label: l.label, color: l.color }))} unit={3600} axisFormat={v => `${Math.round(v / 3600)}h`} format={v => fmtDuration(v)} height={220} ariaLabel="Daily time in each stress level" />
      <ul className="rp-legend">{d.totals.map(t => <li key={t.key}><span className="rp-leg-l"><i style={{ background: t.color }} />{t.label}</span><span className="num">{fmtDuration(t.sec)} a day · {d.wsum ? Math.round(t.sec / d.wsum * 100) : 0}%</span></li>)}</ul>
    </Card> : <ReportNote>Garmin has not sent time-in-level data for this period, so the daily breakdown is hidden.</ReportNote>}
    <div className="rp-split">
      {d.hasBreakdown && <Card title="Most high-stress days" subtitle="Longest time in the high level">
        {d.highest.length ? <ul className="rp-list">{d.highest.map(r => <li key={r.date}><span className="rp-li-main">{fmtWeekday(r.date)}<small>Average stress {r.avg == null ? '—' : Math.round(r.avg)}</small></span><strong>{fmtDuration(r.high)}</strong></li>)}</ul> : <ReportNote>No high-stress time recorded in this range.</ReportNote>}
      </Card>}
      <Card title="By day of the week" subtitle="Average stress score">
        <WeekdayBars data={d.wk} hue="stress" label="Average stress" domain={[0, 100]} format={v => String(Math.round(v))} />
        {calm && busy && calm.date !== busy.date && <p className="rp-note" style={{ paddingBottom: 0 }}>{busy.date} tends to be your busiest day ({Math.round(busy.value)}), {calm.date} the calmest ({Math.round(calm.value)}).</p>}
      </Card>
    </div>
    <Card>
      <TableView caption="Daily stress" rows={[...d.rows].reverse()} columns={[
        { key: 'date', label: 'Day', format: v => fmtDay(v) }, { key: 'avg', label: 'Avg', align: 'right', format: v => v == null ? '—' : Math.round(v) },
        ...(d.hasBreakdown ? [{ key: 'high', label: 'High', align: 'right', format: v => v == null ? '—' : fmtDuration(v) }, { key: 'rest', label: 'Rest', align: 'right', format: v => v == null ? '—' : fmtDuration(v) }] : [])]} />
    </Card>
    <HowToRead>Garmin estimates stress from heart-rate variability while you are awake. A score under 26 means you were at rest; over 75 means a high-stress stretch. A few busy days are normal. Look for the pattern across weeks, and for what tends to come before your calmer days.</HowToRead>
  </ReportLayout>
}
