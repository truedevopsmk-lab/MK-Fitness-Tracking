import { useMemo } from 'react'
import { useStore } from '../../state/store'
import { addDays, today, weekStart } from '../../lib/dates'
import { fmtDay, fmtDuration, fmtNumber } from '../../lib/format'
import { GROUP, TYPE_GROUPS, fmtKm, fmtPace, paceOrSpeed, paceSecKm, sortActivities, typeGroup, typeName, weekKeys } from '../../lib/activities'
import { mean } from '../../lib/stats'
import { href } from '../../router'
import StackedBars from '../../charts/StackedBars'
import Card from '../../components/Card'
import ReportLayout, { MiniTrend, ReportNote, TableView, rangeBounds, useRange } from './ReportLayout'
import '../../styles/activities.css'

/** Horizontal bars, one hue. rows: [{ key, label, value, text, sub }] */
export function BarList({ rows, hue = 'steps' }) {
  const max = Math.max(1, ...rows.map(r => r.value))
  return <div className="arep-bars">{rows.map(r => <div key={r.key}>
    <div className="arep-bar-head"><span>{r.label}</span><strong className="num">{r.text}{r.sub && <small>{r.sub}</small>}</strong></div>
    <div className="arep-track"><i style={{ width: `${Math.max(2, r.value / max * 100)}%`, background: `var(--hue-${hue})` }} /></div>
  </div>)}</div>
}

const OTHER = { key: 'other_', label: 'Other', color: 'var(--text-3)' }
const SERIES_HUES = ['steps', 'intensity', 'battery', 'hrv', 'readiness']

