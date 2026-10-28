// Shared frame for every report page (also used by the activities reports).
//
//   <ReportLayout title icon hue subtitle range onRange summary csv hasData emptyBody ranges>
//     ...sections (use <Card>, <HowToRead>, <ReportNote>)
//   </ReportLayout>
//
//  title      page title · icon: Icon name · hue: registry hue name (tints the icon chip)
//  subtitle   one line under the title, e.g. 'Stress through the day'
//  range      selected day count (use useRange()) · onRange(n) · ranges: option list (default 7/30/60/120/365)
//  summary    [{ label, value, sub?, tone? }]  tone: good|warning|serious|critical|neutral  (value may be a node)
//  csv        () => ({ filename, rows, columns })  columns as in lib/csv.js — shows an Export CSV button
//  hasData    false → Empty state with link to #/sync instead of children (default true)
//  missing    { missing, total } → shows the "n of m days missing" note under the summary
//  asOf       optional string, e.g. 'Latest data: 21 Oct' shown beside the range filter
//
// Helpers: useRange() → [range, setRange] stored in ?range= (default 30), HowToRead (plain-language note),
// ReportNote (one-line muted note for hidden sections), rangeBounds(range), fmtDec, TableView (collapsible table),
// WeekdayBars + weekdayAverages (Mon–Sun pattern), MiniTrend (small labelled line/area/bar chart for any series).
import { useCallback, useMemo, useState } from 'react'
import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { parseDay } from '../../lib/dates'
import { mean } from '../../lib/stats'
import { fmtDay } from '../../lib/format'
import { niceTicks, useChartTheme } from '../../charts/chartTheme'
import { TipCard, defaultTipTitle, refLabel } from '../../charts/ChartParts'
import DataTable from '../../components/DataTable'
import { useRoute, setParams } from '../../router'
import { today, addDays } from '../../lib/dates'
import { downloadFile, toCsv } from '../../lib/csv'
import { fmtNumber } from '../../lib/format'
import PageHeader from '../../components/PageHeader'
import RangeTabs from '../../components/RangeTabs'
import Button from '../../components/Button'
import Card from '../../components/Card'
import Empty from '../../components/Empty'
import Icon from '../../components/Icon'
import MissingNote from '../../components/MissingNote'
import { toast } from '../../components/toast'
import '../../styles/reports.css'

const RANGES = [7, 30, 60, 120, 365]
export const fmtDec = (v, d = 1) => fmtNumber(v, d)

/** Range stored in the URL (?range=30). */
export function useRange(def = 30) {
  const { params } = useRoute()
  const n = Number(params.range)
  const range = RANGES.includes(n) ? n : def
  const setRange = useCallback(v => setParams({ range: v }), [])
  return [range, setRange]
}

/** { from, to, prevFrom, prevTo } for the window ending today and the equal window before it. */
export function rangeBounds(range, asOf = today()) {
  const from = addDays(asOf, -(range - 1))
  return { from, to: asOf, prevFrom: addDays(from, -range), prevTo: addDays(from, -1) }
}

export function HowToRead({ children, title = 'How to read this' }) {
  return <aside className="rp-how"><Icon name="insights" size={18} /><div><h3>{title}</h3><p>{children}</p></div></aside>
}

export function ReportNote({ children }) {
  return <p className="rp-note"><Icon name="minus" size={14} />{children}</p>
}

export function TableView({ columns, rows, caption, maxRows = 14 }) {
  const [open, setOpen] = useState(false)
  return <details className="rp-table" onToggle={e => setOpen(e.currentTarget.open)}><summary>{open ? 'Hide table' : 'Show table'}</summary><DataTable columns={columns} rows={rows} caption={caption} maxRows={maxRows} /></details>
}

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
/** Mean of a dense [{date,value}] series per weekday (Mon first) → [{ date: 'Mon', value, n }] */
export function weekdayAverages(series) {
  const buckets = DOW.map(() => [])
  for (const p of series) if (p.value != null) buckets[(parseDay(p.date).getDay() + 6) % 7].push(p.value)
  return DOW.map((label, i) => ({ date: label, value: mean(buckets[i]), n: buckets[i].length }))
}

