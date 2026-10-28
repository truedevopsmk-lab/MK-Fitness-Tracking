import { useMemo } from 'react'
import { useStore } from '../../state/store'
import { dataBounds } from '../../data/select'
import { mean } from '../../lib/stats'
import { MIN_DAYS, STEP_POINTS, effortFor, effortPoints, effortSeries, effortStatus, effortTarget, statusText } from '../../lib/effort'
import { recoveryFor, recoverySeries } from '../../lib/homeLogic'
import { usePrefs } from '../../lib/prefs'
import { fmtDay, fmtNumber } from '../../lib/format'
import { today } from '../../lib/dates'
import { setParams, useRoute } from '../../router'
import { Badge, Card, DateStepper, Ring } from '../../components'
import ReportLayout, { HowToRead, MiniTrend, StackedColumns, TableView, rangeBounds, useRange } from './ReportLayout'

const r0 = v => v == null ? null : Math.round(v)

function leadFor(e, target, recScore, isToday) {
  if (e.score != null) return target ? statusText(effortStatus(e.score, target), isToday) : 'A target needs a recovery score for this day.'
  if (e.reason === 'no-data') return isToday ? (target ? `Today’s target ${target.lo}–${target.hi} from recovery ${recScore}` : 'Sync to see today’s effort') : 'Nothing synced for this day.'
  return `Effort builds after ${MIN_DAYS} days · ${e.n} of ${MIN_DAYS} days so far`
}

/** One day of effort split into workouts and everyday steps; ?date= picks the day (default today). */
function DayEffort({ days, acts, pts, sleepNeedHours }) {
  const { params } = useRoute()
  const picked = /^\d{4}-\d{2}-\d{2}$/.test(params.date || '') ? params.date : null
  const date = picked ?? today(), isToday = date === today()
  const e = useMemo(() => effortFor(days, acts, date, pts), [days, acts, date, pts])
  const recScore = useMemo(() => isToday ? recoveryFor(days, date, { sleepNeedHours }).score : recoverySeries(days, date, date, { sleepNeedHours })[0].value, [days, date, isToday, sleepNeedHours])
  const target = effortTarget(recScore)
  const scored = e.score != null
  return <Card className="rb-card" title="Day breakdown">
    <DateStepper date={date} onChange={d => setParams({ date: d === today() ? null : d })} min={dataBounds(days)?.first} max={today()} />
    <div className="rb-head">
      <Ring value={e.score} hue="intensity" size={64} thickness={8} />
      <div className="rb-head-text">
        <span className="rb-kind">Effort estimate</span>
        <p className="rb-lead">{leadFor(e, target, recScore, isToday)}</p>
        {(target || recScore != null) && <div className="rp-chips">
          {target && <Badge tone="neutral" icon={false}>Target {target.lo}–{target.hi}</Badge>}
          {recScore != null && <Badge tone="neutral" icon={false}>Recovery {recScore}</Badge>}
        </div>}
      </div>
    </div>
    {(scored || e.points != null) && <ul className="rp-list rp-list-gap">
      <li><span className="rp-li-main">Workouts<small>{e.workouts ? `${e.workouts} workout${e.workouts === 1 ? '' : 's'}` : 'No workouts this day'}</small></span>
        <strong className="num">{e.load ? `Load ${r0(e.load)}` : 'None'}</strong></li>
      <li><span className="rp-li-main">Everyday steps<small>{fmtNumber(e.everydaySteps ?? 0)} steps outside workouts · {STEP_POINTS} points per 1,000</small></span>
        <strong className="num">{r0(e.stepPoints ?? 0)} pts</strong></li>
      {e.usual != null && <li><span className="rp-li-main">Your usual day<small>Average of the previous {e.n} days with data</small></span>
        <strong className="num">{e.usual} pts</strong></li>}
    </ul>}
    <p className="rb-foot">A usual day scores 50 and twice your usual about 75. Estimate from Garmin training load and steps. It is not a Garmin number.</p>
  </Card>
}

