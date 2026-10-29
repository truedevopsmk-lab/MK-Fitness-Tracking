import { useMemo } from 'react'
import { useExcluded, useStore } from '../../state/store'
import { MIN_NIGHTS, PRECISION, VITALS, fmtRange, healthMonitor, healthSeries, monitorSummary } from '../../lib/health'
import { whenLabel } from '../../lib/homeLogic'
import { METRICS, valueOf } from '../../lib/metrics'
import { fmtDay, fmtNumber } from '../../lib/format'
import { addDays, today } from '../../lib/dates'
import { leftOutText, statusSummary } from '../../lib/journal'
import { Badge, Card, Icon } from '../../components'
import ReportLayout, { HowToRead, MiniTrend, ReportNote, TableView, rangeBounds, useRange } from './ReportLayout'

const NAME = { restingHr: 'Resting HR', hrv: 'HRV', respiration: 'Breathing', spo2: 'SpO₂' }
const unitOf = k => METRICS[k].unit === '%' ? '%' : ` ${METRICS[k].unit}`
const pctOf = (v, lo, hi) => (v - lo) / (hi - lo) * 100
// Non-breaking spaces so a narrow card wraps after a separator, never leaving '· 4 below' to start a line
const outside = c => ['nights in range', c.above && `${c.above}\u00a0above`, c.below && `${c.below}\u00a0below`].filter(Boolean).join('\u00a0· ')

function RangeBar({ vitalKey, value, low, high }) {
  const span = high - low || 1
  const lo = Math.min(low - .75 * span, value - .15 * span), hi = Math.max(high + .75 * span, value + .15 * span)
  const p = v => pctOf(v, lo, hi), fmt = v => fmtNumber(v, PRECISION[vitalKey])
  return <div className="hm-bar" role="img" aria-label={`${fmt(value)}${unitOf(vitalKey)}, normal range ${fmtRange(vitalKey, { low, high })}`}>
    <span className="hm-track" />
    <span className="hm-band" style={{ left: `${p(low)}%`, width: `${p(high) - p(low)}%` }} />
    <span className="hm-mark" style={{ left: `${Math.max(2, Math.min(98, p(value)))}%` }} />
    <span className="hm-tick num" style={{ left: `${p(low)}%` }}>{fmt(low)}</span>
    <span className="hm-tick num" style={{ left: `${p(high)}%` }}>{fmt(high)}</span>
  </div>
}

function VitalsCard({ days }) {
  const asOf = today(), exclude = useExcluded(), journal = useStore(s => s.journal)
  const m = useMemo(() => healthMonitor(days, asOf, { exclude }), [days, asOf, exclude])
  const leftOut = leftOutText(statusSummary(journal, addDays(asOf, -30), asOf), 30, 'normal ranges')
  const s = monitorSummary(m)
  const out = m.vitals.filter(v => v.status !== 'within')
  const icon = s?.tone === 'good' ? 'check' : s?.tone === 'warning' ? 'alert' : 'minus'
  return <Card className="hm-card" title="Last night" subtitle="Each vital against your normal range from the previous 30 nights">
    {s && <div className={`rp-callout${s.tone === 'good' ? ' is-good' : s.tone === 'neutral' ? ' is-neutral' : ''}`}><Icon name={icon} size={18} />
      <span>{s.sentence}{out.length > 1 && s.tone === 'warning' ? ' Several vitals moving together often follows hard training, a late night, alcohol or feeling run-down.' : ''}</span></div>}
    <ul className="hm-vitals" style={{ '--hm-cols': m.vitals.length + m.pending.length }}>
      {m.vitals.map(v => <li className="hm-vital" key={v.key} style={{ '--vital-hue': `var(--hue-${v.hue})` }}>
        <div className="hm-vital-top"><span className="hm-vital-name"><i />{v.name}</span><Badge tone={v.tone}>{v.statusLabel}</Badge></div>
        <div className="hm-vital-val num">{fmtNumber(v.value, PRECISION[v.key])}<small>{METRICS[v.key].unit}</small></div>
        <RangeBar vitalKey={v.key} value={v.value} low={v.range.low} high={v.range.high} />
        <div className="hm-vital-foot">
          <span>{v.range.source === 'garmin' ? `Garmin’s balanced range ${fmtRange(v.key, v.range)}` : `Normal ${fmtRange(v.key, v.range)} · from ${v.range.n} nights`}</span>
          <span>{whenLabel(v.date, asOf, v.key !== 'restingHr')}</span>
        </div>
        {v.streak >= 2 && <p className="hm-streak">{v.status === 'above' ? 'Above' : 'Below'} your normal range {v.streak} nights in a row</p>}
      </li>)}
      {m.pending.map(p => <li className="hm-vital is-pending" key={p.key} style={{ '--vital-hue': `var(--hue-${p.hue})` }}>
        <div className="hm-vital-top"><span className="hm-vital-name"><i />{p.name}</span></div>
        <div className="hm-vital-val num">—</div>
        <div className="hm-vital-foot"><span>{p.reason === 'no-value' ? 'No reading in the last 3 days' : `Range builds after ${MIN_NIGHTS} nights · ${p.n} so far`}</span></div>
      </li>)}
    </ul>
    {leftOut && <ReportNote>{leftOut}</ReportNote>}
    <p className="rb-foot">Normal range = your average ± one standard deviation, so about two nights in three fall inside it.</p>
  </Card>
}

