import { useMemo, useState } from 'react'
import { useStore } from '../state/store'
import { useRoute, navigate, href } from '../router'
import { METRICS, deltaTone, isMeaningfulDelta } from '../lib/metrics'
import { dataBounds } from '../data/select'
import { bucketSeries, rollingBaseline, summarize } from '../lib/stats'
import { today } from '../lib/dates'
import { fmtDay, fmtNumber, fmtPct } from '../lib/format'
import { downloadFile, toCsv } from '../lib/csv'
import { metricSeries } from '../data/select'
import TrendChart from '../charts/TrendChart'
import Button from '../components/Button'
import Card from '../components/Card'
import DataTable from '../components/DataTable'
import DeltaChip from '../components/DeltaChip'
import Empty from '../components/Empty'
import Icon from '../components/Icon'
import MissingNote from '../components/MissingNote'
import PageHeader from '../components/PageHeader'
import RangeTabs from '../components/RangeTabs'
import Segmented from '../components/Segmented'
import SectionTitle from '../components/SectionTitle'
import { toast } from '../components/toast'
import { BAR_METRICS, BASELINE_METRICS, GRANULARITIES, RANGES, allowedGranularities, bucketLabel, bucketTitle, canGoNext, canGoPrev, csvColumns, csvFilename, csvRows, defaultGranularity, previousWindow, resolveParams, shiftEnd, windowFor, windowLabel } from './trendLogic'
import '../styles/trends.css'


function MissingStrip({ series }) {
  const n = series.length
  if (!n || !series.some(p => p.value == null)) return null
  return <div className="trend-strip" aria-hidden="true">
    <svg viewBox={`0 0 ${n} 1`} preserveAspectRatio="none" width="100%" height="100%">
      {series.map((p, i) => p.value == null && <rect key={p.date} x={i} y={0} width={Math.max(1, n > 120 ? 1 : .6)} height={1} />)}
    </svg>
  </div>
}

function Stat({ label, value, sub, children }) {
  return <div className="trend-stat">
    <span className="trend-stat-label">{label}</span>
    <span className="trend-stat-value num">{value}</span>
    {children || (sub && <span className="trend-stat-sub">{sub}</span>)}
  </div>
}

