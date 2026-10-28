import { useMemo } from 'react'
import { useStore } from '../../state/store'
import { useRoute, setParams } from '../../router'
import { usePrefs } from '../../lib/prefs'
import { METRICS } from '../../lib/metrics'
import { MIN_EACH, OUTCOMES, daysText, findings, habitImpact, impactLine, needText, sampleText } from '../../lib/habits'
import { Button, Card, DeltaChip, Segmented, fmtDelta } from '../../components'
import ReportLayout, { HowToRead, ReportNote, TableView, rangeBounds, useRange } from './ReportLayout'

const r1 = v => v == null ? '' : Math.round(v * 10) / 10

function Standout({ impact, top, range }) {
  const { logged, ready } = impact
  const cta = <div className="hb-cta"><Button size="sm" variant="secondary" href="#/journal" icon="tag">Open Journal</Button></div>
  const rule = `A tag is compared once it has ${MIN_EACH} logged days with it and ${MIN_EACH} without.`
  return <Card title="What stands out" subtitle={`Last ${range} days · ${daysText(logged)} logged`}>
    {logged === 0 && <>
      <p className="rb-lead">Tag your days to see habit impact</p>
      <p className="rs-text">Habit impact compares the night after days with a tag against logged days without it. {rule}</p>
      {cta}
    </>}
    {logged > 0 && ready === 0 && <>
      <p className="rb-lead">Habit impact builds as you log</p>
      <p className="rs-text">You have logged {daysText(logged)} in the last {range}. {rule}</p>
      {cta}
    </>}
    {ready > 0 && !top.length && <>
      <p className="rb-lead">Nothing stands out yet</p>
      <p className="rs-text">{ready} {ready === 1 ? 'tag has' : 'tags have'} enough days to compare. The differences are small or vary a lot from night to night.</p>
    </>}
    {top.length > 0 && <ul className="rp-list">{top.map(f => <li key={f.tag}>
      <span className="rp-li-main">{impactLine(f.label, f.outcome, f.cmp)}<small>{sampleText(f.cmp)}</small></span>
      <DeltaChip delta={f.cmp.diff} metricKey={f.outcome.metric} text={fmtDelta(f.outcome.metric, f.cmp.shown.diff)} />
    </li>)}</ul>}
    {ready > 0 && <p className="rb-foot">Tags often go together, so a difference shows what tends to follow a tag, not what causes it.</p>}
  </Card>
}

function ImpactCard({ impact, outcome }) {
  const f = METRICS[outcome.metric].format
  const rows = impact.tags.map(t => ({ t, cmp: t.outcomes[outcome.key] }))
  const readyRows = rows.filter(r => r.cmp.status !== 'needs-more').sort((a, b) => Math.abs(b.cmp.diff) - Math.abs(a.cmp.diff) || b.cmp.nWith - a.cmp.nWith)
  const needRows = rows.filter(r => r.cmp.status === 'needs-more').sort((a, b) => b.cmp.nWith - a.cmp.nWith)
  const scale = Math.max(outcome.span, ...readyRows.map(r => Math.abs(r.cmp.diff)))
  const diffText = ({ cmp }) => cmp.status === 'needs-more' ? `Needs ${cmp.need.with + cmp.need.without} more`
    : cmp.status === 'same' ? 'Same' : fmtDelta(outcome.metric, cmp.shown.diff) + (cmp.clear ? '' : ' · varies')
  return <Card title="After each tag" subtitle={`${outcome.label} the morning after a tagged day, against logged days without the tag`} className="hb-card" style={{ '--hb-hue': `var(--hue-${outcome.hue})` }}>
    <Segmented label="Measure" value={outcome.key} options={OUTCOMES.map(o => ({ value: o.key, label: o.short }))} onChange={v => setParams({ m: v === 'recovery' ? null : v })} />
    {readyRows.length > 0
      ? <>
        <div className="hb-axis" aria-hidden="true"><span /><span className="hb-axis-bar"><span>Worse</span><span>Same</span><span>Better</span></span><span /></div>
        <ul className="hb-rows">{readyRows.map(({ t, cmp }) => <li key={t.key} className="hb-row" aria-label={`${impactLine(t.label, outcome, cmp)}. ${sampleText(cmp)}`}>
          <span className="hb-name">{t.label}</span>
          <span className="hb-val">{cmp.status === 'same'
            ? <DeltaChip delta={cmp.diff} metricKey={outcome.metric} />
            : <DeltaChip delta={cmp.diff} metricKey={outcome.metric} text={fmtDelta(outcome.metric, cmp.shown.diff)} />}</span>
          <span className="hb-bar">{cmp.status !== 'same' && <i className={`${cmp.tone === 'good' ? 'is-better' : 'is-worse'}${cmp.clear ? '' : ' is-mixed'}`} style={{ width: `${Math.min(1, Math.abs(cmp.diff) / scale) * 50}%` }} />}</span>
          <span className="hb-foot">{f(cmp.shown.with)} vs {f(cmp.shown.without)} · {sampleText(cmp)}{!cmp.clear && cmp.status !== 'same' ? ' · varies a lot' : ''}</span>
        </li>)}</ul>
      </>
      : <ReportNote>No tag has {MIN_EACH} logged days with it and {MIN_EACH} without yet</ReportNote>}
    {needRows.length > 0 && <>
      <h3 className="rb-sub">Not enough days yet</h3>
      <ul className="rp-list">{needRows.map(({ t, cmp }) => <li key={t.key}>
        <span className="rp-li-main">{t.label}<small>{needText(cmp.need)}</small></span><strong className="num">{daysText(cmp.nWith)}</strong>
      </li>)}</ul>
    </>}
    <div><TableView caption={`Habit impact on ${outcome.noun}`} rows={[...readyRows, ...needRows]} columns={[
      { key: 'tag', label: 'Tag', format: (_, r) => r.t.label },
      { key: 'nWith', label: 'With', align: 'right', format: (_, r) => String(r.cmp.nWith) },
      { key: 'nWithout', label: 'Without', align: 'right', format: (_, r) => String(r.cmp.nWithout) },
      { key: 'after', label: 'After tag', align: 'right', format: (_, r) => r.cmp.shown ? f(r.cmp.shown.with) : '—' },
      { key: 'other', label: 'Otherwise', align: 'right', format: (_, r) => r.cmp.shown ? f(r.cmp.shown.without) : '—' },
      { key: 'diff', label: 'Difference', align: 'right', format: (_, r) => diffText(r) },
    ]} /></div>
  </Card>
}