export default function ActivitiesReport() {
  const [range, setRange] = useRange(30)
  const activities = useStore(s => s.activities)
  const { from, to } = rangeBounds(range)
  const inRange = useMemo(() => sortActivities(activities.filter(a => a.day >= from && a.day <= to)), [activities, from, to])
  const prev = useMemo(() => { const { prevFrom, prevTo } = rangeBounds(range); return activities.filter(a => a.day >= prevFrom && a.day <= prevTo) }, [activities, range])

  const totals = useMemo(() => {
    const t = { n: 0, s: 0, m: 0, kcal: 0 }
    for (const a of inRange) { t.n += 1; t.s += a.durationSec || 0; t.m += a.distanceM || 0; t.kcal += a.calories || 0 }
    return t
  }, [inRange])
  const prevTotals = useMemo(() => ({ n: prev.length, s: prev.reduce((x, a) => x + (a.durationSec || 0), 0) }), [prev])

  const byType = useMemo(() => {
    const m = {}
    for (const a of inRange) { const g = typeGroup(a.type); m[g] = m[g] || { n: 0, s: 0 }; m[g].n += 1; m[g].s += a.durationSec || 0 }
    return TYPE_GROUPS.filter(g => m[g.key]).map(g => ({ ...g, ...m[g.key] })).sort((a, b) => b.s - a.s)
  }, [inRange])

  const weekly = useMemo(() => {
    const keep = byType.slice(0, byType.length > 4 ? 3 : 4), keepKeys = new Set(keep.map(g => g.key))
    const series = keep.map((g, i) => ({ key: g.key, label: g.plural, color: `var(--hue-${SERIES_HUES[i]})` }))
    if (byType.length > 4) series.push({ ...OTHER, key: 'other_' })
    const rows = weekKeys(from, to).map(date => ({ date }))
    const idx = Object.fromEntries(rows.map(r => [r.date, r]))
    for (const a of inRange) {
      const w = idx[weekStart(a.day)]; if (!w) continue
      const g = typeGroup(a.type), k = keepKeys.has(g) ? g : 'other_'
      w[k] = (w[k] || 0) + (a.durationSec || 0)
    }
    return { rows, series }
  }, [inRange, byType, from, to])

  const paces = useMemo(() => {
    const runs = inRange.filter(a => typeGroup(a.type) === 'run' && paceSecKm(a) && a.distanceM >= 1000)
    const byDay = new Map()
    for (const a of runs) { if (!byDay.has(a.day)) byDay.set(a.day, []); byDay.get(a.day).push(paceSecKm(a)) }
    const series = [...byDay].map(([date, v]) => ({ date, value: mean(v) })).sort((a, b) => a.date.localeCompare(b.date))
    return { runs, series }
  }, [inRange])

  const hl = useMemo(() => {
    const best = (list, f, dir = 1) => list.reduce((b, a) => { const v = f(a); return v != null && (b == null || v * dir > b.v * dir) ? { a, v } : b }, null)
    const longest = best(inRange, a => a.durationSec)
    const far = best(inRange.filter(a => a.distanceM > 0), a => a.distanceM)
    const fast = best(paces.runs.filter(a => a.distanceM >= 3000), a => paceSecKm(a), -1)
    const load = best(inRange, a => a.trainingLoad)
    return { longest, far, fast, load }
  }, [inRange, paces])

  const csv = () => ({
    filename: `activities-${from}-to-${to}.csv`, rows: inRange,
    columns: [
      { key: 'day', label: 'date' }, { key: 'name' }, { key: 'type' },
      { key: 'durationSec', label: 'duration_sec' }, { key: 'distanceM', label: 'distance_m' }, { key: 'calories' },
      { key: 'avgHr', label: 'avg_hr' }, { key: 'maxHr', label: 'max_hr' }, { key: 'elevationGainM', label: 'elevation_gain_m' },
      { key: 'trainingLoad', label: 'training_load' }, { key: 'aerobicTE', label: 'aerobic_te' }, { key: 'anaerobicTE', label: 'anaerobic_te' },
    ],
  })
  const vs = (a, b) => b ? (Math.round(Math.abs(a - b) / b * 100) === 0 ? `Same as previous ${range} days` : `${a >= b ? '+' : '−'}${Math.round(Math.abs(a - b) / b * 100)}% vs previous ${range} days`) : `Previous ${range} days: none`
  const summary = [
    { label: 'Activities', value: fmtNumber(totals.n), sub: vs(totals.n, prevTotals.n) },
    { label: 'Active time', value: fmtDuration(totals.s), sub: vs(totals.s, prevTotals.s) },
    { label: 'Distance', value: <>{fmtKm(totals.m)} <small>km</small></>, sub: totals.n ? `${fmtNumber(totals.m / 1000 / Math.max(1, range / 7), 1)} km per week` : null },
    { label: 'Calories', value: <>{fmtNumber(totals.kcal)} <small>kcal</small></>, sub: 'Activity only' },
  ]
  const hlCard = (label, h, text) => h && <a key={label} href={href(`/activities/${encodeURIComponent(h.a.id)}`)}>
    <span>{label}</span><strong className="num">{text}</strong><em>{h.a.name || typeName(h.a.type)}, {fmtDay(h.a.day)}</em></a>
  const rows = hl.longest && [
    hlCard('Longest session', hl.longest, fmtDuration(hl.longest.v)),
    hlCard('Furthest', hl.far, `${fmtKm(hl.far?.v)} km`),
    hlCard('Fastest run (3 km+)', hl.fast, hl.fast && `${fmtPace(hl.fast.v)} /km`),
    hlCard('Highest load', hl.load, hl.load && fmtNumber(hl.load.v)),
  ].filter(Boolean)

  return <ReportLayout title="Activities" icon="activity" hue="intensity" subtitle="Volume, mix and highlights" range={range} onRange={setRange}
    summary={summary} csv={csv} hasData={activities.length > 0} emptyBody="Sync your Garmin activities and this report fills in."
    asOf={activities.length ? `Latest activity: ${fmtDay(sortActivities(activities)[0].day)}` : null}>
    {!inRange.length ? <Card><p className="arep-note">No activities in the last {range} days. Try a longer range.</p></Card> : <>
      <Card title="What you did" subtitle="Time and number of sessions by type">
        <BarList rows={byType.map(g => ({ key: g.key, label: g.plural, value: g.s, text: fmtDuration(g.s), sub: `${g.n} ${g.n === 1 ? 'session' : 'sessions'}` }))} hue="intensity" />
      </Card>

      <Card title="Weekly volume" subtitle="Hours of activity per week, by type">
        <StackedBars data={weekly.rows} series={weekly.series} height={220} unit={3600} format={v => fmtDuration(v)} axisFormat={v => `${Math.round(v / 3600)}h`}
          xFormat={d => fmtDay(d)} tipTitle={d => `Week of ${fmtDay(d, { day: 'numeric', month: 'short' })}`} total ariaLabel="Weekly activity time by type" />
        <TableView caption="Weekly activity time" columns={[{ key: 'date', label: 'Week of', format: d => fmtDay(d) }, ...weekly.series.map(s => ({ key: s.key, label: s.label, align: 'right', format: v => v ? fmtDuration(v) : '—' }))]} rows={[...weekly.rows].reverse()} />
      </Card>

      {paces.series.length > 1 && <Card title="Running pace" subtitle="Average pace per run day, min per km (lower is faster)">
        <MiniTrend data={paces.series} label="Pace" hue="steps" kind="line" height={170} format={v => fmtPace(v)} ariaLabel="Running pace trend" />
        <ReportNote>{paces.runs.length} runs of 1 km or more.</ReportNote>
      </Card>}

      {rows?.length > 0 && <><div className="arep-hl">{rows}</div></>}
    </>}
  </ReportLayout>
}