export default function TrendDetail({ metricKey }) {
  const m = METRICS[metricKey]
  const { params } = useRoute()
  const days = useStore(s => s.days)
  const todayKey = today()
  const { range, g, end } = resolveParams(params, todayKey)
  const [tableOpen, setTableOpen] = useState(false)
  const bounds = useMemo(() => dataBounds(days), [days])
  const win = useMemo(() => windowFor(end, range), [end, range])
  const prevWin = useMemo(() => previousWindow(win), [win])
  const series = useMemo(() => m ? metricSeries(days, metricKey, win.from, win.to) : [], [days, metricKey, win, m])
  const prevSeries = useMemo(() => m ? metricSeries(days, metricKey, prevWin.from, prevWin.to) : [], [days, metricKey, prevWin, m])
  const summary = useMemo(() => summarize(series, prevSeries), [series, prevSeries])
  const buckets = useMemo(() => {
    const b = bucketSeries(series, g, m?.agg)
    return g === 'day' && BASELINE_METRICS.includes(metricKey) ? rollingBaseline(b, 7) : b
  }, [series, g, m, metricKey])

  if (!m) return <div className="page page-fade">
    <PageHeader title="Metric not found" back="#/trends" />
    <Card><Empty icon="trends" title="We don't track that metric" body="Pick one from the trends list." action={<Button variant="primary" href="#/trends">All trends</Button>} /></Card>
  </div>

  const set = patch => {
    const next = { range, g, end, ...patch }
    if (patch.range) { next.g = defaultGranularity(patch.range) }
    if (next.end >= todayKey) next.end = null
    const dflt = next.range === 30 && next.g === 'day'
    navigate(href(`/trends/${metricKey}`, { range: dflt ? null : next.range, g: next.g === defaultGranularity(next.range) ? null : next.g, end: next.end }), { replace: true })
  }

  const baseKind = BAR_METRICS.includes(metricKey) ? 'bar' : 'area'
  const hasAny = bounds != null
  const present = summary.total - summary.missing
  const total = m.agg === 'sum' && present ? series.reduce((a, p) => a + (p.value ?? 0), 0) : null

  // Reference overlays
  const goalDay = m.goal ? [...series].reverse().map(p => m.goal(days[p.date] || {})).find(v => typeof v === 'number') : null
  const goal = goalDay != null && g === 'day' ? { value: goalDay, label: 'Daily goal' } : null
  const bandDay = metricKey === 'hrv' && g === 'day' ? [...series].reverse().map(p => days[p.date]?.hrv).find(h => h && h.baselineLow != null && h.baselineHigh != null) : null
  const band = bandDay ? { low: bandDay.baselineLow, high: bandDay.baselineHigh, label: 'Balanced range' } : null
  // a shaded band already fills the plot, so draw the series as a plain line to keep the band readable
  const kind = band && baseKind === 'area' ? 'line' : baseKind
  const chartData = band ? buckets.map(({ baseline, ...p }) => p) : buckets

  const canPrev = canGoPrev(win, bounds?.first), canNext = canGoNext(win, todayKey)
  const siblings = Object.keys(METRICS).filter(k => k !== metricKey && METRICS[k].group === m.group).slice(0, 3)
  const unitWord = kind === 'bar' ? 'bar' : 'point'
  const bucketNote = g === 'week' ? `Each ${unitWord} is a week starting Monday.` : g === 'month' ? `Each ${unitWord} is a calendar month.` : null
  const tone = deltaTone(metricKey, summary.delta)

  const exportCsv = () => {
    downloadFile(csvFilename(metricKey, win), toCsv(csvRows(buckets, g), csvColumns(g)))
    toast('CSV exported', { tone: 'good' })
  }
  const columns = [
    { key: 'date', label: g === 'month' ? 'Month' : g === 'week' ? 'Week of' : 'Date', render: r => g === 'month' ? bucketLabel(r.date, g) : fmtDay(r.date, { weekday: g === 'day' ? 'short' : undefined, day: 'numeric', month: 'short' }) },
    { key: 'value', label: m.label, align: 'right', render: r => r.value == null ? <span className="trend-na">No data</span> : m.format(r.value) },
    ...(g === 'day' ? [] : [{ key: 'coverage', label: 'Days with data', align: 'right', render: r => `${Math.round((r.coverage ?? 0) * 100)}%` }]),
  ]
  const tableRows = [...buckets].reverse()

  return <div className="page page-fade trend-page" style={{ '--trend-hue': `var(--hue-${m.hue})` }}>
    <PageHeader title={m.label} subtitle={m.group} back="#/trends"
      actions={hasAny && <Button size="sm" variant="secondary" icon="download" onClick={exportCsv}>Export CSV</Button>} />

    {!hasAny ? <Card><Empty icon="trends" title="No data yet" body="Sync your Garmin data to see this trend." action={<Button variant="primary" href="#/sync">Open Sync Center</Button>} /></Card> : <>
      <div className="trend-filters">
        <RangeTabs value={range} options={RANGES} onChange={r => set({ range: r })} />
        {allowedGranularities(range).length > 1 && <Segmented label="Granularity" value={g} onChange={v => set({ g: v })}
          options={GRANULARITIES.filter(o => allowedGranularities(range).includes(o.value))} />}
      </div>

      <div className="stepper trend-stepper" role="group" aria-label="Choose period">
        <button type="button" className="stepper-btn" disabled={!canPrev} onClick={() => set({ end: shiftEnd(end, range, -1, todayKey) })} aria-label="Earlier period"><Icon name="chevron-left" size={20} /></button>
        <button type="button" className="stepper-label" disabled={!canNext} onClick={() => set({ end: null })} aria-label={`${windowLabel(win)}${canNext ? '. Jump to latest' : ''}`}>
          <span className="stepper-main">{windowLabel(win)}</span>
          <span className="stepper-sub">{canNext ? 'Tap for latest' : `Latest ${range} days`}</span>
        </button>
        <button type="button" className="stepper-btn" disabled={!canNext} onClick={() => set({ end: shiftEnd(end, range, 1, todayKey) })} aria-label="Later period"><Icon name="chevron-right" size={20} /></button>
      </div>

      <section className="trend-stats" aria-label="Summary">
        <Stat label={m.agg === 'sum' ? 'Daily average' : 'Average'} value={m.format(summary.avg)} />
        <Stat label="Lowest" value={m.format(summary.min)} />
        <Stat label="Highest" value={m.format(summary.max)} />
        <Stat label="Vs previous period" value={summary.delta != null && !isMeaningfulDelta(metricKey, summary.delta) ? 'Same' : fmtPct(Math.abs(summary.change) < .05 ? 0 : summary.change, 1).replace('-', '−')} sub={summary.change == null ? 'Not enough data' : undefined}>
          {summary.delta != null && <DeltaChip delta={summary.delta} metricKey={metricKey} tone={tone} note={`prev. ${m.format(summary.prevAvg)}`} />}
        </Stat>
        {total != null && <Stat label="Total" value={fmtNumber(total)} sub={m.unit && m.unit !== 'h' ? m.unit : undefined} />}
      </section>

      <Card title={`${m.label} by ${g}`} subtitle={bucketNote}>
        {present === 0
          ? <Empty icon="trends" title="No data in this period" body="Try another period, or sync to fill in the gap." action={<Button href="#/sync">Open Sync Center</Button>} />
          : <>
            <TrendChart data={chartData} metricKey={metricKey} kind={kind} goal={goal} band={band} height={240}
              axisFormat={metricKey === 'weight' ? v => fmtNumber(v, 1) : undefined} xFormat={d => bucketLabel(d, g)} tipTitle={d => bucketTitle(d, g) || undefined} ariaLabel={`${m.label}, ${windowLabel(win)}`} />
            <MissingStrip series={series} />
            <div className="trend-legend">
              <span><i className="trend-key" />{m.short}</span>
              {g === 'day' && BASELINE_METRICS.includes(metricKey) && !band && <span><i className="trend-key trend-key-dash" />7-day average</span>}
            </div>
          </>}
        <div className="trend-foot">
          <MissingNote missing={summary.missing} total={summary.total} />
          {summary.missing > 0 && present > 0 && <span className="trend-foot-hint">Ticks under the chart mark days without data.</span>}
        </div>
      </Card>

      <Card flush>
        <details className="trend-table" onToggle={e => setTableOpen(e.currentTarget.open)}>
          <summary><span>{tableOpen ? 'Hide table' : 'Show table'}</span><Icon name="chevron-down" size={18} /></summary>
          {tableOpen && <DataTable columns={columns} rows={tableRows} maxRows={31} caption={`${m.label} by ${g}`} />}
        </details>
      </Card>

      {siblings.length > 0 && <>
        <SectionTitle>More in {m.group.toLowerCase()}</SectionTitle>
        <div className="trend-related">
          {siblings.map(k => <a key={k} className="trend-chip" href={href(`/trends/${k}`, { range: range === 30 ? null : range })} style={{ '--chip-hue': `var(--hue-${METRICS[k].hue})` }}>
            <i className="tile-dot" />{METRICS[k].label}<Icon name="chevron-right" size={16} />
          </a>)}
        </div>
      </>}
    </>}
  </div>
}
