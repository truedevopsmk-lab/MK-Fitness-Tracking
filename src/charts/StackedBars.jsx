import { useEffect, useRef } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fmtDay, fmtNumber } from '../lib/format'
import { niceTicks, useChartTheme } from './chartTheme'
import { Legend, TipCard, defaultTipTitle } from './ChartParts'

const pos = v => typeof v === 'number' && v > 0

/**
 * Stacked columns, one per row (e.g. sleep stages per night, stress levels per day).
 *  data     [{ date, <series.key>: number|null, ... }]
 *  series   [{ key, label, color }] bottom → top; color may be 'var(--stage-deep)'
 *  format   value → string for the tooltip (default number) · axisFormat for the y axis · unit: step grid (3600 for hours)
 *  total    show a total row in the tooltip (format applied) · legend: force on/off (default on for ≥ 2 series)
 */
export default function StackedBars({ data, series, height = 220, format = v => fmtNumber(v), axisFormat, unit = 1, xFormat, tipTitle, total = false, legend, ariaLabel }) {
  const t = useChartTheme()
  const animate = useRef(true)
  useEffect(() => { animate.current = false }, [])
  const cols = series.map(s => ({ ...s, c: t.color(s.color) }))
  const sums = (data || []).map(r => cols.reduce((a, s) => a + (pos(r[s.key]) ? r[s.key] : 0), 0))
  const { ticks, domain } = niceTicks(0, Math.max(0, ...sums), 4, unit)
  const tick = { fill: t.text3, fontSize: 11, fontFamily: t.fontUi }

  // Segment shape: 2px surface gap via stroke, 4px rounded top only on the highest non-empty segment.
  const shape = idx => ({ x, y, width, height: h, payload }) => {
    if (!(h > 0) || !(width > 0)) return null
    const top = !cols.slice(idx + 1).some(s => pos(payload[s.key])), r = top ? Math.min(4, width / 2, h) : 0
    const d = `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + width - r} Q${x + width},${y} ${x + width},${y + r} V${y + h} Z`
    return <path d={d} fill={cols[idx].c} stroke={t.surface} strokeWidth={2} paintOrder="stroke" />
  }
  const Tip = ({ active, payload }) => {
    const p = active && payload?.[0]?.payload
    if (!p) return null
    const rows = [...cols].reverse().map(s => ({ color: s.c, value: pos(p[s.key]) || p[s.key] === 0 ? format(p[s.key], s.key) : '—', label: s.label }))
    if (total) rows.unshift({ value: format(sums[data.indexOf(p)]), label: 'Total' })
    return <TipCard title={(tipTitle || defaultTipTitle)(p.date)} rows={rows} />
  }
  return <div className="chart" role="img" aria-label={ariaLabel || 'Stacked bar chart'}>
    {(legend ?? cols.length > 1) && <Legend items={cols.map(s => ({ label: s.label, color: s.c }))} />}
    <ResponsiveContainer width="100%" height={height} minWidth={0}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="18%">
        <CartesianGrid vertical={false} stroke={t.grid} strokeDasharray="" />
        <XAxis dataKey="date" tickFormatter={xFormat || (d => fmtDay(d))} tick={tick} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={44} tickMargin={8} padding={{ left: 4, right: 4 }} />
        <YAxis ticks={ticks} domain={domain} tickFormatter={axisFormat || (v => fmtNumber(v / unit))} tick={tick} axisLine={false} tickLine={false} width={40} />
        <Tooltip content={<Tip />} cursor={{ fill: t.grid }} isAnimationActive={false} wrapperStyle={{ outline: 'none', zIndex: 5 }} />
        {cols.map((s, i) => <Bar key={s.key} dataKey={s.key} stackId="s" maxBarSize={24} shape={shape(i)} isAnimationActive={animate.current} animationDuration={500} />)}
      </BarChart>
    </ResponsiveContainer>
  </div>
}
