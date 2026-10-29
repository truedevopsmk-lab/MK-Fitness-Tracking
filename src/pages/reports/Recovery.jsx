import { useMemo } from 'react'
import { useExcluded, useStore } from '../../state/store'
import { dataBounds, metricSeries } from '../../data/select'
import { summarize } from '../../lib/stats'
import { recoveryBreakdown, recoverySeries } from '../../lib/homeLogic'
import { usePrefs } from '../../lib/prefs'
import { METRICS, hrvStatusBand } from '../../lib/metrics'
import { fmtDay, fmtDuration } from '../../lib/format'
import { today } from '../../lib/dates'
import { setParams, useRoute } from '../../router'
import { Badge, Card, DateStepper, DeltaChip, Icon, Meter, Ring } from '../../components'
import ReportLayout, { HowToRead, MiniTrend, TableView, rangeBounds, useRange } from './ReportLayout'

const needLabel = sec => `${+(sec / 3600).toFixed(1)}h`
const detailOf = f => f.key === 'sleep' ? `Score ${Math.round(f.value)}${f.durationSec ? ` · ${fmtDuration(f.durationSec)} of ${needLabel(f.needSec)} need` : ''}`
  : f.key === 'hrv' ? `${Math.round(f.value)} ms vs ${Math.round(f.base)} ms baseline` : `Peak ${Math.round(f.value)}`

function leadSentence(b) {
  if (b.score == null) return 'Not enough data for this day.'
  if (b.kind === 'garmin') return 'Garmin’s training readiness for this day.'
  if (b.cap) return `A short night capped it at ${b.cap.limit}.`
  const drag = b.factors.find(f => f.key === b.drag)
  return drag ? `${drag.label} held it back most.` : 'No single input held it back.'
}

/** One day of the recovery score split into its inputs; ?date= picks the day (default = the Today hero). */
function WhatMovedIt({ days, sleepNeedHours }) {
  const exclude = useExcluded()
  const { params } = useRoute()
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.date || '') ? params.date : null
  const def = useMemo(() => recoveryBreakdown(days, today(), { sleepNeedHours, exclude }), [days, sleepNeedHours, exclude])
  const defaultDate = def.date ?? today()
  const b = useMemo(() => date ? recoveryBreakdown(days, date, { sleepNeedHours, lookbackDays: 0, exclude }) : def, [days, date, def, sleepNeedHours, exclude])
  const shownDate = date ?? defaultDate, garmin = b.kind === 'garmin'
  const sleepF = b.factors.find(f => f.key === 'sleep')
  const rows = [...b.factors.map(f => ({ f })), ...b.missing.map(m => ({ m }))]
  return <Card className="rb-card" title="What moved it">
    <DateStepper date={shownDate} onChange={d => setParams({ date: d === defaultDate ? null : d })} min={dataBounds(days)?.first} max={today()} />
    <div className="rb-head">
      <Ring value={b.score} hue="readiness" size={64} thickness={8} />
      <div className="rb-head-text">
        <span className="rb-kind">{garmin ? 'Training readiness' : 'Recovery estimate'}</span>
        <p className="rb-lead">{leadSentence(b)}</p>
        {b.change && <DeltaChip delta={b.change.delta} metricKey="readiness" note="vs previous day" />}
      </div>
    </div>
    {rows.length > 0 && <ul className="rb-factors">
      {rows.map(({ f, m }) => m
        ? <li className="rb-factor is-missing" key={m.key}>
          <div className="rb-factor-top"><span className="rb-factor-name">{m.label}</span><span>Not counted</span></div>
          <div className="rb-factor-foot"><span>{m.reason}</span></div>
        </li>
        : <li className="rb-factor" key={f.key}>
          <div className="rb-factor-top">
            <span className="rb-factor-name"><i style={{ background: `var(--hue-${f.hue})` }} />{f.label}<Badge tone={f.band.tone}>{f.band.label}</Badge></span>
            {!garmin && <span className="rb-factor-pts num">{f.points}</span>}
          </div>
          {!garmin && <Meter value={f.points} max={100} hue={f.hue} valueLabel={null} />}
          <div className="rb-factor-foot">
            <span className="num">{detailOf(f)}</span>
            {!garmin && <span className="num">{Math.round(f.share * 100)}% of score</span>}
          </div>
        </li>)}
    </ul>}
    {b.cap && <div className="rp-callout"><Icon name="alert" size={18} /><span>Inputs add up to {b.uncapped}, but sleep was {fmtDuration(b.cap.shortSec)} under your {needLabel(b.cap.needSec)} need, so the estimate is capped at {b.cap.limit}.</span></div>}
    {b.context.length > 0 && <>
      <h3 className="rb-sub">Also watched · not part of the score</h3>
      <ul className="rp-list">
        {b.context.map(c => {
          const fmt = METRICS[c.key].format
          return <li key={c.key}>
            <span className="rp-li-main">{c.label}<small>{c.source === 'garmin' ? `Garmin’s 7-day average ${fmt(c.base)}` : `Average of the previous ${c.n} ${c.key === 'respiration' ? 'nights' : 'days'}: ${fmt(c.base)}`}</small></span>
            <span className="rb-ctx-val"><strong className="num">{fmt(c.value)}</strong><DeltaChip delta={c.delta} metricKey={c.key} /></span>
          </li>
        })}
      </ul>
    </>}
    {b.kind === 'estimate' && <p className="rb-foot">Weights: sleep 40%, HRV 35%, Body Battery 25%. A missing input’s weight is shared by the others.{sleepF?.needSource === 'setting' && <> Sleep need {needLabel(sleepF.needSec)} is set in <a href="#/settings">Settings</a>.</>}</p>}
  </Card>
}