export default function Habits() {
  const days = useStore(s => s.days), journal = useStore(s => s.journal), { sleepNeedHours } = usePrefs()
  const [range, setRange] = useRange(120)
  const { params } = useRoute()
  const outcome = OUTCOMES.find(o => o.key === params.m) || OUTCOMES[0]
  const { from, to } = useMemo(() => rangeBounds(range), [range])
  const impact = useMemo(() => habitImpact(days, journal, from, to, { sleepNeedHours }), [days, journal, from, to, sleepNeedHours])
  const top = useMemo(() => findings(impact, 3), [impact])
  const csv = () => ({
    filename: `mk-fitness-habits-${from}-${to}.csv`,
    rows: impact.tags.flatMap(t => OUTCOMES.map(o => {
      const c = t.outcomes[o.key]
      return { tag: t.key, label: t.label, outcome: o.key, daysWith: c.nWith, daysWithout: c.nWithout, avgWith: r1(c.avgWith), avgWithout: r1(c.avgWithout), difference: r1(c.diff), status: c.status, clear: c.clear }
    })),
    columns: ['tag', 'label', 'outcome', 'daysWith', 'daysWithout', 'avgWith', 'avgWithout', 'difference', 'status', 'clear'].map(k => ({ key: k, label: k })),
  })
  const { logged, tagged, ready, used, clearTags } = impact
  const summary = logged === 0 ? [] : [
    { label: 'Logged', value: daysText(logged), sub: `of the last ${range}` },
    { label: 'With tags', value: daysText(tagged), sub: `${daysText(logged - tagged)} with nothing to tag` },
    { label: 'Compared', value: `${ready} of ${used}`, sub: `tags with ${MIN_EACH}+ days each way` },
    { label: 'Clear patterns', value: String(clearTags), sub: clearTags === 1 ? 'tag with a clear difference' : 'tags with a clear difference' },
  ]
  return <ReportLayout title="Habit impact" icon="tag" hue="readiness" subtitle="How your nights compare after tagged days" ranges={[60, 120, 365]} range={range} onRange={setRange}
    hasData={Object.keys(days).length > 0} csv={csv} summary={summary}
    emptyBody="Sync your Garmin data and tag your days in the Journal, and this report compares the nights after each tag."
    lead={<Standout impact={impact} top={top} range={range} />}>
    {impact.used > 0 && <ImpactCard impact={impact} outcome={outcome} />}
    <HowToRead>A tag belongs to the day it happened, so each tagged day is paired with the night that followed: that night's sleep score and the next morning's recovery, HRV and resting heart rate. Those are compared with the same measures after logged days without the tag; days you didn't log are left out. A tag is compared once it has 5 logged days with it and 5 without. Differences smaller than normal night-to-night noise read as about the same, and "varies a lot" means the nights spread widely, so a few more days could change the average. Tags often go together (a late meal and a drink on the same evening), so a difference shows what tends to follow a tag, not what causes it. This is a trend in your own data, not medical advice.</HowToRead>
  </ReportLayout>
}
