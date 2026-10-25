import { useMemo } from 'react'
import { useStore } from '../../state/store'
import { metricSeries } from '../../data/select'
import { eachDay } from '../../lib/dates'
import { correlation, mean, summarize } from '../../lib/stats'
import { fmtDay, fmtNumber } from '../../lib/format'
import Card from '../../components/Card'
import ReportLayout, { HowToRead, MiniTrend, ReportNote, TableView, rangeBounds, useRange } from './ReportLayout'

export default function HeartRate() {
  const days = useStore(s => s.days)
  const [range, setRange] = useRange()
  const { from, to, prevFrom, prevTo } = useMemo(() => rangeBounds(range), [range])
  const d = useMemo(() => {
    const r = metricSeries(days, 'restingHr', from, to), sum = summarize(r, metricSeries(days, 'restingHr', prevFrom, prevTo))
    const hrv = metricSeries(days, 'hrv', from, to)
    const rows = eachDay(from, to).map((date, i) => {
      const h = days[date]?.heartRate
      return { date, value: r[i].value, baseline: mean(r.slice(Math.max(0, i - 6), i + 1).map(x => x.value)), min: h?.min ?? null, max: h?.max ?? null, hrv: hrv[i].value }
    })
    const corr = correlation(rows.map(x => [x.value, x.hrv]))
    return { rows, sum, corr, hasRange: rows.some(x => x.min != null || x.max != null), all: Object.values(days).some(x => x.heartRate?.resting != null || x.sleep?.restingHr != null),
      maxS: summarize(rows.map(x => ({ value: x.max }))), minS: summarize(rows.map(x => ({ value: x.min }))) }
  }, [days, from, to, prevFrom, prevTo])
  const sentence = d.corr == null ? 'There are not enough nights with both readings in this range to compare resting heart rate and HRV.'
    : Math.abs(d.corr) < 0.3 ? 'In this range, resting heart rate and HRV moved mostly independently of each other.'
    : d.corr < 0 ? `In this range, nights with a higher resting heart rate tended to come with a lower HRV (${d.corr < -0.6 ? 'strong' : 'moderate'} link, r = ${d.corr.toFixed(2)}). This is a pattern, not a cause.`
    : `In this range, resting heart rate and HRV tended to rise together (r = ${d.corr.toFixed(2)}), which is unusual. This is a pattern, not a cause.`
  const delta = d.sum.delta
  const csv = () => ({ filename: `heart-rate-${from}_${to}.csv`, rows: d.rows, columns: [{ key: 'date', label: 'Date' }, { key: 'value', label: 'Resting HR (bpm)' }, { key: 'min', label: 'Min HR (bpm)' }, { key: 'max', label: 'Max HR (bpm)' }] })
  return <ReportLayout title="Heart rate" icon="heart" hue="heart" subtitle="Resting heart rate and daily range" range={range} onRange={setRange} hasData={d.all} csv={csv}
    missing={{ missing: d.sum.missing, total: d.sum.total }}
    summary={[
      { label: 'Average resting', value: d.sum.avg == null ? '—' : `${Math.round(d.sum.avg)} bpm`, sub: delta == null ? 'No earlier period to compare' : `${delta > 0 ? '+' : delta < 0 ? '−' : ''}${Math.abs(Math.round(delta * 10) / 10)} bpm vs previous period`, tone: delta == null ? undefined : delta > 2 ? 'warning' : delta < -1 ? 'good' : undefined },
      { label: 'Lowest resting', value: d.sum.min == null ? '—' : `${Math.round(d.sum.min)} bpm`, sub: 'Best day in range' },
      { label: 'Highest resting', value: d.sum.max == null ? '—' : `${Math.round(d.sum.max)} bpm`, sub: 'Highest day in range' },
      { label: 'Peak heart rate', value: d.maxS.max == null ? '—' : `${Math.round(d.maxS.max)} bpm`, sub: d.hasRange ? 'Highest recorded' : 'Not reported' },
    ]}>
    <Card title="Resting heart rate" subtitle="Daily value; dashed line is the 7-day average">
      <MiniTrend data={d.rows} label="Resting heart rate" hue="heart" kind="line" height={230} line2="baseline" line2Label="7-day average" format={v => `${fmtNumber(Math.round(v))}`} ariaLabel="Resting heart rate with 7-day average" />
    </Card>
    {d.hasRange ? <Card title="Daily lowest and highest" subtitle="Beats per minute across the day">
      <div className="rp-split">
        <div><div className="rp-multiple-head"><h3><i />Highest</h3><span>{d.maxS.avg == null ? '' : `avg ${Math.round(d.maxS.avg)} bpm`}</span></div>
          <MiniTrend data={d.rows.map(x => ({ date: x.date, value: x.max }))} label="Highest" hue="heart" kind="line" height={130} format={v => `${fmtNumber(v)}`} /></div>
        <div><div className="rp-multiple-head"><h3><i />Lowest</h3><span>{d.minS.avg == null ? '' : `avg ${Math.round(d.minS.avg)} bpm`}</span></div>
          <MiniTrend data={d.rows.map(x => ({ date: x.date, value: x.min }))} label="Lowest" hue="heart" kind="line" height={130} format={v => `${fmtNumber(v)}`} /></div>
      </div>
    </Card> : <ReportNote>Daily lowest and highest heart rate are not available for this range.</ReportNote>}
    <Card title="Resting heart rate and HRV"><p className="rp-note" style={{ padding: 0, fontSize: 14, lineHeight: 1.5 }}>{sentence}</p></Card>
    <Card>
      <TableView caption="Daily heart rate" rows={[...d.rows].reverse()} columns={[
        { key: 'date', label: 'Day', format: v => fmtDay(v) }, { key: 'value', label: 'Resting', align: 'right', format: v => v == null ? '—' : `${fmtNumber(v)} bpm` },
        { key: 'min', label: 'Lowest', align: 'right', format: v => v == null ? '—' : fmtNumber(v) }, { key: 'max', label: 'Highest', align: 'right', format: v => v == null ? '—' : fmtNumber(v) }]} />
    </Card>
    <HowToRead>Resting heart rate is how slowly your heart beats when you are calm, and it usually drifts down as fitness improves. A few beats higher than usual for several days can follow hard training, poor sleep, heat or a busy week. Watch the 7-day line rather than single days.</HowToRead>
  </ReportLayout>
}
