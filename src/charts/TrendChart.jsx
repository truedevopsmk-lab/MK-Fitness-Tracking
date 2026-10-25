import { useEffect, useMemo, useRef } from 'react'
import { Area, Bar, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { METRICS } from '../lib/metrics'
import { fmtDay, fmtNumber } from '../lib/format'
import { niceTicks, useChartTheme } from './chartTheme'
import { TipCard, defaultTipTitle, refLabel } from './ChartParts'

const num = v => typeof v === 'number' && Number.isFinite(v)

/**
 * Single-series trend chart.
 *  data       [{ date, value }] dense, value null = gap (also accepts extra keys; `baseline` per point draws a rolling-baseline line)
 *  metricKey  registry key → label, y-axis + tooltip formatting, hue, fixed domain
 *  kind       'line' | 'area' | 'bar'
 *  goal       { value, label } | number — dashed labelled reference line
 *  baseline   { value, label } | number — dashed labelled reference line (muted)
 *  band       { low, high, label } — shaded range (e.g. HRV baseline)
 *  hue        override registry hue · format/axisFormat override registry formatting
 *  xFormat    (date) → axis label · tipTitle (date) → tooltip heading (use for week/month buckets)
 */
export default function TrendChart({ data, metricKey, kind = 'line', goal, baseline, band, height = 220, hue, format, axisFormat, xFormat, tipTitle, ariaLabel }) {
  const t = useChartTheme()
  const m = METRICS[metricKey] || {}
  const animate = useRef(true)
  useEffect(() => { animate.current = false }, [])
  const color = t.hue(hue || m.hue || 'steps')
  const fmt = format || m.format || (v => fmtNumber(v))
  const axisFmt = axisFormat || m.axis || fmt
  const g = typeof goal === 'number' ? { value: goal, label: 'Goal' } : goal
  const b = typeof baseline === 'number' ? { value: baseline, label: 'Baseline' } : baseline

  const { ticks, domain } = useMemo(() => {
    const vals = (data || []).flatMap(p => [p.value, p.baseline]).filter(num)
    if (g && num(g.value)) vals.push(g.value)
    if (b && num(b.value)) vals.push(b.value)
    if (band) vals.push(band.low, band.high)
    if (!vals.length) return { ticks: [0, 1], domain: [0, 1] }
    const unit = m.unit === 'h' ? 3600 : 1
    let lo = Math.min(...vals), hi = Math.max(...vals)
    if (m.domain) { lo = m.domain[0]; hi = m.domain[1] }
    else if (kind === 'bar') lo = Math.min(0, lo)
    else { const pad = (hi - lo) * .12 || unit; lo -= pad; hi += pad; if (Math.min(...vals) >= 0 && lo < 0) lo = 0 }
    return niceTicks(lo, hi, 4, unit)
  }, [data, g?.value, b?.value, band?.low, band?.high, kind, metricKey])

  const hasBaselineSeries = (data || []).some(p => num(p.baseline))
  const lonely = i => num(data[i]?.value) && !num(data[i - 1]?.value) && !num(data[i + 1]?.value)
  const dot = ({ cx, cy, index }) => lonely(index) && num(cx) ? <circle key={index} cx={cx} cy={cy} r={3} fill={color} stroke={t.surface} strokeWidth={2} /> : <g key={index} />
  const tick = { fill: t.text3, fontSize: 11, fontFamily: t.fontUi }
  const xf = xFormat || (d => fmtDay(d))

  const Tip = ({ active, payload }) => {
    const p = active && payload?.[0]?.payload
    if (!p) return null
    return <TipCard title={(tipTitle || defaultTipTitle)(p.date)} rows={[
      { color: color, value: num(p.value) ? fmt(p.value) : 'No data', label: m.short || m.label },
      ...(num(p.baseline) ? [{ value: fmt(p.baseline), label: 'Recent average' }] : []),
    ]} />
  }

  const common = { data, margin: { top: 8, right: 8, bottom: 0, left: 0 } }
  return <div className="chart" role="img" aria-label={ariaLabel || `${m.label || 'Trend'} chart`}>
    <ResponsiveContainer width="100%" height={height} minWidth={0}>
      <ComposedChart {...common}>
        <CartesianGrid vertical={false} stroke={t.grid} strokeDasharray="" />
        <XAxis dataKey="date" tickFormatter={xf} tick={tick} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={44} tickMargin={8} padding={{ left: kind === 'bar' ? 4 : 8, right: kind === 'bar' ? 4 : 8 }} />
        <YAxis ticks={ticks} domain={domain} tickFormatter={axisFmt} tick={tick} axisLine={false} tickLine={false} width={44} />
        {band && <ReferenceArea y1={band.low} y2={band.high} fill={color} fillOpacity={.12} stroke="none" ifOverflow="hidden"
          label={band.label ? { value: band.label, position: 'insideTopLeft', fill: t.text2, fontSize: 11, fontFamily: t.fontUi } : undefined} />}
        {b && num(b.value) && <ReferenceLine y={b.value} stroke={t.text3} strokeDasharray="4 4" strokeWidth={1}
          label={refLabel(`${b.label} ${axisFmt(b.value)}`, 'insideBottomRight', t)} />}
        {g && num(g.value) && <ReferenceLine y={g.value} stroke={t.text2} strokeDasharray="4 4" strokeWidth={1}
          label={refLabel(`${g.label} ${axisFmt(g.value)}`, 'insideTopRight', t)} />}
        <Tooltip content={<Tip />} cursor={kind === 'bar' ? { fill: t.grid } : { stroke: t.text3, strokeWidth: 1 }} isAnimationActive={false} wrapperStyle={{ outline: 'none', zIndex: 5 }} />
        {kind === 'bar'
          ? <Bar dataKey="value" fill={color} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={animate.current} animationDuration={500} />
          : kind === 'area'
            ? <Area dataKey="value" type="linear" stroke={color} strokeWidth={2} strokeLinecap="round" fill={color} fillOpacity={.1} connectNulls={false} dot={dot} activeDot={{ r: 4, fill: color, stroke: t.surface, strokeWidth: 2 }} isAnimationActive={animate.current} animationDuration={500} />
            : <Line dataKey="value" type="linear" stroke={color} strokeWidth={2} strokeLinecap="round" connectNulls={false} dot={dot} activeDot={{ r: 4, fill: color, stroke: t.surface, strokeWidth: 2 }} isAnimationActive={animate.current} animationDuration={500} />}
        {hasBaselineSeries && <Line dataKey="baseline" type="linear" stroke={t.text3} strokeWidth={1.5} strokeDasharray="4 4" dot={false} activeDot={false} connectNulls={false} isAnimationActive={false} />}
      </ComposedChart>
    </ResponsiveContainer>
  </div>
}
