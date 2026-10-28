import { useMemo } from 'react'
import { CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useStore } from '../../state/store'
import { parseDay, today, toDay } from '../../lib/dates'
import { fmtClock, fmtDuration } from '../../lib/format'
import { dayTimeline, defaultTimelineDay, timeTicks, timelineDays } from '../../lib/timeline'
import { setParams, useRoute } from '../../router'
import { niceTicks, useChartTheme } from '../../charts/chartTheme'
import { TipCard } from '../../charts/ChartParts'
import Card from '../../components/Card'
import Icon from '../../components/Icon'
import DateStepper from '../../components/DateStepper'
import ReportLayout, { HowToRead, ReportNote, TableView } from './ReportLayout'

const pad = n => String(n).padStart(2, '0')
const hourLabel = ts => `${pad(new Date(ts).getHours())}:00`

function LaneChart({ t, points, hue, label, unit, scaleLabel, height, ticks, domain, last, hrRange }) {
  const th = useChartTheme(), color = th.hue(hue)
  const tick = { fill: th.text3, fontSize: 11, fontFamily: th.fontUi }
  const sleepHue = th.hue('sleep'), actHue = th.hue('intensity')
  const scale = ticks ? { ticks, domain } : niceTicks(hrRange[0], hrRange[1], 3)
  const Tip = ({ active, payload }) => {
    const p = active && payload?.[0]?.payload
    if (!p || p.v == null) return null
    const act = t.acts.find(a => p.ts >= a.start && p.ts <= a.end), asleep = t.sleep.some(s => p.ts >= s.start && p.ts <= s.end)
    return <TipCard title={fmtClock(p.ts)} rows={[{ color, value: `${p.v}${unit}`, label }, ...(act ? [{ value: act.name }] : asleep ? [{ value: 'Asleep' }] : [])]} />
  }
  return <>
    <div className="tl-head"><h3>{label}</h3><span>{scaleLabel}</span></div>
    <ResponsiveContainer width="100%" height={height} minWidth={0}>
      <LineChart data={points} margin={{ top: 8, right: 8, bottom: last ? 0 : 8, left: 0 }}>
        <CartesianGrid vertical={false} stroke={th.grid} strokeDasharray="" />
        <XAxis dataKey="ts" type="number" scale="time" domain={[t.start, t.end]} ticks={timeTicks(t.start, t.end)} tickFormatter={hourLabel} tick={tick} axisLine={false} tickLine={false} tickMargin={8} hide={!last} />
        <YAxis ticks={scale.ticks} domain={scale.domain} tick={tick} axisLine={false} tickLine={false} width={44} />
        {t.sleep.map(s => <ReferenceArea key={`s${s.start}`} x1={s.start} x2={s.end} fill={sleepHue} fillOpacity={.1} stroke="none" ifOverflow="hidden" />)}
        {t.acts.map((a, i) => <ReferenceArea key={`a${i}`} x1={a.start} x2={a.end} fill={actHue} fillOpacity={.14} stroke="none" ifOverflow="hidden" />)}
        <Tooltip content={<Tip />} cursor={{ stroke: th.text3, strokeWidth: 1 }} isAnimationActive={false} wrapperStyle={{ outline: 'none', zIndex: 5 }} />
        <Line dataKey="v" type="linear" stroke={color} strokeWidth={2} strokeLinecap="round" dot={false} connectNulls={false} isAnimationActive={false} activeDot={{ r: 4, fill: color, stroke: th.surface, strokeWidth: 2 }} />
      </LineChart>
    </ResponsiveContainer>
  </>
}

