import { useMemo } from 'react'
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useStore } from '../../state/store'
import { addDays, eachDay, weekStart } from '../../lib/dates'
import { fmtDay, fmtNumber } from '../../lib/format'
import { GROUP, TYPE_GROUPS, dailyLoadMap, loadBand, loadSeries, typeGroup, weekKeys } from '../../lib/activities'
import { METRICS } from '../../lib/metrics'
import { niceTicks, useChartTheme } from '../../charts/chartTheme'
import { Legend, TipCard, defaultTipTitle } from '../../charts/ChartParts'
import Badge from '../../components/Badge'
import Card from '../../components/Card'
import { BarList } from './ActivitiesReport'
import ReportLayout, { HowToRead, MiniTrend, ReportNote, TableView, rangeBounds, useRange } from './ReportLayout'
import '../../styles/activities.css'

const num = v => typeof v === 'number' && Number.isFinite(v)

function AcuteChronic({ data }) {
  const t = useChartTheme()
  const a = t.hue('heart'), c = t.hue('steps')
  const vals = data.flatMap(p => [p.acute, p.chronic]).filter(num)
  const { ticks, domain } = niceTicks(0, Math.max(1, ...vals), 4)
  const tick = { fill: t.text3, fontSize: 11, fontFamily: t.fontUi }
  const Tip = ({ active, payload }) => {
    const p = active && payload?.[0]?.payload
    return p ? <TipCard title={defaultTipTitle(p.date)} rows={[{ color: a, value: fmtNumber(p.acute), label: 'Acute (7 days)' }, { color: c, value: fmtNumber(p.chronic), label: 'Chronic (28-day average week)' }]} /> : null
  }
  return <div className="chart" role="img" aria-label="Acute and chronic training load">
    <Legend items={[{ label: 'Acute: last 7 days', color: a }, { label: 'Chronic: average week over 28 days', color: c }]} />
    <ResponsiveContainer width="100%" height={220} minWidth={0}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke={t.grid} strokeDasharray="" />
        <XAxis dataKey="date" tickFormatter={d => fmtDay(d)} tick={tick} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={44} tickMargin={8} padding={{ left: 8, right: 8 }} />
        <YAxis ticks={ticks} domain={domain} tick={tick} axisLine={false} tickLine={false} width={44} tickFormatter={v => fmtNumber(v)} />
        <Tooltip content={<Tip />} cursor={{ stroke: t.text3, strokeWidth: 1 }} isAnimationActive={false} wrapperStyle={{ outline: 'none', zIndex: 5 }} />
        <Line dataKey="chronic" type="linear" stroke={c} strokeWidth={2} strokeLinecap="round" dot={false} activeDot={{ r: 4, fill: c, stroke: t.surface, strokeWidth: 2 }} isAnimationActive={false} />
        <Line dataKey="acute" type="linear" stroke={a} strokeWidth={2} strokeLinecap="round" dot={false} activeDot={{ r: 4, fill: a, stroke: t.surface, strokeWidth: 2 }} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  </div>
}