export default function Recovery() {
  const days = useStore(s => s.days), { sleepNeedHours } = usePrefs(), exclude = useExcluded()
  const [range, setRange] = useRange()
  const { from, to } = useMemo(() => rangeBounds(range), [range])
  const d = useMemo(() => {
    const rec = recoverySeries(days, from, to, { sleepNeedHours, exclude }), sleep = metricSeries(days, 'sleepScore', from, to)
    const hrv = metricSeries(days, 'hrv', from, to), bb = metricSeries(days, 'bodyBatteryHigh', from, to)
    // Same score as the Today hero: Garmin readiness when a day has it, else the recovery estimate
    const hasReadiness = rec.some(p => p.kind === 'garmin')
    const rows = rec.map((p, i) => ({ date: p.date, score: p.value, sleep: sleep[i].value, hrv: hrv[i].value, bb: bb[i].value, status: days[p.date]?.hrv?.status || null }))
    const main = rows.map(r => ({ date: r.date, value: r.score }))
    const good = rows.filter(r => r.score != null && r.score >= 75).length, scored = rows.filter(r => r.score != null).length
    const low = rows.filter(r => r.score != null && r.score < 50).length
    return { rows, main, hasReadiness, good, scored, low, sum: summarize(main), ss: summarize(sleep), hs: summarize(hrv), bs: summarize(bb), all: Object.values(days).some(x => x.readiness?.score != null || x.sleep?.score != null || x.bodyBattery?.high != null) }
  }, [days, from, to, sleepNeedHours, exclude])
  const lastStatus = [...d.rows].reverse().find(r => r.status)?.status
  const hb = hrvStatusBand(lastStatus), band = METRICS.readiness.band(d.sum.avg == null ? null : Math.round(d.sum.avg))
  const csv = () => ({ filename: `recovery-${from}_${to}.csv`, rows: d.rows, columns: [{ key: 'date', label: 'Date' }, { key: 'score', label: d.hasReadiness ? 'Readiness' : 'Recovery estimate' }, { key: 'sleep', label: 'Sleep score' }, { key: 'hrv', label: 'HRV (ms)' }, { key: 'bb', label: 'Body Battery high' }] })
  const label = d.hasReadiness ? 'Training readiness' : 'Recovery estimate'
  const small = (title, key, sub, data, hue, fmt, domain) => <div key={title}>
    <div className="rp-multiple-head"><h3><i />{title}</h3><span>{sub}</span></div>
    <MiniTrend data={data} label={title} hue={hue} kind="line" height={110} format={fmt} domain={domain} />
  </div>
  return <ReportLayout lead={<WhatMovedIt days={days} sleepNeedHours={sleepNeedHours} />} title="Recovery" icon="battery" hue="readiness" subtitle="How ready your body is" range={range} onRange={setRange} hasData={d.all} csv={csv}
    missing={{ missing: d.sum.missing, total: d.sum.total }}
    summary={[
      { label: `Average ${d.hasReadiness ? 'readiness' : 'recovery'}`, value: d.sum.avg == null ? '—' : Math.round(d.sum.avg), sub: band ? `${band.label}${d.hasReadiness ? '' : ' (estimate)'}` : 'No data', tone: band?.tone },
      { label: 'Recovered days', value: d.scored ? `${d.good} of ${d.scored}` : '—', sub: 'Score 75 or higher' },
      { label: 'Low-recovery days', value: d.scored ? String(d.low) : '—', sub: 'Score under 50', tone: d.low > d.scored * .3 ? 'warning' : undefined },
      { label: 'Latest HRV status', value: hb?.label || '—', sub: hb ? 'From Garmin' : 'Not reported', tone: hb?.tone },
    ]}>
    <Card title={label} subtitle={d.hasReadiness ? 'Garmin training readiness, 0–100' : 'Our estimate, 0–100, the same as on Today: sleep score and length against your sleep need, HRV against your own usual, and Body Battery high'}>
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
    <HowToRead>{d.hasReadiness ? 'Training readiness is Garmin’s 0–100 guide to how ready you are for a hard session.' : 'We could not find a Garmin readiness score, so the top chart is our own estimate. The top card breaks one day into its inputs, each scored 0–100. HRV tops out at 85: HRV above your usual is not extra recovery.'} The charts below show the main ingredients. When sleep, HRV and Body Battery all dip together, take it as a nudge to go easier. When they climb together, you are absorbing training well. Days you mark sick, injured, travelling or on a break in the Journal, and the night after each, are left out of the HRV and resting heart rate baselines. If one falls in the last 7 nights, your own average of the other nights stands in for Garmin’s weekly one.</HowToRead>
  </ReportLayout>
}
