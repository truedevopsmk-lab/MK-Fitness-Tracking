import { useMemo } from 'react'
import { useStore } from '../../state/store'
import { metricSeries } from '../../data/select'
import { eachDay } from '../../lib/dates'
import { mean, summarize } from '../../lib/stats'
import { METRICS, hrvStatusBand } from '../../lib/metrics'
import { fmtDay } from '../../lib/format'
import Card from '../../components/Card'
import ReportLayout, { HowToRead, MiniTrend, TableView, rangeBounds, useRange } from './ReportLayout'

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const hrvPts = (v, a, sd) => v == null || a == null || !sd ? null : clamp(50 + (v - a) / sd * 25, 0, 100)

export default function Recovery() {
  const days = useStore(s => s.days)
  const [range, setRange] = useRange()
  const { from, to } = useMemo(() => rangeBounds(range), [range])
  const d = useMemo(() => {
    const ready = metricSeries(days, 'readiness', from, to), sleep = metricSeries(days, 'sleepScore', from, to)
    const hrv = metricSeries(days, 'hrv', from, to), bb = metricSeries(days, 'bodyBatteryHigh', from, to)
    const hasReadiness = ready.some(p => p.value != null)
    // Estimate when Garmin gave no readiness score: equal mix of whatever of sleep score, Body Battery high and HRV (vs own mean) exists that day
    const hm = mean(hrv.map(p => p.value)), hsd = (() => { const v = hrv.map(p => p.value).filter(x => x != null); if (v.length < 3) return null; const m = hm; return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length) })()
    const rows = eachDay(from, to).map((date, i) => {
      const parts = [sleep[i].value, bb[i].value, hrvPts(hrv[i].value, hm, hsd)].filter(x => x != null)
      const est = parts.length >= 2 ? Math.round(mean(parts)) : null
      const rd = ready[i].value
      return { date, score: hasReadiness ? rd : est, sleep: sleep[i].value, hrv: hrv[i].value, bb: bb[i].value, status: days[date]?.hrv?.status || null }
    })
    const main = rows.map(r => ({ date: r.date, value: r.score }))
    const good = rows.filter(r => r.score != null && r.score >= 75).length, scored = rows.filter(r => r.score != null).length
    const low = rows.filter(r => r.score != null && r.score < 50).length
    return { rows, main, hasReadiness, good, scored, low, sum: summarize(main), ss: summarize(sleep), hs: summarize(hrv), bs: summarize(bb), all: Object.values(days).some(x => x.readiness?.score != null || x.sleep?.score != null || x.bodyBattery?.high != null) }
  }, [days, from, to])
  const lastStatus = [...d.rows].reverse().find(r => r.status)?.status
  const hb = hrvStatusBand(lastStatus), band = METRICS.readiness.band(d.sum.avg)
  const csv = () => ({ filename: `recovery-${from}_${to}.csv`, rows: d.rows, columns: [{ key: 'date', label: 'Date' }, { key: 'score', label: d.hasReadiness ? 'Readiness' : 'Recovery estimate' }, { key: 'sleep', label: 'Sleep score' }, { key: 'hrv', label: 'HRV (ms)' }, { key: 'bb', label: 'Body Battery high' }] })
  const label = d.hasReadiness ? 'Training readiness' : 'Recovery estimate'
  const small = (title, key, sub, data, hue, fmt, domain) => <div key={title}>
    <div className="rp-multiple-head"><h3><i />{title}</h3><span>{sub}</span></div>
    <MiniTrend data={data} label={title} hue={hue} kind="line" height={110} format={fmt} domain={domain} />
  </div>
  return <ReportLayout title="Recovery" icon="battery" hue="readiness" subtitle="How ready your body is" range={range} onRange={setRange} hasData={d.all} csv={csv}
    missing={{ missing: d.sum.missing, total: d.sum.total }}
    summary={[
      { label: `Average ${d.hasReadiness ? 'readiness' : 'recovery'}`, value: d.sum.avg == null ? '—' : Math.round(d.sum.avg), sub: band ? `${band.label}${d.hasReadiness ? '' : ' (estimate)'}` : 'No data', tone: band?.tone },
      { label: 'Recovered days', value: d.scored ? `${d.good} of ${d.scored}` : '—', sub: 'Score 75 or higher' },
      { label: 'Low-recovery days', value: d.scored ? String(d.low) : '—', sub: 'Score under 50', tone: d.low > d.scored * .3 ? 'warning' : undefined },
      { label: 'Latest HRV status', value: hb?.label || '—', sub: hb ? 'From Garmin' : 'Not reported', tone: hb?.tone },
    ]}>
    <Card title={label} subtitle={d.hasReadiness ? 'Garmin training readiness, 0–100' : 'Garmin gave no readiness score, so this is our estimate: the average of sleep score, Body Battery high and HRV compared with your own usual'}>
      <MiniTrend data={d.main} label={label} hue="readiness" kind="area" height={200} domain={[0, 100]} format={v => String(Math.round(v))} refLine={d.sum.avg == null ? undefined : { value: Math.round(d.sum.avg), label: `Average ${Math.round(d.sum.avg)}` }} />
    </Card>
    <Card title="What feeds it" subtitle="Same dates on every chart so you can read down a column">
      <div className="rp-multiples">
        {small('Sleep score', 'sleep', d.ss.avg == null ? '' : `avg ${Math.round(d.ss.avg)}`, d.rows.map(r => ({ date: r.date, value: r.sleep })), 'sleep', v => String(Math.round(v)), [0, 100])}
        {small('HRV overnight', 'hrv', d.hs.avg == null ? '' : `avg ${Math.round(d.hs.avg)} ms`, d.rows.map(r => ({ date: r.date, value: r.hrv })), 'hrv', v => String(Math.round(v)))}
        {small('Body Battery high', 'bb', d.bs.avg == null ? '' : `avg ${Math.round(d.bs.avg)}`, d.rows.map(r => ({ date: r.date, value: r.bb })), 'battery', v => String(Math.round(v)), [0, 100])}
      </div>
    </Card>
    <Card>
      <TableView caption="Recovery inputs by day" rows={[...d.rows].reverse()} columns={[
        { key: 'date', label: 'Day', format: v => fmtDay(v) }, { key: 'score', label: d.hasReadiness ? 'Readiness' : 'Estimate', align: 'right' },
        { key: 'sleep', label: 'Sleep', align: 'right' }, { key: 'hrv', label: 'HRV', align: 'right' }, { key: 'bb', label: 'BB high', align: 'right' }]} />
    </Card>
    <HowToRead>{d.hasReadiness ? 'Training readiness is Garmin’s 0–100 guide to how ready you are for a hard session.' : 'We could not find a Garmin readiness score, so the top chart is our own estimate.'} The charts below show the main ingredients. When sleep, HRV and Body Battery all dip together, take it as a nudge to go easier. When they climb together, you are absorbing training well.</HowToRead>
  </ReportLayout>
}