export default function Effort() {
  const days = useStore(s => s.days), acts = useStore(s => s.activities), { sleepNeedHours } = usePrefs()
  const [range, setRange] = useRange()
  const { from, to } = useMemo(() => rangeBounds(range), [range])
  const pts = useMemo(() => effortPoints(days, acts), [days, acts])
  const all = useMemo(() => Object.values(pts).some(p => p.points != null), [pts])
  const d = useMemo(() => {
    const rows = effortSeries(days, acts, from, to, { sleepNeedHours })
    const scored = rows.filter(r => r.value != null), avg = mean(scored.map(r => r.value))
    const both = scored.filter(r => r.lo != null)
    const top = scored.reduce((b, r) => !b || r.value > b.value ? r : b, null)
    return { rows, scored, avg, targetN: both.length, inN: both.filter(r => r.status === 'in').length, above: both.filter(r => r.status === 'above').length, top, missing: rows.length - scored.length }
  }, [days, acts, from, to, sleepNeedHours])
  const csv = () => ({ filename: `effort-${from}_${to}.csv`, rows: d.rows, columns: [{ key: 'date', label: 'Date' }, { key: 'value', label: 'Effort' }, { key: 'lo', label: 'Target low' }, { key: 'hi', label: 'Target high' }, { key: 'load', label: 'Training load' }, { key: 'stepPoints', label: 'Step points' }, { key: 'steps', label: 'Steps' }, { key: 'recovery', label: 'Recovery' }] })
  const cell = v => v == null ? '—' : String(Math.round(v))
  return <ReportLayout title="Effort" icon="gauge" hue="intensity" subtitle="How much you did against what your recovery allowed" range={range} onRange={setRange} hasData={all} csv={csv}
    missing={{ missing: d.missing, total: d.rows.length }}
    lead={<DayEffort days={days} acts={acts} pts={pts} sleepNeedHours={sleepNeedHours} />}
    summary={[
      { label: 'Average effort', value: d.avg == null ? '—' : Math.round(d.avg), sub: 'A usual day is 50' },
      { label: 'Days in target', value: d.targetN ? `${d.inN} of ${d.targetN}` : '—', sub: 'Days with a recovery score' },
      { label: 'Above target', value: d.targetN ? String(d.above) : '—', sub: 'Days over the range' },
      { label: 'Highest', value: d.top ? d.top.value : '—', sub: d.top ? fmtDay(d.top.date) : 'No data' },
    ]}>
    <Card title="Effort and target" subtitle="Daily effort, 0–100. The band is each day’s target from its recovery.">
      <MiniTrend data={d.rows.map(r => ({ date: r.date, value: r.value, lo: r.lo, hi: r.hi }))} label="Effort" hue="intensity" kind="bar" height={200} domain={[0, 100]} format={v => String(Math.round(v))} rangeBand={{ low: 'lo', high: 'hi', flag: 'none', label: 'Target', step: true }} />
    </Card>
    <Card title="What it’s made of" subtitle="Points before scaling: training load plus 2 for every 1,000 steps outside workouts">
      <StackedColumns data={d.rows.map(r => ({ date: r.date, load: r.load, stepPoints: r.stepPoints }))} height={200} format={v => fmtNumber(Math.round(v))}
        series={[{ key: 'load', label: 'Training load', color: 'var(--hue-intensity)' }, { key: 'stepPoints', label: 'Everyday steps', color: 'var(--hue-steps)' }]} />
    </Card>
    <Card>
      <TableView caption="Effort by day" rows={[...d.rows].reverse()} columns={[
        { key: 'date', label: 'Day', format: v => fmtDay(v) }, { key: 'value', label: 'Effort', align: 'right' },
        { key: 'lo', label: 'Target', align: 'right', format: (v, r) => r.lo == null ? '—' : `${r.lo}–${r.hi}` },
        { key: 'load', label: 'Load', align: 'right', format: cell }, { key: 'steps', label: 'Steps', align: 'right', format: v => v == null ? '—' : fmtNumber(v) },
        { key: 'recovery', label: 'Recovery', align: 'right', format: cell }]} />
    </Card>
    <HowToRead>Effort is our estimate from your Garmin data, not a Garmin score. Each day adds the training load of your workouts to 2 points for every 1,000 steps you took outside them, then compares that with your average day over the previous 28 days: a usual day scores 50, twice your usual about 75, and the score never quite reaches 100. The target comes from that day’s recovery: 60–80 when recovery is 75 or more, 40–60 from 50 to 74, and 20–40 below 50. Effort needs 14 days of history before it shows.</HowToRead>
  </ReportLayout>
}
