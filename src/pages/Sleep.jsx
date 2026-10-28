import { useEffect, useMemo, useRef, useState } from 'react'
import { Bar, BarChart, Cell, CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts'
import { Badge, Button, Card, DataTable, DateStepper, Empty, Icon, KeyValue, MissingNote, PageHeader, RangeTabs, Ring, SectionTitle, StatTile } from '../components'
import { toast } from '../components/toast'
import TrendChart from '../charts/TrendChart'
import { Legend, TipCard, refLabel } from '../charts/ChartParts'
import { niceTicks, useChartTheme } from '../charts/chartTheme'
import { useStore } from '../state/store'
import { usePrefs } from '../lib/prefs'
import { useRoute, setParams, href } from '../router'
import { addDays, daysBetween, today } from '../lib/dates'
import { fmtClock, fmtDay, fmtDuration, fmtNumber, fmtWeekday } from '../lib/format'
import { METRICS, SLEEP_STAGES } from '../lib/metrics'
import { rollingBaseline, summarize } from '../lib/stats'
import { dataBounds, latestValue } from '../data/select'
import { toCsv, downloadFile } from '../lib/csv'
import { averages, buildRows, clockFromNorm, consistency, needSecFor, recoveryPairs, sleepDebt, stageBreakdown, stageSummary, timeInBedSec } from './sleepLogic'
import '../styles/sleep.css'

const num = v => typeof v === 'number' && Number.isFinite(v)
const RANGES = [7, 30, 60, 120, 365]
const STAGE = Object.fromEntries(SLEEP_STAGES.map(s => [s.key, s]))
const HYP_ROWS = ['awake', 'rem', 'light', 'deep'] // top → bottom
const hourLabel = ts => { const d = new Date(ts), h = d.getHours(); return `${h % 12 || 12} ${h < 12 ? 'am' : 'pm'}` }
const fmtH = sec => num(sec) ? fmtDuration(Math.abs(sec)) : '—'
const pctText = v => v == null ? '—' : `${Math.round(v)}%`

/* ---------- Hypnogram (SVG) ---------- */
function Hypnogram({ stages, startTs, endTs }) {
  const wrap = useRef(null), [w, setW] = useState(340), [tip, setTip] = useState(null)
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(220, Math.floor(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const t0 = stages[0].start, t1 = stages.at(-1).end, span = t1 - t0
  const L = 50, R = 6, rowH = 30, top = 4, plotH = rowH * 4, H = top + plotH + 26
  const x = ts => L + ((ts - t0) / span) * (w - L - R)
  const ticks = useMemo(() => {
    const out = [], step = (w - L - R) / (span / 3600000) < 38 ? 2 : 1, d = new Date(t0)
    d.setMinutes(0, 0, 0)
    let t = d.getTime() + 3600000
    while (t < t1 - 600000) { if (t > t0 + 600000 && Math.round((t - d.getTime()) / 3600000) % step === 0) out.push(t); t += 3600000 }
    return out
  }, [t0, t1, w, span])
  const pick = e => {
    const r = e.currentTarget.getBoundingClientRect(), px = e.clientX - r.left
    const ts = t0 + ((px - L) / (w - L - R)) * span
    const seg = ts >= t0 && ts <= t1 ? stages.find(s => ts >= s.start && ts < s.end) : null
    setTip(seg ? { seg, left: Math.min(Math.max(px, 70), w - 70) } : null)
  }
  const sum = stageSummary(stages)
  const label = `Sleep timeline from ${fmtClock(startTs ?? t0)} to ${fmtClock(endTs ?? t1)}. ${sum?.awakeCount ? `${sum.awakeCount} awake period${sum.awakeCount > 1 ? 's' : ''}.` : 'No awake periods.'}${sum?.firstDeepMin != null ? ` First deep sleep ${sum.firstDeepMin} minutes after falling asleep.` : ''}`
  return <div className="sl-hyp" ref={wrap}>
    <svg width={w} height={H} role="img" aria-label={label} onPointerMove={pick} onPointerDown={pick} onPointerLeave={() => setTip(null)}>
      {HYP_ROWS.map((k, i) => <g key={k}>
        <line x1={L} x2={w - R} y1={top + i * rowH + rowH / 2} y2={top + i * rowH + rowH / 2} className="sl-hyp-grid" />
        <text x={L - 8} y={top + i * rowH + rowH / 2 + 4} textAnchor="end" className="sl-hyp-label">{STAGE[k].label}</text>
      </g>)}
      {ticks.map(t => <g key={t}>
        <line x1={x(t)} x2={x(t)} y1={top} y2={top + plotH} className="sl-hyp-vgrid" />
        <text x={x(t)} y={top + plotH + 17} textAnchor="middle" className="sl-hyp-label">{hourLabel(t)}</text>
      </g>)}
      {stages.map((s, i) => {
        const row = HYP_ROWS.indexOf(s.stage)
        if (row < 0) return null
        const sx = x(s.start), sw = Math.max(1.5, x(s.end) - sx)
        return <rect key={i} x={sx} y={top + row * rowH + 5} width={sw} height={rowH - 10} rx={3} style={{ fill: STAGE[s.stage].color }} className={tip?.seg === s ? 'sl-seg is-on' : 'sl-seg'} />
      })}
    </svg>
    {tip && <div className="sl-hyp-tip" style={{ left: tip.left }}><TipCard title={`${fmtClock(tip.seg.start)} – ${fmtClock(tip.seg.end)}`} rows={[{ color: STAGE[tip.seg.stage].color, value: fmtDuration(Math.max(60, (tip.seg.end - tip.seg.start) / 1000)), label: STAGE[tip.seg.stage].label }]} /></div>}
  </div>
}

/* ---------- Stage breakdown ---------- */
function StageBreakdown({ sleep }) {
  const b = stageBreakdown(sleep)
  if (!b) return <p className="sl-note">Stage data isn't available for this night.</p>
  return <div className="sl-stages">
    <div className="sl-bar" role="img" aria-label={b.items.map(i => `${STAGE[i.key].label} ${pctText(i.pct)}`).join(', ')}>
      {b.items.filter(i => i.sec > 0).map(i => <i key={i.key} style={{ flex: i.sec, background: STAGE[i.key].color }} title={`${STAGE[i.key].label} ${fmtH(i.sec)}`} />)}
    </div>
    <ul className="sl-stage-rows">
      {b.items.map(i => <li key={i.key}>
        <i style={{ background: STAGE[i.key].color }} aria-hidden="true" />
        <span className="sl-stage-name">{STAGE[i.key].label}</span>
        <span className="sl-stage-dur num">{fmtH(i.sec)}</span>
        <span className="sl-stage-pct num">{pctText(i.pct)}</span>
      </li>)}
    </ul>
  </div>
}

/* ---------- Shared chart bits ---------- */
const useAxis = () => { const t = useChartTheme(); return { t, tick: { fill: t.text3, fontSize: 11, fontFamily: t.fontUi } } }
const xAxisDate = tick => <XAxis dataKey="date" tickFormatter={d => fmtDay(d)} tick={tick} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={44} tickMargin={8} padding={{ left: 4, right: 4 }} />
const grid = t => <CartesianGrid vertical={false} stroke={t.grid} strokeDasharray="" />
const tipStyle = { outline: 'none', zIndex: 5 }

/** Stacked asleep stages per night + labelled dashed sleep-need line. */
function DurationChart({ rows, needSec }) {
  const { t, tick } = useAxis()
  const series = SLEEP_STAGES.filter(s => s.key !== 'awake')
  const cols = series.map(s => ({ ...s, c: t.color(s.color) }))
  const data = rows.map(r => ({ date: r.date, deep: r.deep, light: r.light, rem: r.rem, awake: r.awake, total: r.dur }))
  const { ticks, domain } = niceTicks(0, Math.max(needSec, ...data.map(d => d.total || 0)), 4, 3600)
  const pos = v => typeof v === 'number' && v > 0
  const shape = idx => ({ x, y, width, height: h, payload }) => {
    if (!(h > 0) || !(width > 0)) return null
    const top = !cols.slice(idx + 1).some(s => pos(payload[s.key])), r = top ? Math.min(4, width / 2, h) : 0
    return <path d={`M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + width - r} Q${x + width},${y} ${x + width},${y + r} V${y + h} Z`} fill={cols[idx].c} stroke={t.surface} strokeWidth={2} paintOrder="stroke" />
  }
  const Tip = ({ active, payload }) => {
    const p = active && payload?.[0]?.payload
    if (!p) return null
    return <TipCard title={fmtWeekday(p.date)} rows={p.total == null ? [{ value: 'No data', label: '' }] : [{ value: fmtDuration(p.total), label: 'Asleep' }, ...[...cols].reverse().map(s => ({ color: s.c, value: fmtDuration(p[s.key]), label: s.label })), { value: fmtDuration(p.awake), label: 'Awake' }]} />
  }
  return <div className="chart" role="img" aria-label="Sleep duration per night, stacked by stage">
    <Legend items={cols.map(s => ({ label: s.label, color: s.c }))} />
    <ResponsiveContainer width="100%" height={220} minWidth={0}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="18%">
        {grid(t)}{xAxisDate(tick)}
        <YAxis ticks={ticks} domain={domain} tickFormatter={v => `${Math.round(v / 3600)}h`} tick={tick} axisLine={false} tickLine={false} width={40} />
        <ReferenceLine y={needSec} stroke={t.text2} strokeDasharray="4 4" strokeWidth={1} label={refLabel(`Sleep need ${fmtDuration(needSec)}`, 'insideTopRight', t)} />
        <Tooltip content={<Tip />} cursor={{ fill: t.grid }} isAnimationActive={false} wrapperStyle={tipStyle} />
        {cols.map((s, i) => <Bar key={s.key} dataKey={s.key} stackId="s" maxBarSize={24} shape={shape(i)} isAnimationActive={false} />)}
      </BarChart>
    </ResponsiveContainer>
  </div>
}

/** Nightly surplus/deficit vs need, diverging around zero. */
function BalanceChart({ rows }) {
  const { t, tick } = useAxis()
  const data = rows.map(r => ({ date: r.date, v: r.balance }))
  const vals = data.map(d => d.v).filter(num)
  const { ticks, domain } = niceTicks(Math.min(0, ...vals), Math.max(0, ...vals), 4, 3600)
  const good = t.color('var(--good)'), bad = t.color('var(--serious)')
  const Tip = ({ active, payload }) => {
    const p = active && payload?.[0]?.payload
    if (!p) return null
    return <TipCard title={fmtWeekday(p.date)} rows={[p.v == null ? { value: 'No data', label: '' } : { color: p.v >= 0 ? good : bad, value: `${p.v >= 0 ? '+' : '−'}${fmtH(p.v)}`, label: p.v >= 0 ? 'Above your need' : 'Below your need' }]} />
  }
  return <div className="chart" role="img" aria-label="Nightly sleep surplus or deficit against sleep need">
    <Legend items={[{ label: 'Above need', color: good }, { label: 'Below need', color: bad }]} />
    <ResponsiveContainer width="100%" height={170} minWidth={0}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="18%" stackOffset="sign">
        {grid(t)}{xAxisDate(tick)}
        <YAxis ticks={ticks} domain={domain} tickFormatter={v => v === 0 ? '0' : `${v > 0 ? '+' : '−'}${Math.abs(Math.round(v / 3600))}h`} tick={tick} axisLine={false} tickLine={false} width={40} />
        <ReferenceLine y={0} stroke={t.text3} strokeWidth={1} />
        <Tooltip content={<Tip />} cursor={{ fill: t.grid }} isAnimationActive={false} wrapperStyle={tipStyle} />
        <Bar dataKey="v" maxBarSize={24} radius={[4, 4, 4, 4]} isAnimationActive={false}>
          {data.map(d => <Cell key={d.date} fill={d.v >= 0 ? good : bad} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  </div>
}

/** Bedtime → wake per night as vertical floating bars on a clock axis (earlier at the top). */
function ClockChart({ rows, bedMean, wakeMean }) {
  const { t, tick } = useAxis()
  const data = rows.map(r => ({ date: r.date, range: r.bedMin != null && r.wakeMin != null ? [r.bedMin, r.wakeMin] : null, bed: r.bedMin, wake: r.wakeMin }))
  const vals = data.flatMap(d => d.range || [])
  const lo = Math.floor((Math.min(...vals) - 30) / 60) * 60, hi = Math.ceil((Math.max(...vals) + 30) / 60) * 60
  const step = hi - lo > 600 ? 120 : 60, ticks = []
  for (let v = lo; v <= hi; v += step) ticks.push(v)
  const color = t.hue('sleep')
  const Tip = ({ active, payload }) => {
    const p = active && payload?.[0]?.payload
    if (!p) return null
    return <TipCard title={fmtWeekday(p.date)} rows={p.range ? [{ value: clockFromNorm(p.bed), label: 'Bedtime' }, { value: clockFromNorm(p.wake), label: 'Wake time' }] : [{ value: 'No data', label: '' }]} />
  }
  return <div className="chart" role="img" aria-label="Bedtime and wake time per night">
    <ResponsiveContainer width="100%" height={240} minWidth={0}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="18%">
        {grid(t)}{xAxisDate(tick)}
        <YAxis reversed ticks={ticks} domain={[lo, hi]} tickFormatter={v => clockFromNorm(v, true)} tick={tick} axisLine={false} tickLine={false} width={48} />
        {bedMean != null && <ReferenceLine y={bedMean} stroke={t.text3} strokeDasharray="4 4" strokeWidth={1} label={refLabel(`Avg bedtime ${clockFromNorm(bedMean)}`, 'insideBottomRight', t)} />}
        {wakeMean != null && <ReferenceLine y={wakeMean} stroke={t.text3} strokeDasharray="4 4" strokeWidth={1} label={refLabel(`Avg wake ${clockFromNorm(wakeMean)}`, 'insideTopRight', t)} />}
        <Tooltip content={<Tip />} cursor={{ fill: t.grid }} isAnimationActive={false} wrapperStyle={tipStyle} />
        <Bar dataKey="range" fill={color} fillOpacity={.85} maxBarSize={14} radius={7} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  </div>
}

function RecoveryScatter({ pairs, splitH }) {
  const { t, tick } = useAxis()
  const color = t.hue('battery')
  const xs = pairs.map(p => p.h), ys = pairs.map(p => p.bb)
  const xt = niceTicks(Math.min(...xs) - .3, Math.max(...xs) + .3, 4, 1), yt = niceTicks(Math.min(...ys) - 3, Math.max(...ys) + 3, 4, 1)
  const Tip = ({ active, payload }) => {
    const p = active && payload?.[0]?.payload
    if (!p) return null
    return <TipCard title={fmtWeekday(p.date)} rows={[{ value: fmtDuration(p.h * 3600), label: 'Slept' }, { color, value: `+${fmtNumber(p.bb)}`, label: 'Body Battery gained' }]} />
  }
  return <div className="chart" role="img" aria-label="Scatter of sleep duration against Body Battery gained overnight">
    <ResponsiveContainer width="100%" height={230} minWidth={0}>
      <ScatterChart margin={{ top: 8, right: 12, bottom: 18, left: 0 }}>
        {grid(t)}
        <XAxis type="number" dataKey="h" ticks={xt.ticks} domain={xt.domain} tickFormatter={v => `${fmtNumber(v, v % 1 ? 1 : 0)}h`} tick={tick} axisLine={false} tickLine={false} tickMargin={8} label={{ value: 'Sleep duration', position: 'insideBottom', offset: -14, fill: t.text2, fontSize: 11, fontFamily: t.fontUi }} />
        <YAxis type="number" dataKey="bb" ticks={yt.ticks} domain={yt.domain} tickFormatter={v => `+${fmtNumber(v)}`} tick={tick} axisLine={false} tickLine={false} width={40} />
        {splitH >= xt.domain[0] && splitH <= xt.domain[1] && <ReferenceLine x={splitH} stroke={t.text3} strokeDasharray="4 4" strokeWidth={1} label={refLabel(`${splitH} h`, 'insideTopRight', t)} />}
        <Tooltip content={<Tip />} cursor={{ stroke: t.text3, strokeDasharray: '' }} isAnimationActive={false} wrapperStyle={tipStyle} />
        <Scatter data={pairs} isAnimationActive={false} shape={({ cx, cy }) => num(cx) ? <circle cx={cx} cy={cy} r={5} fill={color} fillOpacity={.9} stroke={t.surface} strokeWidth={2} /> : null} />
      </ScatterChart>
    </ResponsiveContainer>
  </div>
}

/* ---------- Page ---------- */
export default function Sleep() {
  const days = useStore(s => s.days), prefs = usePrefs(), route = useRoute()
  const bounds = useMemo(() => dataBounds(days), [days])
  const latest = useMemo(() => latestValue(days, 'sleepDuration', { lookbackDays: 400 }), [days])
  const hasAny = !!latest
  const asParam = route.params.date && /^\d{4}-\d{2}-\d{2}$/.test(route.params.date) ? route.params.date : null
  const date = asParam || latest?.date || today()
  const range = RANGES.includes(+route.params.range) ? +route.params.range : 30
  const sleep = days[date]?.sleep && num(days[date].sleep.durationSec) ? days[date].sleep : null
  const rec = days[date]

  const end = latest?.date || today()
  const rows = useMemo(() => buildRows(days, addDays(end, -(range - 1)), end, prefs.sleepNeedHours), [days, end, range, prefs.sleepNeedHours])
  const prevRows = useMemo(() => buildRows(days, addDays(end, -(2 * range - 1)), addDays(end, -range), prefs.sleepNeedHours), [days, end, range, prefs.sleepNeedHours])
  const withSleep = rows.filter(r => r.has)
  const missing = rows.length - withSleep.length
  const weekRows = useMemo(() => buildRows(days, addDays(end, -6), end, prefs.sleepNeedHours), [days, end, prefs.sleepNeedHours])
  const debt7 = useMemo(() => sleepDebt(weekRows, 7), [weekRows])
  const debtWin = useMemo(() => sleepDebt(rows, rows.length), [rows])
  const cons = useMemo(() => consistency(rows), [rows])
  const rec7 = useMemo(() => recoveryPairs(rows), [rows])
  const avg = useMemo(() => averages(rows), [rows])
  const scoreSeries = useMemo(() => rollingBaseline(rows.map(r => ({ date: r.date, value: r.score })), 7), [rows])
  const scoreSummary = useMemo(() => summarize(rows.map(r => ({ value: r.score })), prevRows.map(r => ({ value: r.score }))), [rows, prevRows])
  const needNow = needSecFor(days[end]?.sleep, prefs.sleepNeedHours)

  if (!hasAny) return <div className="page sl-page">
    <PageHeader title="Sleep" subtitle="Nights, stages and sleep habits" />
    <Card><Empty icon="sleep" title="No sleep data yet" body="Sync your Garmin data to see how you slept, or explore the app with demo data." action={<Button variant="primary" href="#/sync">Open Sync Center</Button>} /></Card>
  </div>

  const setDate = d => setParams({ date: d === latest.date ? null : d })
  const band = sleep && METRICS.sleepScore.band(sleep.score)
  const inBed = timeInBedSec(sleep)
  const need = sleep ? needSecFor(sleep, prefs.sleepNeedHours) : null
  const short = sleep && need ? need - sleep.durationSec : null
  const hrvWeekly = rec?.hrv?.weeklyAvg
  const restingHr = sleep?.restingHr ?? rec?.heartRate?.resting, avgHrv = sleep?.avgHrv ?? rec?.hrv?.lastNight
  const bbGain = sleep ? (num(sleep.bodyBatteryChange) ? sleep.bodyBatteryChange : num(rec?.bodyBattery?.charged) ? rec.bodyBattery.charged : null) : null
  const sub = `Night ending ${fmtWeekday(date)}${!asParam && latest.ageDays > 1 ? ` · latest night on record` : ''}`
  const raw = sleep ? { ...sleep, stages: sleep.stages ? `${sleep.stages.length} segments` : undefined } : null

  const exportCsv = () => {
    const cols = [
      { key: 'date', label: 'date' }, { key: 'score', label: 'score' }, { key: 'dur', label: 'duration_min', value: r => r.dur == null ? '' : Math.round(r.dur / 60) },
      { key: 'deep', label: 'deep_min', value: r => r.deep == null ? '' : Math.round(r.deep / 60) }, { key: 'light', label: 'light_min', value: r => r.light == null ? '' : Math.round(r.light / 60) },
      { key: 'rem', label: 'rem_min', value: r => r.rem == null ? '' : Math.round(r.rem / 60) }, { key: 'awake', label: 'awake_min', value: r => r.awake == null ? '' : Math.round(r.awake / 60) },
      { key: 'bed', label: 'bedtime', value: r => r.startTs ? fmtClock(r.startTs) : '' }, { key: 'wake', label: 'wake_time', value: r => r.endTs ? fmtClock(r.endTs) : '' },
      { key: 'restingHr', label: 'resting_hr' }, { key: 'hrv', label: 'hrv_ms' }, { key: 'bb', label: 'body_battery_change' },
    ]
    downloadFile(`sleep-${rows[0].date}_${end}.csv`, toCsv(withSleep, cols))
    toast('Sleep CSV exported', { tone: 'good' })
  }

  const tableCols = [
    { key: 'date', label: 'Night', render: r => fmtDay(r.date) }, { key: 'score', label: 'Score', align: 'right', format: v => v ?? '—' },
    { key: 'dur', label: 'Asleep', align: 'right', format: v => fmtH(v) },
    { key: 'bed', label: 'Bedtime', align: 'right', render: r => r.bedMin == null ? '—' : clockFromNorm(r.bedMin) },
  ]

  return <div className="page sl-page">
    <PageHeader title="Sleep" subtitle={sub} />
    <DateStepper date={date} onChange={setDate} min={bounds?.first} max={today()} />

    {!sleep ? <Card><Empty icon="moon" title="No sleep recorded this night" body={`Garmin has no sleep data for the night ending ${fmtWeekday(date)}. Try another night or sync again.`}
      action={<div className="row-gap"><Button variant="primary" onClick={() => setDate(latest.date)}>Go to latest night</Button><Button href="#/sync">Open Sync Center</Button></div>} /></Card> : <>
      <Card className="sl-hero">
        <div className="sl-hero-main">
          <Ring value={sleep.score} hue="sleep" size={116} label="Sleep score" />
          <div className="sl-hero-text">
            <div className="sl-hero-dur num">{fmtDuration(sleep.durationSec)}</div>
            <div className="sl-hero-cap">asleep{need && short != null && Math.abs(short) >= 60 ? ` · ${fmtH(short)} ${short > 0 ? 'short of' : 'over'} your ${fmtDuration(need)} need` : ''}</div>
            {band && <Badge tone={band.tone}>{band.label}</Badge>}
          </div>
        </div>
        <dl className="sl-times">
          {num(sleep.startTs) && num(sleep.endTs) && <div><dt>Bedtime to wake</dt><dd className="num">{fmtClock(sleep.startTs)} <Icon name="arrow-down" size={12} className="sl-arrow" /> {fmtClock(sleep.endTs)}</dd></div>}
          {inBed != null && <div><dt>Time in bed</dt><dd className="num">{fmtDuration(inBed)}</dd></div>}
          {num(sleep.awakeSec) && <div><dt>Awake</dt><dd className="num">{fmtDuration(sleep.awakeSec)}</dd></div>}
        </dl>
      </Card>

      <Card title="Sleep stages" subtitle="Share of the night in each stage">
        <StageBreakdown sleep={sleep} />
        {sleep.stages?.length ? <div className="sl-hyp-wrap">
          <h3 className="sl-sub">Timeline</h3>
          <Hypnogram stages={sleep.stages} startTs={sleep.startTs} endTs={sleep.endTs} />
          <p className="sl-note">Tap or hover the timeline for the stage at that time.</p>
        </div> : <p className="sl-note sl-note-pad">Detailed timeline not available for this night.</p>}
      </Card>

      <div className="grid sl-grid">
        {num(restingHr) && <StatTile metricKey="restingHr" value={restingHr} label="Resting HR" sub={num(sleep.restingHr) ? 'During sleep' : 'Daily resting HR'} />}
        {num(avgHrv) && <StatTile metricKey="hrv" value={avgHrv} label="Overnight HRV" delta={num(hrvWeekly) && Math.abs(avgHrv - hrvWeekly) >= 1 ? avgHrv - hrvWeekly : undefined} sub={num(hrvWeekly) ? `7-day avg ${hrvWeekly} ms` : 'No 7-day average yet'} band={false} />}
        {num(sleep.avgRespiration) && <StatTile metricKey="respiration" value={sleep.avgRespiration} label="Respiration" sub="Average overnight" />}
        {num(sleep.avgSpo2) && <StatTile metricKey="spo2" value={sleep.avgSpo2} label="Blood oxygen" sub="Average overnight" />}
        {num(bbGain) && <StatTile metricKey="bodyBatteryCharged" value={bbGain} label="Body Battery gained" sub="Overnight" band={false} />}
      </div>
    </>}

    <div className="sl-trends-head">
      <SectionTitle>{range}-day trends</SectionTitle>
      <RangeTabs value={range} options={RANGES} onChange={r => setParams({ range: r === 30 ? null : r })} />
      <MissingNote missing={missing} total={rows.length} unit="nights" />
    </div>

    {!withSleep.length ? <Card><Empty icon="sleep" title="No nights in this range" body="Pick a longer range or sync more history." action={<Button href="#/sync">Open Sync Center</Button>} /></Card> : <>
      <div className="grid sl-grid">
        <StatTile metricKey="sleepScore" value={avg.score} label="Avg score" delta={scoreSummary.delta} deltaNote="vs previous period" />
        <StatTile metricKey="sleepDuration" value={avg.dur} label="Avg sleep" delta={summarize(rows.map(r => ({ value: r.dur })), prevRows.map(r => ({ value: r.dur }))).delta} deltaNote="vs previous period" />
        <StatTile metricKey="deepSleep" band={false} value={pctText(avg.deepPct)} label="Avg deep" sub="Of the night" />
        <StatTile metricKey="remSleep" band={false} value={pctText(avg.remPct)} label="Avg REM" sub="Of the night" />
        <StatTile metricKey="sleepScore" band={false} value={avg.bedMean == null ? '—' : clockFromNorm(avg.bedMean)} label="Avg bedtime" sub={`${withSleep.length} nights`} />
        <StatTile metricKey="sleepScore" band={false} value={avg.wakeMean == null ? '—' : clockFromNorm(avg.wakeMean)} label="Avg wake time" sub={`${withSleep.length} nights`} />
      </div>

      <Card title="Sleep score" subtitle="Dashed line is the 7-night average">
        <TrendChart data={scoreSeries} metricKey="sleepScore" kind="line" ariaLabel="Sleep score per night" />
      </Card>

      <Card title="Sleep duration" subtitle="Time asleep per night, by stage">
        <DurationChart rows={rows} needSec={needNow} />
      </Card>

      <Card title="Sleep debt" subtitle="How far you are from your sleep need">
        <div className="sl-debt-head">
          <div className="sl-debt-big num">{debt7.nights < 3 ? '—' : Math.abs(debt7.net) < 900 ? 'On track' : fmtDuration(Math.abs(debt7.net))}</div>
          <div className="sl-debt-cap">{debt7.nights < 3 ? 'Not enough nights this week' : Math.abs(debt7.net) < 900 ? 'Your last 7 nights match your sleep need' : debt7.net > 0 ? 'behind this week' : 'ahead this week'}</div>
        </div>
        <BalanceChart rows={rows} />
        <KeyValue rows={[
          { label: `Over ${range} days`, value: debtWin.nights ? (debtWin.net > 0 ? `${fmtDuration(debtWin.net)} behind` : debtWin.net < 0 ? `${fmtDuration(-debtWin.net)} ahead` : 'Even') : '—' },
          { label: 'Nights below need', value: `${withSleep.filter(r => r.balance < 0).length} of ${withSleep.length}` },
        ]} />
        <p className="sl-foot">Debt = nights below your need minus surplus from longer nights, with each night's surplus counted up to 1 h. Need is Garmin's sleep need when available, otherwise your setting of {prefs.sleepNeedHours} h.</p>
      </Card>

      <Card title="Consistency" subtitle="Bedtime and wake time, night by night">
        {cons.nights >= 3 ? <>
          <div className="sl-cons-head">
            <div><div className="sl-cons-big num">±{Math.round(cons.bedSd)} min</div><div className="sl-cons-cap">Bedtime varies</div></div>
            <div><div className="sl-cons-big num">±{Math.round(cons.wakeSd)} min</div><div className="sl-cons-cap">Wake time varies</div></div>
          </div>
          <ClockChart rows={rows} bedMean={cons.bedMean} wakeMean={cons.wakeMean} />
          <p className="sl-foot">Each bar runs from bedtime (top) to wake time (bottom). Variation is the standard deviation over {cons.nights} nights; smaller means a steadier routine.</p>
        </> : <p className="sl-note">Bedtime and wake times are not recorded for enough nights in this range.</p>}
      </Card>

      {rec7.n >= 7 && <Card title="Sleep and Body Battery" subtitle="Charge gained overnight vs time asleep">
        <p className="sl-insight">
          {rec7.longN && rec7.shortN
            ? <>On nights over {rec7.splitH} h you gained <strong>+{fmtNumber(rec7.longMean)}</strong> Body Battery on average, vs <strong>+{fmtNumber(rec7.shortMean)}</strong> on shorter nights.</>
            : <>Average overnight gain was <strong>+{fmtNumber(rec7.longMean ?? rec7.shortMean)}</strong>.</>} {rec7.n} nights. This shows a pattern in your data, not a cause.
        </p>
        <RecoveryScatter pairs={rec7.pairs} splitH={rec7.splitH} />
      </Card>}

      <Card title="Nightly numbers" subtitle={`${withSleep.length} nights with data`} action={<Button size="sm" icon="download" onClick={exportCsv}>Export CSV</Button>}>
        <DataTable columns={tableCols} rows={[...withSleep].reverse()} maxRows={7} caption="Sleep per night" onRowClick={r => { window.scrollTo(0, 0); setDate(r.date) }} />
      </Card>
    </>}

    {raw && <details className="sl-raw"><summary>Raw data for this night</summary><pre>{JSON.stringify(raw, null, 2)}</pre></details>}
  </div>
}