export default function Health() {
  const days = useStore(s => s.days), exclude = useExcluded()
  const [range, setRange] = useRange()
  const { from, to } = useMemo(() => rangeBounds(range), [range])
  const d = useMemo(() => {
    const keys = VITALS.filter(k => k !== 'spo2' || Object.values(days).some(r => valueOf('spo2', r) != null))
    const series = {}, counts = {}
    for (const k of keys) {
      series[k] = healthSeries(days, k, from, to, { exclude })
      const s = series[k]
      counts[k] = { scored: s.filter(p => p.status).length, within: s.filter(p => p.status === 'within').length, above: s.filter(p => p.status === 'above').length, below: s.filter(p => p.status === 'below').length }
    }
    const rows = series[keys[0]].map((p, i) => {
      const row = { date: p.date }
      for (const k of keys) {
        const q = series[k][i]
        row[k] = q.value; row[`${k}Low`] = q.low; row[`${k}High`] = q.high
        row[`${k}Status`] = q.status
      }
      row.outside = keys.filter(k => row[`${k}Status`] === 'above' || row[`${k}Status`] === 'below').map(k => `${NAME[k]} ${row[`${k}Status`]}`).join(', ')
      row.any = keys.some(k => row[k] != null)
      const st = keys.map(k => row[`${k}Status`])
      row.scored = st.every(Boolean); row.allIn = row.scored && st.every(x => x === 'within')
      return row
    })
    const any = Object.values(days).some(r => VITALS.some(k => valueOf(k, r) != null))
    return { keys, series, counts, rows, any, empty: rows.filter(r => !r.any).length, scored: rows.filter(r => r.scored).length, allIn: rows.filter(r => r.allIn).length }
  }, [days, from, to, exclude])
  const csv = () => ({
    filename: `health-${from}_${to}.csv`, rows: d.rows,
    columns: [{ key: 'date', label: 'Date' }, ...d.keys.flatMap(k => [
      { key: k, label: `${NAME[k]} (${METRICS[k].unit})` }, { key: `${k}Low`, label: `${NAME[k]} normal low` }, { key: `${k}High`, label: `${NAME[k]} normal high` }])],
  })
  const hue = k => `var(--hue-${METRICS[k].hue})`
  return <ReportLayout lead={<VitalsCard days={days} />} title="Health monitor" icon="shield" hue="heart" subtitle="Resting HR, HRV and breathing against your normal range" range={range} onRange={setRange} hasData={d.any} csv={csv}
    emptyBody="Sync your Garmin data and your resting heart rate, HRV and breathing rate show up here against your own normal range."
    missing={{ missing: d.empty, total: d.rows.length }}
    summary={[{ label: 'All in range', value: d.scored ? `${d.allIn} of ${d.scored}` : '—', sub: d.scored ? 'nights with every vital inside' : `Needs ${MIN_NIGHTS} nights first` },
      ...d.keys.map(k => {
        const c = d.counts[k]
        return { label: NAME[k], value: c.scored ? `${c.within} of ${c.scored}` : '—', sub: c.scored ? outside(c) : `Needs ${MIN_NIGHTS} nights first` }
      })]}>
    <Card title="Over time" subtitle="Shaded band is your normal range on each night; dots mark nights outside it">
      <div className="rp-multiples">
        {d.keys.map(k => <div key={k}>
          <div className="rp-multiple-head"><h3><i style={{ background: hue(k) }} />{METRICS[k].label}</h3><span>{d.counts[k].scored ? `in range ${d.counts[k].within} of ${d.counts[k].scored}` : ''}</span></div>
          <MiniTrend data={d.series[k]} label={`${METRICS[k].label} (${METRICS[k].unit})`} hue={METRICS[k].hue} kind="line" height={140} format={v => fmtNumber(v, PRECISION[k])} rangeBand={{ low: 'low', high: 'high', flag: 'out', label: 'Normal range' }} />
        </div>)}
      </div>
    </Card>
    <Card>
      <TableView caption="Vitals by night" rows={[...d.rows].reverse()} columns={[
        { key: 'date', label: 'Day', format: v => fmtDay(v) },
        ...d.keys.map(k => ({ key: k, label: NAME[k], align: 'right', format: v => v == null ? '—' : fmtNumber(v, PRECISION[k]) })),
        { key: 'outside', label: 'Outside range', format: v => v || '—' }]} />
    </Card>
    <HowToRead>Your normal range is the middle of your own readings over the previous 30 nights, so it moves with you. One night outside it is common; several in a row is worth noticing. A range needs at least 14 nights of data. For HRV we use Garmin’s balanced range when your watch reports one. Blood oxygen appears here only if your watch records it overnight. These are trends, not a diagnosis. Days you mark sick, injured, travelling or on a break in the Journal, and the night after each, are left out of the normal range. If one falls inside Garmin’s HRV range, the HRV range comes from your other nights instead (when there are 14).</HowToRead>
  </ReportLayout>
}