function Figure({ t }) {
  const { stats: s } = t, hasHr = t.hr.length > 0, hasBb = t.bb.length > 0
  const span = t.end - t.start, pct = v => `${((v - t.start) / span) * 100}%`
  const hasLane = t.sleep.length > 0 || t.acts.length > 0
  const label = [
    s.asleepSec ? `Slept ${fmtDuration(s.asleepSec)}` : 'No sleep recorded',
    s.workouts ? `${s.workouts} workout${s.workouts === 1 ? '' : 's'}` : 'no workouts',
    s.hrMin != null ? `heart rate ${s.hrMin} to ${s.hrMax} bpm` : null,
    s.bbHigh != null ? `Body Battery peak ${s.bbHigh}` : null,
  ].filter(Boolean).join(', ')
  if (!hasHr && !hasBb) return <ReportNote>Detailed readings are kept for recent days only</ReportNote>
  const hrVals = t.hr.map(p => p.v).filter(v => v != null)
  return <div className="tl" role="img" aria-label={label}>
    {hasLane ? <>
      <ul className="legend" style={{ margin: 0 }}>
        {t.sleep.length > 0 && <li><i style={{ background: 'var(--hue-sleep)' }} />Sleep</li>}
        {t.acts.length > 0 && <li><i style={{ background: 'var(--hue-intensity)' }} />Workout</li>}
      </ul>
      <div className="tl-lane" aria-hidden="true">
        {t.sleep.map(x => <i key={`s${x.start}`} style={{ left: pct(x.start), width: `${((x.end - x.start) / span) * 100}%`, background: 'var(--hue-sleep)' }} />)}
        {t.acts.map((x, i) => <i key={`a${i}`} style={{ left: pct(x.start), width: `${((x.end - x.start) / span) * 100}%`, background: 'var(--hue-intensity)' }} />)}
      </div>
    </> : <ReportNote>No sleep or workouts recorded in this window</ReportNote>}
    {hasHr ? <LaneChart t={t} points={t.hr} hue="heart" label="Heart rate" unit=" bpm" scaleLabel="bpm" height={150} hrRange={[Math.min(...hrVals), Math.max(...hrVals)]} last={!hasBb} /> : <ReportNote>No heart-rate readings for this day</ReportNote>}
    {hasBb ? <LaneChart t={t} points={t.bb} hue="battery" label="Body Battery" unit="" scaleLabel="0–100" height={120} ticks={[0, 50, 100]} domain={[0, 100]} last /> : <ReportNote>No Body Battery readings for this day</ReportNote>}
  </div>
}

function Event({ e }) {
  let title, sub, href
  if (e.kind === 'wake') { title = 'Woke up'; href = `#/sleep?date=${e.night}`; sub = `${fmtDuration(e.durationSec)} asleep${e.score != null ? ` · sleep score ${e.score}` : ''}` }
  else if (e.kind === 'sleep') { title = 'Fell asleep'; sub = 'Start of the night' }
  else if (e.kind === 'activity') { title = e.act.name; href = `#/activities/${encodeURIComponent(e.act.id)}`; sub = `${fmtDuration(e.act.durationSec)}${e.act.avgHr ? ` · avg ${e.act.avgHr} bpm` : ''}` }
  else if (e.kind === 'hrMax') { title = 'Highest heart rate'; sub = `${e.value} bpm` }
  else if (e.kind === 'bbHigh') { title = 'Body Battery peak'; sub = String(e.value) }
  else { title = 'Body Battery low'; sub = String(e.value) }
  const time = <strong className="num">{fmtClock(e.ts)}</strong>
  return <li>{href
    ? <a className="tl-ev" href={href}><span className="rp-li-main"><span className="tl-ev-title">{title}</span><small>{sub}</small></span><span className="tl-ev-end">{time}<Icon name="chevron-right" size={16} /></span></a>
    : <><span className="rp-li-main">{title}<small>{sub}</small></span>{time}</>}</li>
}

