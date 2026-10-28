import { useMemo } from 'react'
import { CartesianGrid, ReferenceArea, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts'
import { useStore } from '../../state/store'
import { EFFORT_HARD, MIN_PAIRED, REC_HOLD, WINDOW, bounceText, changeText, resilienceFor, resilienceSeries, stateInfo } from '../../lib/resilience'
import { effortPoints } from '../../lib/effort'
import { usePrefs } from '../../lib/prefs'
import { fmtDay } from '../../lib/format'
import { today } from '../../lib/dates'
import { useChartTheme } from '../../charts/chartTheme'
import { TipCard, defaultTipTitle, refLabel } from '../../charts/ChartParts'
import { Badge, Card } from '../../components'
import ReportLayout, { HowToRead, LinesChart, TableView, rangeBounds, useRange } from './ReportLayout'

const r0 = v => v == null ? null : Math.round(v)
const cell = v => v == null ? '—' : String(Math.round(v))
const TICKS = [0, 25, 50, 75, 100], DOMAIN = [0, 100]
const QUADS = [
  { key: 'fresh', label: 'Fresh', x1: 0, x2: EFFORT_HARD, y1: REC_HOLD, y2: 100, pos: 'insideTopLeft' },
  { key: 'strong', label: 'Strong', x1: EFFORT_HARD, x2: 100, y1: REC_HOLD, y2: 100, pos: 'insideTopRight' },
  { key: 'low', label: 'Low recovery', x1: 0, x2: EFFORT_HARD, y1: 0, y2: REC_HOLD, pos: 'insideBottomLeft' },
  { key: 'stretched', label: 'Stretched', x1: EFFORT_HARD, x2: 100, y1: 0, y2: REC_HOLD, pos: 'insideBottomRight' },
]

function QuadrantMap({ r }) {
  const t = useChartTheme()
  const color = t.hue('readiness'), tick = { fill: t.text3, fontSize: 11, fontFamily: t.fontUi }
  const pts = r.points.filter(p => p.recovery != null && p.effort != null)
  const avg = [{ date: null, effort: r.effort, recovery: r.recovery }]
  const info = stateInfo(r.state)
  const corner = (text, position) => ({ value: text, position, content: ({ viewBox: v, value }) => {
    const right = position.endsWith('Right'), top = position.startsWith('insideTop')
    return <text x={right ? v.x + v.width - 6 : v.x + 6} y={top ? v.y + 14 : v.y + v.height - 6} textAnchor={right ? 'end' : 'start'} fill={t.text3} fontSize={11} fontFamily={t.fontUi}>{value}</text>
  } })
  const axisLabel = (value, position) => ({ value, position, fill: t.text3, fontSize: 11, fontFamily: t.fontUi })
  const Tip = ({ active, payload }) => {
    const p = active && payload?.[0]?.payload
    return p ? <TipCard title={p.date ? defaultTipTitle(p.date) : `Last ${WINDOW} days`} rows={[{ value: String(Math.round(p.recovery)), label: 'Recovery' }, { value: String(Math.round(p.effort)), label: 'Effort' }]} /> : null
  }
  const dot = (fill, rad, avgDot) => ({ cx, cy }) => Number.isFinite(cx) ? <circle cx={cx} cy={cy} r={rad} fill={color} fillOpacity={fill} stroke={avgDot ? t.surface : 'none'} strokeWidth={avgDot ? 2 : 0} /> : <g />
  return <div className="chart rs-map" role="img" aria-label={`Recovery against effort, 14-day average: recovery ${Math.round(r.recovery)}, effort ${Math.round(r.effort)}, in the ${info.short} area`}>
    <ul className="legend"><li><i style={{ background: color, opacity: .4, borderRadius: '50%' }} />Days</li><li><i style={{ background: color, borderRadius: '50%' }} />14-day average</li></ul>
    <ResponsiveContainer width="100%" height={240} minWidth={0}>
      <ScatterChart margin={{ top: 16, right: 12, bottom: 4, left: 0 }}>
        <CartesianGrid vertical={false} stroke={t.grid} strokeDasharray="" />
        <XAxis type="number" dataKey="effort" domain={DOMAIN} ticks={TICKS} tick={tick} axisLine={false} tickLine={false} tickMargin={6} label={{ ...axisLabel('Effort', 'insideBottom'), offset: 2 }} height={46} />
        <YAxis type="number" dataKey="recovery" domain={DOMAIN} ticks={TICKS} tick={tick} axisLine={false} tickLine={false} width={48} label={{ ...axisLabel('Recovery', 'insideLeft'), angle: -90, offset: 14, style: { textAnchor: 'middle' } }} />
        {QUADS.map(q => <ReferenceArea key={q.key} x1={q.x1} x2={q.x2} y1={q.y1} y2={q.y2} fill={q.key === r.state ? color : 'none'} fillOpacity={q.key === r.state ? .08 : 0} stroke="none" label={corner(q.label, q.pos)} />)}
        <ReferenceLine x={EFFORT_HARD} stroke={t.text2} strokeDasharray="4 4" strokeWidth={1} label={refLabel('Usual effort', 'insideTopRight', t)} />
        <ReferenceLine y={REC_HOLD} stroke={t.text2} strokeDasharray="4 4" strokeWidth={1} label={refLabel(`Recovery ${REC_HOLD}`, 'insideTopRight', t)} />
        <Tooltip content={<Tip />} cursor={false} isAnimationActive={false} wrapperStyle={{ outline: 'none', zIndex: 5 }} />
        <Scatter name="Days" data={pts} shape={dot(.4, 4)} isAnimationActive={false} />
        <Scatter name="14-day average" data={avg} shape={dot(1, 7, true)} isAnimationActive={false} />
      </ScatterChart>
    </ResponsiveContainer>
  </div>
}

const signed = c => c == null ? null : c === 0 ? '0' : `${c < 0 ? '−' : '+'}${Math.abs(c)}`

function Fortnight({ r }) {
  const info = stateInfo(r.state), b = r.bounce, change = signed(r0(r.change))
  if (!info) return <Card title={`Last ${WINDOW} days`} className="rb-card">
    <div className="rb-head"><div className="rb-head-text"><span className="rb-kind">Resilience</span><p className="rb-lead">Resilience builds after {MIN_PAIRED} scored days</p></div></div>
    <p className="rb-foot">{r.n} of {WINDOW} recent days have both a recovery and an effort score. Effort itself needs 14 days of history.</p>
  </Card>
  return <Card title={`Last ${WINDOW} days`} className="rb-card">
    <div className="rs-body">
      <div className="rb-head"><div className="rb-head-text">
        <span className="rb-kind">Resilience</span>
        <h2 className="rb-lead">{info.title}</h2>
        <p className="rs-text">{info.text}</p>
        <div className="rp-chips" style={{ marginTop: 10 }}>
          <Badge tone="neutral" icon={false}>Recovery {r0(r.recovery)} avg</Badge><Badge tone="neutral" icon={false}>Effort {r0(r.effort)} avg</Badge><Badge tone="neutral" icon={false}>{r.n} of {WINDOW} days</Badge>
        </div>
      </div></div>
      <QuadrantMap r={r} />
      <div className="rs-table"><TableView caption="Recovery and effort, last 14 days" rows={[...r.points].reverse()} columns={[
        { key: 'date', label: 'Day', format: v => fmtDay(v) }, { key: 'recovery', label: 'Recovery', align: 'right', format: cell }, { key: 'effort', label: 'Effort', align: 'right', format: cell }]} /></div>
      <ul className="rp-list rp-list-gap">
        <li><span className="rp-li-main">Compared with the 14 days before<small>{changeText(r.change) || `Needs ${MIN_PAIRED} days of recovery in the 14 days before`}</small></span>
          <strong className="num">{change == null ? '—' : `${change} pts`}</strong></li>
        <li><span className="rp-li-main">After hard days<small>{bounceText(b)}</small></span>
          <strong className="num">{b.ok ? `${Math.round(b.after)} vs ${Math.round(b.other)}` : '—'}</strong></li>
      </ul>
    </div>
    <p className="rb-foot">Recovery and effort are 14-day averages of your <a href="#/reports/recovery">recovery</a> and <a href="#/reports/effort">effort</a> scores. Estimate from Garmin data, not a Garmin number.</p>
  </Card>
}

export default function Resilience() {
  const days = useStore(s => s.days), acts = useStore(s => s.activities), { sleepNeedHours } = usePrefs()
  const [range, setRange] = useRange(60)
  const { from, to } = useMemo(() => rangeBounds(range), [range])
  const all = useMemo(() => Object.values(effortPoints(days, acts)).some(p => p.points != null), [days, acts])
  const d = useMemo(() => {
    const rows = resilienceSeries(days, acts, from, to, { sleepNeedHours })
    const scored = rows.filter(x => x.state), last = rows[rows.length - 1]
    return { rows, scored, last, stretched: scored.filter(x => x.state === 'stretched').length, missing: rows.length - scored.length }
  }, [days, acts, from, to, sleepNeedHours])
  const now = useMemo(() => resilienceFor(days, acts, today(), { sleepNeedHours }), [days, acts, sleepNeedHours])
  const info = stateInfo(d.last?.state), change = signed(r0(now.change))
  const csv = () => ({ filename: `mk-fitness-resilience-${from}-${to}.csv`, rows: d.rows.map(x => ({ ...x, state: x.state || '' })), columns: [{ key: 'date', label: 'date' }, { key: 'recovery', label: 'recovery14' }, { key: 'effort', label: 'effort14' }, { key: 'n', label: 'scoredDays' }, { key: 'state', label: 'state' }] })
  return <ReportLayout title="Resilience" icon="scale" hue="readiness" subtitle="Whether recovery is keeping up with your effort" ranges={[30, 60, 120, 365]} range={range} onRange={setRange} hasData={all} csv={csv}
    emptyBody="Sync your Garmin data, or explore with demo data, and resilience builds once recovery and effort have 7 days in common."
    missing={{ missing: d.missing, total: d.rows.length }}
    lead={<Fortnight r={now} />}
    summary={[
      { label: 'Now', value: info ? info.short : '—', tone: info?.tone, sub: '14-day balance' },
      { label: 'Recovery', value: r0(d.last?.recovery) ?? '—', sub: change == null ? '14-day average' : `${change} vs the 14 days before` },
      { label: 'Effort', value: r0(d.last?.effort) ?? '—', sub: 'A usual day is 50' },
      { label: 'Stretched', value: d.scored.length ? `${d.stretched} days` : '—', sub: `of ${d.scored.length} with a balance` },
    ]}>
    <Card title="Recovery and effort" subtitle="Rolling 14-day averages, 0–100. Gaps are days with fewer than 7 scored days in the window.">
      <LinesChart data={d.rows} domain={[0, 100]} format={v => String(Math.round(v))} height={200}
        series={[{ key: 'recovery', label: 'Recovery', color: 'var(--hue-readiness)' }, { key: 'effort', label: 'Effort', color: 'var(--hue-intensity)' }]} />
      <div><TableView caption="Resilience by day" rows={[...d.rows].reverse()} columns={[
        { key: 'date', label: 'Date', format: v => fmtDay(v) }, { key: 'recovery', label: 'Recovery', align: 'right', format: cell }, { key: 'effort', label: 'Effort', align: 'right', format: cell },
        { key: 'state', label: 'Balance', align: 'right', format: v => stateInfo(v)?.short || '—' }]} /></div>
    </Card>
    <HowToRead>Each day has a recovery estimate and an effort score. Averaging both over the last 14 days places the fortnight in one of four states, split at recovery {REC_HOLD} and effort {EFFORT_HARD} (a usual day for you): Strong, Fresh, Stretched or Low recovery. A window needs {MIN_PAIRED} days with both scores before it shows a state. The after-hard-days line needs 3 hard days and 3 other days in the last 28. This is a trend in your own data, not a diagnosis.</HowToRead>
  </ReportLayout>
}