const num = v => typeof v === 'number' && Number.isFinite(v)

/** Weekday bar chart. data from weekdayAverages. Highlights nothing by colour alone: the best/worst are in the copy. */
export function WeekdayBars({ data, hue = 'steps', label, format = v => fmtNumber(v), domain, height = 170, ref }) {
  const t = useChartTheme()
  const color = t.hue(hue)
  const vals = data.map(d => d.value).filter(num)
  const { ticks, domain: dom } = niceTicks(domain ? domain[0] : 0, domain ? domain[1] : Math.max(1, ...vals, ref?.value ?? 0), 4)
  const tick = { fill: t.text3, fontSize: 11, fontFamily: t.fontUi }
  const Tip = ({ active, payload }) => {
    const p = active && payload?.[0]?.payload
    return p ? <TipCard title={p.date} rows={[{ color, value: num(p.value) ? format(p.value) : 'No data', label }, { value: `${p.n}`, label: p.n === 1 ? 'day' : 'days' }]} /> : null
  }
  return <div className="chart" role="img" aria-label={`${label} by day of the week`}>
    <ResponsiveContainer width="100%" height={height} minWidth={0}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="22%">
        <CartesianGrid vertical={false} stroke={t.grid} strokeDasharray="" />
        <XAxis dataKey="date" tick={tick} axisLine={false} tickLine={false} tickMargin={8} />
        <YAxis ticks={ticks} domain={dom} tick={tick} axisLine={false} tickLine={false} width={44} tickFormatter={v => format(v)} />
        {ref && num(ref.value) && <ReferenceLine y={ref.value} stroke={t.text2} strokeDasharray="4 4" strokeWidth={1} label={refLabel(ref.label, 'insideTopRight', t)} />}
        <Tooltip content={<Tip />} cursor={{ fill: t.grid }} isAnimationActive={false} wrapperStyle={{ outline: 'none', zIndex: 5 }} />
        <Bar dataKey="value" fill={color} maxBarSize={28} radius={[4, 4, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  </div>
}

/**
 * Compact single-series chart with its own label (TrendChart takes its label from the registry).
 *  data [{date,value,...}] · kind line|area|bar · domain [lo,hi] fixed · refLine { value, label } · line2 key of a second dashed series
 *  rangeBand { low, high, flag, label } per-point shaded band: keys of the low/high numbers on each row, `flag` key marks points to dot, label for the tooltip
 */
export function MiniTrend({ data, label, hue = 'steps', kind = 'line', height = 120, format = v => fmtNumber(v), domain, refLine, band, rangeBand, line2, line2Label = 'Average', xFormat, axisFormat, tipTitle, ariaLabel }) {
  const t = useChartTheme()
  const color = t.hue(hue)
  const vals = data.flatMap(p => [p.value, line2 ? p[line2] : null])
  if (refLine && num(refLine.value)) vals.push(refLine.value)
  if (band) vals.push(band.low, band.high)
  if (rangeBand) for (const p of data) vals.push(p[rangeBand.low], p[rangeBand.high])
  const nums = vals.filter(num)
  let lo = nums.length ? Math.min(...nums) : 0, hi = nums.length ? Math.max(...nums) : 1
  if (domain) [lo, hi] = domain
  else if (kind === 'bar') lo = Math.min(0, lo)
  else { const pad = (hi - lo) * .12 || 1; lo = Math.max(0, lo - pad); hi += pad }
  const { ticks, domain: dom } = niceTicks(lo, hi, 3)
  const tick = { fill: t.text3, fontSize: 11, fontFamily: t.fontUi }
  const lonely = i => num(data[i]?.value) && !num(data[i - 1]?.value) && !num(data[i + 1]?.value)
  const dot = ({ cx, cy, index }) => (lonely(index) || (rangeBand && data[index]?.[rangeBand.flag])) && num(cx) ? <circle key={index} cx={cx} cy={cy} r={3} fill={color} stroke={t.surface} strokeWidth={2} /> : <g key={index} />
  const Tip = ({ active, payload }) => {
    const p = active && payload?.[0]?.payload
    if (!p) return null
    return <TipCard title={(tipTitle || defaultTipTitle)(p.date)} rows={[{ color, value: num(p.value) ? format(p.value) : 'No data', label }, ...(rangeBand && num(p[rangeBand.low]) && num(p[rangeBand.high]) ? [{ value: `${format(p[rangeBand.low])}–${format(p[rangeBand.high])}`, label: rangeBand.label }] : []), ...(line2 && num(p[line2]) ? [{ value: format(p[line2]), label: line2Label }] : [])]} />
  }
  const common = { dataKey: 'value', stroke: color, strokeWidth: 2, strokeLinecap: 'round', connectNulls: false, isAnimationActive: false, dot, activeDot: { r: 4, fill: color, stroke: t.surface, strokeWidth: 2 } }
  return <div className="chart" role="img" aria-label={ariaLabel || `${label} chart`}>
    <ResponsiveContainer width="100%" height={height} minWidth={0}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke={t.grid} strokeDasharray="" />
        <XAxis dataKey="date" tickFormatter={xFormat || (d => fmtDay(d))} tick={tick} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={44} tickMargin={8} padding={{ left: kind === 'bar' ? 4 : 8, right: kind === 'bar' ? 4 : 8 }} />
        <YAxis ticks={ticks} domain={dom} tickFormatter={v => (axisFormat || format)(v)} tick={tick} axisLine={false} tickLine={false} width={44} />
        {band && <ReferenceArea y1={band.low} y2={band.high} fill={color} fillOpacity={.12} stroke="none" ifOverflow="hidden" label={band.label ? { value: band.label, position: 'insideTopLeft', fill: t.text2, fontSize: 11, fontFamily: t.fontUi } : undefined} />}
        {refLine && num(refLine.value) && <ReferenceLine y={refLine.value} stroke={t.text2} strokeDasharray="4 4" strokeWidth={1} label={refLabel(refLine.label, 'insideTopRight', t)} />}
        <Tooltip content={<Tip />} cursor={kind === 'bar' ? { fill: t.grid } : { stroke: t.text3, strokeWidth: 1 }} isAnimationActive={false} wrapperStyle={{ outline: 'none', zIndex: 5 }} />
        {rangeBand && <Area type="linear" dataKey={p => num(p[rangeBand.low]) && num(p[rangeBand.high]) ? [p[rangeBand.low], p[rangeBand.high]] : null} stroke="none" fill={color} fillOpacity={.14} connectNulls={false} isAnimationActive={false} dot={false} activeDot={false} />}
        {kind === 'bar' ? <Bar dataKey="value" fill={color} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          : kind === 'area' ? <Area type="linear" fill={color} fillOpacity={.1} {...common} /> : <Line type="linear" {...common} />}
        {line2 && <Line dataKey={line2} type="linear" stroke={t.text3} strokeWidth={1.5} strokeDasharray="4 4" dot={false} activeDot={false} connectNulls={false} isAnimationActive={false} />}
      </ComposedChart>
    </ResponsiveContainer>
  </div>
}

const pos = v => typeof v === 'number' && v > 0
/** Animation-free stacked columns (same look as charts/StackedBars). series [{key,label,color}] bottom→top; unit 3600 for hours. */
export function StackedColumns({ data, series, unit = 1, format = v => fmtNumber(v), axisFormat, height = 220, ariaLabel }) {
  const t = useChartTheme()
  const cols = series.map(s => ({ ...s, c: t.color(s.color) }))
  const sums = data.map(r => cols.reduce((a, s) => a + (pos(r[s.key]) ? r[s.key] : 0), 0))
  const { ticks, domain } = niceTicks(0, Math.max(0, ...sums), 4, unit)
  const tick = { fill: t.text3, fontSize: 11, fontFamily: t.fontUi }
  const shape = idx => ({ x, y, width, height: h, payload }) => {
    if (!(h > 0) || !(width > 0)) return null
    const top = !cols.slice(idx + 1).some(s => pos(payload[s.key])), r = top ? Math.min(4, width / 2, h) : 0
    return <path d={`M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + width - r} Q${x + width},${y} ${x + width},${y + r} V${y + h} Z`} fill={cols[idx].c} stroke={t.surface} strokeWidth={2} paintOrder="stroke" />
  }
  const Tip = ({ active, payload }) => {
    const p = active && payload?.[0]?.payload
    if (!p) return null
    return <TipCard title={defaultTipTitle(p.date)} rows={[{ value: format(sums[data.indexOf(p)]), label: 'Total' }, ...[...cols].reverse().map(s => ({ color: s.c, value: p[s.key] == null ? '—' : format(p[s.key]), label: s.label }))]} />
  }
  return <div className="chart" role="img" aria-label={ariaLabel || 'Stacked bar chart'}>
    <ul className="legend">{cols.map(s => <li key={s.key}><i style={{ background: s.c }} />{s.label}</li>)}</ul>
    <ResponsiveContainer width="100%" height={height} minWidth={0}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="18%">
        <CartesianGrid vertical={false} stroke={t.grid} strokeDasharray="" />
        <XAxis dataKey="date" tickFormatter={d => fmtDay(d)} tick={tick} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={44} tickMargin={8} padding={{ left: 4, right: 4 }} />
        <YAxis ticks={ticks} domain={domain} tickFormatter={axisFormat || (v => fmtNumber(v / unit))} tick={tick} axisLine={false} tickLine={false} width={40} />
        <Tooltip content={<Tip />} cursor={{ fill: t.grid }} isAnimationActive={false} wrapperStyle={{ outline: 'none', zIndex: 5 }} />
        {cols.map((s, i) => <Bar key={s.key} dataKey={s.key} stackId="s" maxBarSize={24} shape={shape(i)} isAnimationActive={false} />)}
      </BarChart>
    </ResponsiveContainer>
  </div>
}

export default function ReportLayout({ title, icon = 'reports', hue = 'steps', subtitle, range, onRange, ranges = RANGES, summary = [], csv, hasData = true, emptyBody, missing, asOf, lead, children }) {
  const exportCsv = useMemo(() => csv && (() => {
    try {
      const { filename, rows, columns } = csv()
      if (!rows?.length) { toast('Nothing to export in this range', { tone: 'neutral' }); return }
      downloadFile(filename, toCsv(rows, columns))
    } catch (e) { toast('Could not export', { tone: 'warning' }) }
  }), [csv])
  return <div className="page page-fade rp-page" style={{ '--rp-hue': `var(--hue-${hue})` }}>
    <PageHeader back="#/reports" title={title} subtitle={subtitle}
      actions={<span className="rp-chip" aria-hidden="true"><Icon name={icon} size={20} /></span>} />
    {!hasData
      ? <Card><Empty icon={icon} title={`No ${title.toLowerCase()} data yet`} body={emptyBody || 'Sync your Garmin data, or explore with demo data, and this report fills in.'} action={<Button variant="primary" href="#/sync">Open Sync Center</Button>} /></Card>
      : <>
        {lead}
        <div className="rp-filter">
          <RangeTabs value={range} onChange={onRange} options={ranges} />
          {(asOf || missing?.missing > 0) && <div className="rp-filter-meta">{asOf && <span className="rp-asof">{asOf}</span>}{missing && <MissingNote {...missing} />}</div>}
        </div>
        {summary.length > 0 && <div className={`rp-summary rp-summary-${Math.min(summary.length, 4)}`}>
          {summary.map(s => <div className={`rp-stat${s.tone ? ` tone-${s.tone}` : ''}`} key={s.label}>
            <span className="rp-stat-label">{s.label}</span>
            <span className="rp-stat-value num">{s.value ?? '—'}</span>
            {s.sub && <span className="rp-stat-sub">{s.sub}</span>}
          </div>)}
        </div>}
        {children}
        {exportCsv && <div className="rp-export"><Button variant="secondary" icon="download" onClick={exportCsv}>Export CSV</Button></div>}
      </>}
  </div>
}
