import { useMemo } from 'react'
import { useStore } from '../../state/store'
import { metricSeries } from '../../data/select'
import { eachDay, weekStart } from '../../lib/dates'
import { summarize } from '../../lib/stats'
import { fmtDay, fmtNumber } from '../../lib/format'
import Card from '../../components/Card'
import ReportLayout, { HowToRead, MiniTrend, TableView, WeekdayBars, rangeBounds, useRange, weekdayAverages } from './ReportLayout'

export default function Steps() {
  const days = useStore(s => s.days)
  const profile = useStore(s => s.profile)
  const [range, setRange] = useRange()
  const { from, to, prevFrom, prevTo } = useMemo(() => rangeBounds(range), [range])
  const d = useMemo(() => {
    const st = metricSeries(days, 'steps', from, to), sum = summarize(st, metricSeries(days, 'steps', prevFrom, prevTo))
    const rows = eachDay(from, to).map((date, i) => ({ date, value: st[i].value, goal: days[date]?.steps?.goal ?? profile?.stepGoal ?? null, distanceM: days[date]?.steps?.distanceM ?? null }))
    const withGoal = rows.filter(r => r.value != null && r.goal != null)
    const hit = withGoal.filter(r => r.value >= r.goal).length
    let best = null, streak = 0, bestStreak = 0
    for (const r of rows) { if (r.value != null && r.goal != null && r.value >= r.goal) { streak += 1; bestStreak = Math.max(bestStreak, streak) } else streak = 0 }
    let cur = 0
    for (let i = rows.length - 1; i >= 0; i -= 1) { const r = rows[i]; if (r.value != null && r.goal != null && r.value >= r.goal) cur += 1; else if (i === rows.length - 1 && r.value == null) continue; else break }
    for (const r of rows) if (r.value != null && (!best || r.value > best.value)) best = r
    const weeks = new Map()
    for (const r of rows) { const k = weekStart(r.date); if (!weeks.has(k)) weeks.set(k, []); weeks.get(k).push(r.value) }
    const weekly = [...weeks].map(([date, v]) => ({ date, value: v.some(x => x != null) ? v.reduce((a, b) => a + (b || 0), 0) : null, n: v.filter(x => x != null).length }))
    const dist = rows.filter(r => r.distanceM != null)
    return { rows, sum, withGoal: withGoal.length, hit, best, bestStreak, cur, weekly, wk: weekdayAverages(st), distKm: dist.length ? dist.reduce((a, r) => a + r.distanceM, 0) / 1000 : null, distDays: dist.length,
      goal: rows.at(-1)?.goal ?? profile?.stepGoal ?? null, all: Object.values(days).some(x => x.steps?.total != null) }
  }, [days, profile, from, to, prevFrom, prevTo])
  const total = d.rows.reduce((a, r) => a + (r.value || 0), 0)
  const csv = () => ({ filename: `steps-${from}_${to}.csv`, rows: d.rows, columns: [{ key: 'date', label: 'Date' }, { key: 'value', label: 'Steps' }, { key: 'goal', label: 'Goal' }, { key: 'distanceM', label: 'Distance (km)', value: r => r.distanceM == null ? '' : (r.distanceM / 1000).toFixed(2) }] })
  const wkVals = d.wk.filter(w => w.value != null)
  const top = wkVals.length ? wkVals.reduce((a, b) => a.value > b.value ? a : b) : null
  return <ReportLayout title="Steps" icon="steps" hue="steps" subtitle="How much you moved" range={range} onRange={setRange} hasData={d.all} csv={csv}
    missing={{ missing: d.sum.missing, total: d.sum.total }}
    summary={[
      { label: 'Daily average', value: d.sum.avg == null ? '—' : fmtNumber(Math.round(d.sum.avg)), sub: d.sum.change == null ? 'steps a day' : `${d.sum.change >= 0 ? '+' : '−'}${Math.abs(Math.round(d.sum.change))}% vs previous period` },
      { label: 'Goal reached', value: d.withGoal ? `${d.hit} of ${d.withGoal}` : '—', sub: d.withGoal ? `days (${Math.round(d.hit / d.withGoal * 100)}%)` : 'No goal set', tone: d.withGoal ? (d.hit / d.withGoal >= .6 ? 'good' : undefined) : undefined },
      { label: 'Best day', value: d.best ? fmtNumber(d.best.value) : '—', sub: d.best ? fmtDay(d.best.date) : undefined },
      { label: 'Total steps', value: fmtNumber(total), sub: d.distKm != null ? `${fmtNumber(d.distKm, 0)} km walked` : 'In this range' },
    ]}>
    <Card title="Daily steps" subtitle={d.goal ? `Dashed line is your goal of ${fmtNumber(d.goal)}` : undefined}>
      <MiniTrend data={d.rows} label="Steps" hue="steps" kind="bar" height={230} refLine={d.goal ? { value: d.goal, label: `Goal ${fmtNumber(d.goal)}` } : undefined} format={v => v >= 1000 ? `${fmtNumber(v / 1000, 1)}k` : fmtNumber(v)} ariaLabel="Daily steps against goal" />
      {d.withGoal > 0 && <p className="rp-note" style={{ paddingBottom: 0 }}>Goal reached {d.hit} of {d.withGoal} days. Longest run in a row: {d.bestStreak} {d.bestStreak === 1 ? 'day' : 'days'}{d.cur ? `; current run: ${d.cur}` : ''}.</p>}
    </Card>
    <div className="rp-split">
      {d.weekly.length > 1 && <Card title="Weekly totals" subtitle="Steps per week (Monday start)">
        <MiniTrend data={d.weekly} label="Steps" hue="steps" kind="bar" height={170} format={v => v >= 1000 ? `${fmtNumber(v / 1000, v >= 100000 ? 0 : 1)}k` : fmtNumber(v)} xFormat={v => fmtDay(v)} tipTitle={v => `Week of ${fmtDay(v)}`} />
      </Card>}
      <Card title="By day of the week" subtitle="Average steps">
        <WeekdayBars data={d.wk} hue="steps" label="Average steps" format={v => v >= 1000 ? `${fmtNumber(v / 1000, 1)}k` : fmtNumber(v)} ref={d.goal ? { value: d.goal, label: 'Goal' } : undefined} />
        {top && <p className="rp-note" style={{ paddingBottom: 0 }}>{top.date} is your most active day, at about {fmtNumber(Math.round(top.value))} steps.</p>}
      </Card>
    </div>
    <Card>
      <TableView caption="Daily steps" rows={[...d.rows].reverse()} columns={[
        { key: 'date', label: 'Day', format: v => fmtDay(v) }, { key: 'value', label: 'Steps', align: 'right', format: v => v == null ? '—' : fmtNumber(v) },
        { key: 'goal', label: 'Goal', align: 'right', format: v => v == null ? '—' : fmtNumber(v) },
        { key: 'distanceM', label: 'Distance', align: 'right', format: v => v == null ? '—' : `${(v / 1000).toFixed(1)} km` }]} />
    </Card>
    <HowToRead>Each bar is one day of steps. The dashed line is your daily goal, so bars above it are days you reached it. Weekly totals smooth out busy and quiet days, and the weekday chart shows when you move most. Aim for a steady weekly pattern rather than perfect days.</HowToRead>
  </ReportLayout>
}