export default function TrainingLoad() {
  const [range, setRange] = useRange(30)
  const days = useStore(s => s.days)
  const activities = useStore(s => s.activities)
  const { from, to } = rangeBounds(range)

  const map = useMemo(() => dailyLoadMap(days, activities), [days, activities])
  const hasLoad = Object.keys(map).length > 0
  const series = useMemo(() => loadSeries(map, from, to), [map, from, to])
  const daily = useMemo(() => series.map(p => ({ date: p.date, value: p.load })), [series])
  const last = series.at(-1), band = loadBand(last?.ratio)
  const total = daily.reduce((s, p) => s + (p.value || 0), 0)
  const loggedDays = daily.filter(p => p.value > 0).length

  const weeks = useMemo(() => weekKeys(from, to).map(date => {
    let s = 0, any = false
    for (const d of eachDay(date, addDays(date, 6))) { if (d > to) break; const v = METRICS.intensity.pick(days[d] || {}); if (v != null) { s += v; any = true } }
    return { date, value: any ? s : null }
  }), [days, from, to])
  const hasIntensity = weeks.some(w => w.value != null)
  const goal = useMemo(() => { for (const d of Object.keys(days).sort().reverse()) { const g = days[d]?.intensity?.goal; if (g) return g } return 150 }, [days])
  const weeksHit = weeks.filter(w => w.value != null && w.value >= goal).length

  const byType = useMemo(() => {
    const m = {}
    for (const a of activities) if (a.day >= from && a.day <= to && a.trainingLoad != null) { const g = typeGroup(a.type); m[g] = (m[g] || 0) + a.trainingLoad }
    return TYPE_GROUPS.filter(g => m[g.key]).map(g => ({ key: g.key, label: g.plural, value: m[g.key], text: fmtNumber(m[g.key]) })).sort((x, y) => y.value - x.value)
  }, [activities, from, to])

  const csv = () => ({ filename: `training-load-${from}-to-${to}.csv`, rows: series, columns: [{ key: 'date' }, { key: 'load', label: 'daily_load' }, { key: 'acute', label: 'acute_7d' }, { key: 'chronic', label: 'chronic_28d_avg_week' }, { key: 'ratio', label: 'acute_chronic_ratio', value: r => r.ratio == null ? '' : r.ratio.toFixed(2) }] })
  const summary = [
    { label: 'Acute : chronic', value: last?.ratio != null ? last.ratio.toFixed(2) : '—', sub: band ? band.label : 'Needs a few weeks of load', tone: band?.tone === 'neutral' ? undefined : band?.tone },
    { label: 'Load this period', value: fmtNumber(total), sub: `${loggedDays} of ${daily.length} days with training` },
    { label: 'Acute (7 days)', value: fmtNumber(last?.acute), sub: 'Load in the last week' },
    { label: 'Chronic', value: fmtNumber(last?.chronic), sub: 'Average week, last 28 days' },
  ]

  return <ReportLayout title="Training load" icon="flame" hue="intensity" subtitle="How hard you have trained, and how it compares to your norm" range={range} onRange={setRange}
    summary={summary} csv={csv} hasData={hasLoad || hasIntensity} emptyBody="Training load comes from your activities. Sync them and this report fills in.">
    <HowToRead>These are estimates built from the load Garmin gives each activity, not a Garmin score. The ratio compares your last 7 days with your usual week over 28 days. Under 0.8 is detraining, 0.8 to 1.3 is the productive range, 1.3 to 1.5 is high, and above 1.5 is very high.</HowToRead>

    <Card title="Acute to chronic ratio" subtitle="Estimate from Garmin's per-activity load">
      {band ? <div className="arep-big"><strong className="num">{last.ratio.toFixed(2)}</strong><Badge tone={band.tone}>{band.label}</Badge>
        <p>Last 7 days: {fmtNumber(last.acute)} load. Your usual week: {fmtNumber(last.chronic)}.</p></div>
        : <p className="arep-note">Not enough load history yet. Four weeks of activities are needed for a ratio.</p>}
    </Card>

    <Card title="Acute vs chronic load" subtitle="Both lines are load per week, so they share one scale">
      <AcuteChronic data={series} />
    </Card>

    <Card title="Daily training load" subtitle="Garmin's load for each day's activities">
      <MiniTrend data={daily} label="Load" hue="intensity" kind="bar" height={170} ariaLabel="Daily training load" />
      <ReportNote>{loggedDays} of {daily.length} days had training load. Rest days show no bar.</ReportNote>
      <TableView caption="Daily training load" columns={[{ key: 'date', label: 'Date', format: d => fmtDay(d) }, { key: 'load', label: 'Load', align: 'right', format: v => v == null ? '—' : fmtNumber(v) }, { key: 'acute', label: 'Acute', align: 'right', format: v => fmtNumber(v) }, { key: 'chronic', label: 'Chronic', align: 'right', format: v => fmtNumber(v) }]} rows={[...series].reverse()} />
    </Card>

    {hasIntensity && <Card title="Intensity minutes per week" subtitle={`${weeksHit} of ${weeks.length} weeks reached the ${goal} minute goal`}>
      <MiniTrend data={weeks} label="Intensity minutes" hue="intensity" kind="bar" height={170} refLine={{ value: goal, label: `Goal ${goal} min` }}
        xFormat={d => fmtDay(d)} tipTitle={d => `Week of ${fmtDay(d, { day: 'numeric', month: 'short' })}`} ariaLabel="Weekly intensity minutes" />
      <ReportNote>Moderate minutes count once, vigorous minutes count twice. The current week is partial.</ReportNote>
    </Card>}

    {byType.length > 0 && <Card title="Load by activity type" subtitle="Where this period's load came from">
      <BarList rows={byType} hue="intensity" />
    </Card>}
  </ReportLayout>
}