export default function Timeline() {
  const days = useStore(s => s.days), activities = useStore(s => s.activities)
  const asOf = today(), { params } = useRoute()
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.date || '') ? params.date : null
  const list = useMemo(() => timelineDays(days), [days])
  const defaultDate = useMemo(() => defaultTimelineDay(days, asOf), [days, asOf])
  const shown = date && date <= asOf ? date : defaultDate
  const t = useMemo(() => shown ? dayTimeline(days, activities, shown) : null, [days, activities, shown])
  const s = t?.stats
  const csv = () => ({
    filename: `mk-fitness-day-${shown}.csv`,
    rows: t.hours.map(h => ({ hour: `${toDay(new Date(h.ts))} ${hourLabel(h.ts)}`, hr: h.hr, bb: h.bb, state: h.state || '' })),
    columns: [{ key: 'hour', label: 'Hour' }, { key: 'hr', label: 'Heart rate (bpm)' }, { key: 'bb', label: 'Body Battery' }, { key: 'state', label: 'Activity' }],
  })
  const midnight = t && parseDay(t.date).getTime()
  const subtitle = !t ? '' : t.isToday ? (t.lastTs ? `So far today · last reading ${fmtClock(t.lastTs)}` : 'So far today') : t.start < midnight ? `${fmtClock(t.start)} the night before to midnight` : 'Midnight to midnight'
  return <ReportLayout title="Day timeline" icon="clock" hue="heart" subtitle="Sleep, workouts, heart rate and Body Battery through one day" hasData={list.length > 0 && !!t}
    emptyBody="Sync your Garmin data, or explore with demo data. The timeline needs detailed heart rate or Body Battery readings, which Garmin sends for recent days."
    csv={t ? csv : undefined}
    lead={t && <DateStepper date={shown} onChange={d => setParams({ date: d === defaultDate ? null : d })} min={list[0]} max={asOf} />}
    summary={t ? [
      { label: 'Asleep', value: s.asleepSec ? fmtDuration(s.asleepSec) : '—', sub: s.sleepStart ? `${fmtClock(s.sleepStart)}–${fmtClock(s.sleepEnd)}` : 'No sleep recorded' },
      { label: 'Workouts', value: String(s.workouts), sub: s.workoutSec ? fmtDuration(s.workoutSec) : 'None this day' },
      { label: 'Heart rate', value: s.hrMin != null ? `${s.hrMin}–${s.hrMax}` : '—', sub: s.resting ? `Resting ${s.resting} bpm` : 'bpm' },
      { label: 'Body Battery peak', value: s.bbHigh ?? '—', sub: s.bbHigh != null ? `Low ${s.bbLow}${t.isToday ? ` · now ${s.bbLast}` : ''}` : 'No readings' },
    ] : []}>
    {t && <>
      <Card title="Through the day" subtitle={subtitle}>
        <Figure t={t} />
        <p className="rp-note" style={{ paddingBottom: 0 }}>Detailed readings are kept for the last {list.length} days.</p>
      </Card>
      <Card title="What happened">
        {t.events.length ? <ul className="rp-list">{t.events.map((e, i) => <Event key={i} e={e} />)}</ul> : <ReportNote>Nothing recorded for this day yet</ReportNote>}
      </Card>
      <Card>
        <TableView caption="Hour by hour" rows={t.hours} maxRows={14} columns={[
          { key: 'ts', label: 'Hour', format: v => hourLabel(v) },
          { key: 'hr', label: 'Heart rate', align: 'right', format: v => v == null ? '—' : v },
          { key: 'bb', label: 'Body Battery', align: 'right', format: v => v == null ? '—' : v },
          { key: 'state', label: 'Activity', format: v => v || '' }]} />
      </Card>
      <HowToRead>The bar at the top marks sleep and workouts, and the same periods are shaded faintly behind both charts. Heart rate is shown in 10-minute averages and Body Battery as Garmin sends it. Gaps are times the watch sent no readings, for example while charging or off the wrist. The day starts when you fell asleep the night before, because Garmin counts that night as part of this day. Garmin does not send a stress curve to Personal API keys, so stress is not shown here.</HowToRead>
    </>}
  </ReportLayout>
}
