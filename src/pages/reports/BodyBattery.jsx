import { useMemo, useState } from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useStore } from '../../state/store'
import { metricSeries } from '../../data/select'
import { eachDay, parseDay } from '../../lib/dates'
import { summarize } from '../../lib/stats'
import { METRICS } from '../../lib/metrics'
import { fmtClock, fmtDay, fmtNumber } from '../../lib/format'
import { useChartTheme } from '../../charts/chartTheme'
import { TipCard, defaultTipTitle } from '../../charts/ChartParts'
import Card from '../../components/Card'
import DateStepper from '../../components/DateStepper'
import ReportLayout, { HowToRead, MiniTrend, ReportNote, TableView, rangeBounds, useRange } from './ReportLayout'

const num = v => typeof v === 'number' && Number.isFinite(v)

function RangeBars({ data }) {
  const t = useChartTheme(), color = t.hue('battery')
  const tick = { fill: t.text3, fontSize: 11, fontFamily: t.fontUi }
  const rows = data.map(r => ({ ...r, base: r.low, span: r.high != null && r.low != null ? Math.max(r.high - r.low, 1) : null }))
  const Tip = ({ active, payload }) => {
    const p = active && payload?.[0]?.payload
    if (!p) return null
    return <TipCard title={defaultTipTitle(p.date)} rows={p.span == null ? [{ value: 'No data' }] : [{ color, value: String(p.high), label: 'High' }, { color, value: String(p.low), label: 'Low' }]} />
  }
  return <div className="chart" role="img" aria-label="Daily Body Battery low to high">
    <ResponsiveContainer width="100%" height={220} minWidth={0}>
      <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="18%">
        <CartesianGrid vertical={false} stroke={t.grid} strokeDasharray="" />
        <XAxis dataKey="date" tickFormatter={d => fmtDay(d)} tick={tick} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={44} tickMargin={8} padding={{ left: 4, right: 4 }} />
        <YAxis ticks={[0, 25, 50, 75, 100]} domain={[0, 100]} tick={tick} axisLine={false} tickLine={false} width={44} />
        <Tooltip content={<Tip />} cursor={{ fill: t.grid }} isAnimationActive={false} wrapperStyle={{ outline: 'none', zIndex: 5 }} />
        <Bar dataKey="base" stackId="r" fill="transparent" isAnimationActive={false} legendType="none" />
        <Bar dataKey="span" stackId="r" fill={color} maxBarSize={20} radius={[4, 4, 4, 4]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  </div>
}

function Intraday({ samples, date }) {
  const t = useChartTheme(), color = t.hue('battery')
  const tick = { fill: t.text3, fontSize: 11, fontFamily: t.fontUi }
  const start = parseDay(date).getTime()
  const data = samples.map(([ts, v]) => ({ ts, v }))
  const Tip = ({ active, payload }) => {
    const p = active && payload?.[0]?.payload
    return p ? <TipCard title={fmtClock(p.ts)} rows={[{ color, value: String(p.v), label: 'Body Battery' }]} /> : null
  }
  return <div className="chart" role="img" aria-label="Body Battery through the day">
    <ResponsiveContainer width="100%" height={200} minWidth={0}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke={t.grid} strokeDasharray="" />
        <XAxis dataKey="ts" type="number" scale="time" domain={[start, start + 86400000]} ticks={[0, 6, 12, 18, 24].map(h => start + h * 3600000)} tickFormatter={v => `${String(Math.round((v - start) / 3600000) % 24).padStart(2, '0')}:00`} tick={tick} axisLine={false} tickLine={false} tickMargin={8} padding={{ left: 8, right: 8 }} />
        <YAxis ticks={[0, 25, 50, 75, 100]} domain={[0, 100]} tick={tick} axisLine={false} tickLine={false} width={44} />
        <Tooltip content={<Tip />} cursor={{ stroke: t.text3, strokeWidth: 1 }} isAnimationActive={false} wrapperStyle={{ outline: 'none', zIndex: 5 }} />
        <Area dataKey="v" type="monotone" stroke={color} strokeWidth={2} strokeLinecap="round" fill={color} fillOpacity={.1} dot={false} activeDot={{ r: 4, fill: color, stroke: t.surface, strokeWidth: 2 }} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  </div>
}

export default function BodyBattery() {
  const days = useStore(s => s.days)
  const [range, setRange] = useRange()
  const { from, to, prevFrom, prevTo } = useMemo(() => rangeBounds(range), [range])
  const d = useMemo(() => {
    const high = metricSeries(days, 'bodyBatteryHigh', from, to), low = metricSeries(days, 'bodyBatteryLow', from, to)
    const ch = metricSeries(days, 'bodyBatteryCharged', from, to), dr = metricSeries(days, 'bodyBatteryDrained', from, to)
    const rows = eachDay(from, to).map((date, i) => ({ date, high: high[i].value, low: low[i].value, charged: ch[i].value, drained: dr[i].value }))
    const sampleDays = Object.keys(days).filter(k => days[k].bodyBattery?.samples?.length > 1).sort()
    return { rows, high, low, ch, dr, sh: summarize(high, metricSeries(days, 'bodyBatteryHigh', prevFrom, prevTo)), sc: summarize(ch), sd: summarize(dr), sampleDays, all: Object.values(days).some(x => x.bodyBattery?.high != null || x.bodyBattery?.charged != null) }
  }, [days, from, to, prevFrom, prevTo])
  const [pick, setPick] = useState(null)
  const day = pick && d.sampleDays.includes(pick) ? pick : d.sampleDays.at(-1)
  const samples = day ? days[day].bodyBattery.samples : null
  const hasRange = d.rows.some(r => r.high != null && r.low != null)
  const hasCD = d.ch.some(p => p.value != null) || d.dr.some(p => p.value != null)
  const net = d.sc.avg != null && d.sd.avg != null ? d.sc.avg - d.sd.avg : null
  const csv = () => ({ filename: `body-battery-${from}_${to}.csv`, rows: d.rows, columns: [{ key: 'date', label: 'Date' }, { key: 'high', label: 'High' }, { key: 'low', label: 'Low' }, { key: 'charged', label: 'Charged' }, { key: 'drained', label: 'Drained' }] })
  const band = METRICS.bodyBatteryHigh.band(d.sh.avg == null ? null : Math.round(d.sh.avg))
  return <ReportLayout title="Body Battery" icon="battery" hue="battery" subtitle="Energy gained and spent" range={range} onRange={setRange} hasData={d.all} csv={csv}
    missing={{ missing: d.sh.missing, total: d.sh.total }}
    summary={[
      { label: 'Average high', value: d.sh.avg == null ? '—' : Math.round(d.sh.avg), sub: band ? `${band.label} charge at best` : 'No data', tone: band?.tone },
      { label: 'Average low', value: d.low.some(p => p.value != null) ? Math.round(summarize(d.low).avg) : '—', sub: 'Daily low point' },
      { label: 'Charged / day', value: d.sc.avg == null ? '—' : `+${Math.round(d.sc.avg)}`, sub: 'Mostly while resting' },
      { label: 'Drained / day', value: d.sd.avg == null ? '—' : `−${Math.round(d.sd.avg)}`, sub: net == null ? undefined : net >= 0 ? `Net +${Math.round(net)}: you gain more than you spend` : `Net −${Math.abs(Math.round(net))}: you spend more than you gain` },
    ]}>
    {hasRange ? <Card title="Daily high and low" subtitle="Each bar runs from the day's lowest to its highest level">
      <RangeBars data={d.rows} />
    </Card> : <ReportNote>Garmin has not sent daily high and low levels for this range.</ReportNote>}
    {hasCD ? <div className="rp-split">
      <Card title="Charged" subtitle="Energy gained each day">
        <MiniTrend data={d.ch} label="Charged" hue="battery" kind="bar" height={140} axisFormat={v => fmtNumber(v)} format={v => v ? `+${fmtNumber(v)}` : '0'} />
      </Card>
      <Card title="Drained" subtitle="Energy spent each day">
        <MiniTrend data={d.dr} label="Drained" hue="battery" kind="bar" height={140} axisFormat={v => fmtNumber(v)} format={v => v ? `−${fmtNumber(v)}` : '0'} />
      </Card>
    </div> : <ReportNote>Charged and drained totals are not available for this range.</ReportNote>}
    {samples ? <Card title="Through the day" subtitle="Level every 15 minutes">
      <div className="rp-picker"><DateStepper date={day} onChange={v => d.sampleDays.includes(v) && setPick(v)} min={d.sampleDays[0]} max={d.sampleDays.at(-1)} /></div>
      <Intraday samples={samples} date={day} />
      <p className="rp-note" style={{ paddingBottom: 0 }}>Detailed curves are kept for the last {d.sampleDays.length} days only.</p>
    </Card> : <ReportNote>Intraday curves appear here once Garmin sends detailed Body Battery readings.</ReportNote>}
    <Card>
      <TableView caption="Daily Body Battery" rows={[...d.rows].reverse()} columns={[
        { key: 'date', label: 'Day', format: v => fmtDay(v) }, { key: 'high', label: 'High', align: 'right' }, { key: 'low', label: 'Low', align: 'right' },
        { key: 'charged', label: 'Charged', align: 'right', format: v => v == null ? '—' : `+${v}` }, { key: 'drained', label: 'Drained', align: 'right', format: v => v == null ? '—' : `−${v}` }]} />
    </Card>
    <HowToRead>Body Battery runs from 0 to 100. It rises when you rest and sleep and falls with activity and stress. A high near 80 or more after a night's sleep means you started the day well charged. If your daily high keeps drifting lower over a couple of weeks, recovery is not keeping up with what you spend.</HowToRead>
  </ReportLayout>
}
