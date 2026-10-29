import { useMemo } from 'react'
import { useExcluded, useStore } from '../state/store'
import { lastNDays } from '../data/select'
import { mean, sum } from '../lib/stats'
import { fmtNumber } from '../lib/format'
import { addDays, today } from '../lib/dates'
import { recoverySeries } from '../lib/homeLogic'
import { effortSeries } from '../lib/effort'
import { habitImpact, findings } from '../lib/habits'
import { MIN_PAIRED, resilienceFor, resilienceSeries, stateInfo } from '../lib/resilience'
import { MIN_NIGHTS, healthMonitor } from '../lib/health'
import { dayTimeline, defaultTimelineDay } from '../lib/timeline'
import { usePrefs } from '../lib/prefs'
import Sparkline from '../charts/Sparkline'
import { dayLabel } from '../components/DateStepper'
import DeltaChip from '../components/DeltaChip'
import Badge from '../components/Badge'
import Icon from '../components/Icon'
import Empty from '../components/Empty'
import Card from '../components/Card'
import Button from '../components/Button'
import PageHeader from '../components/PageHeader'
import '../styles/reports.css'

const REPORTS = [
  { id: 'sleep', title: 'Sleep', icon: 'sleep', hue: 'sleep', to: '#/sleep', desc: 'Score, stages and how long you slept', key: 'sleepScore', label: 'avg score' },
  { id: 'stress', title: 'Stress', icon: 'stress', hue: 'stress', to: '#/reports/stress', desc: 'Stress levels and your calmest days', key: 'stressAvg', label: 'avg stress' },
  { id: 'bb', title: 'Body Battery', icon: 'battery', hue: 'battery', to: '#/reports/body-battery', desc: 'Energy charged, drained and daily range', key: 'bodyBatteryHigh', label: 'avg daily high' },
  { id: 'hrv', title: 'HRV', icon: 'heart', hue: 'hrv', to: '#/reports/hrv', desc: 'Overnight variability against your range', key: 'hrv', label: 'avg overnight', unit: ' ms' },
  { id: 'steps', title: 'Steps', icon: 'steps', hue: 'steps', to: '#/reports/steps', desc: 'Daily steps, goal streaks and weekly totals', key: 'steps', label: 'avg a day' },
  { id: 'hr', title: 'Heart rate', icon: 'heart', hue: 'heart', to: '#/reports/heart-rate', desc: 'Resting heart rate and daily range', key: 'restingHr', label: 'avg resting', unit: ' bpm' },
  { id: 'act', title: 'Activities', icon: 'activity', hue: 'intensity', to: '#/reports/activities', desc: 'Workouts by type, time and distance', custom: 'act' },
  { id: 'load', title: 'Training load', icon: 'flame', hue: 'intensity', to: '#/reports/training-load', desc: 'Load, intensity minutes and balance', custom: 'load' },
  { id: 'effort', title: 'Effort', icon: 'gauge', hue: 'intensity', to: '#/reports/effort', desc: 'Daily effort against a target from your recovery', custom: 'effort', label: 'avg effort' },
  { id: 'rec', title: 'Recovery', icon: 'battery', hue: 'readiness', to: '#/reports/recovery', desc: 'Recovery estimate, sleep, HRV and Body Battery together', custom: 'rec', label: 'avg recovery' },
  { id: 'res', title: 'Resilience', icon: 'scale', hue: 'readiness', to: '#/reports/resilience', desc: 'Whether recovery is keeping up with your effort', custom: 'res' },
  { id: 'health', title: 'Health monitor', icon: 'shield', hue: 'heart', to: '#/reports/health', desc: 'Resting HR, HRV and breathing against your normal range', custom: 'health' },
  { id: 'day', title: 'Day timeline', icon: 'clock', hue: 'heart', to: '#/reports/timeline', desc: 'Sleep, workouts, heart rate and Body Battery through one day', custom: 'day' },
  { id: 'habits', title: 'Habit impact', icon: 'tag', hue: 'readiness', to: '#/reports/habits', desc: 'How your nights compare after tagged days', custom: 'habits' },
]

function useCards() {
  const days = useStore(s => s.days), acts = useStore(s => s.activities), journal = useStore(s => s.journal), { sleepNeedHours } = usePrefs(), exclude = useExcluded()
  return useMemo(() => REPORTS.map(r => {
    let series = [], value = null, sub = r.label, vitals, emptyText, chips
    if (r.custom === 'day') {
      const d = defaultTimelineDay(days, today())
      if (d) {
        const x = dayTimeline(days, acts, d), lbl = dayLabel(d)
        value = x.stats.hrMin != null ? `${x.stats.hrMin}–${x.stats.hrMax}` : null
        sub = `bpm, ${lbl === 'Today' || lbl === 'Yesterday' ? lbl.toLowerCase() : lbl}`
        series = x.hr.map(p => ({ date: p.ts, value: p.v }))
      } else emptyText = 'Needs detailed readings from a recent sync'
    } else if (r.custom === 'health') {
      const m = healthMonitor(days, today(), { exclude })
      value = m.total ? `${m.total - m.outside} of ${m.total}` : null; sub = 'vitals in your normal range'; vitals = m.vitals
      if (m.pending.some(x => x.reason === 'no-range')) emptyText = `Range builds after ${MIN_NIGHTS} nights`
    } else if (r.custom === 'res') {
      const x = resilienceFor(days, acts, today(), { sleepNeedHours, exclude }), info = stateInfo(x.state)
      value = info ? info.short : null; sub = x.recovery == null ? '' : `recovery ${Math.round(x.recovery)} · effort ${Math.round(x.effort)}`
      if (x.reason === 'history') emptyText = `Builds after ${MIN_PAIRED} scored days`
      series = resilienceSeries(days, acts, addDays(today(), -6), today(), { sleepNeedHours, exclude }).map(y => ({ date: y.date, value: y.recovery }))
    } else if (r.custom === 'habits') {
      const x = habitImpact(days, journal, addDays(today(), -119), today(), { sleepNeedHours, exclude })
      if (x.ready) { value = String(x.clearTags); sub = `${x.clearTags === 1 ? 'tag stands' : 'tags stand'} out · last 120 days` }
      else emptyText = x.logged ? 'Compares a tag after 5 days with it and 5 without' : 'Tag your days in the Journal to compare'
      chips = findings(x, 3)
    } else if (r.key || r.custom === 'rec' || r.custom === 'effort') {
      const from = addDays(today(), -6)
      series = r.key ? lastNDays(days, r.key, 7) : r.custom === 'effort' ? effortSeries(days, acts, from, today(), { sleepNeedHours, exclude }).map(x => ({ date: x.date, value: x.value })) : recoverySeries(days, from, today(), { sleepNeedHours, exclude })
      const avg = mean(series.map(p => p.value))
      value = avg == null ? null : `${fmtNumber(Math.round(avg))}${r.unit || ''}`
      const n = series.filter(p => p.value != null).length
      if (n && n < 7) sub = `${r.label} · ${n} of 7 days`
    } else {
      const from = addDays(today(), -6), recent = acts.filter(a => a.day >= from)
      if (r.custom === 'act') {
        series = lastNDays(days, 'trainingLoad', 7).map(p => ({ ...p, value: p.value }))
        value = String(recent.length); sub = recent.length === 1 ? 'workout this week' : 'workouts this week'
        if (!acts.length) value = null
      } else {
        series = lastNDays(days, 'trainingLoad', 7)
        const s = sum(series.map(p => p.value)); value = s == null ? null : fmtNumber(Math.round(s)); sub = 'load, last 7 days'
      }
    }
    return { ...r, series, value, sub, vitals, emptyText, chips }
  }), [days, acts, journal, sleepNeedHours, exclude])
}

export default function Reports() {
  const cards = useCards()
  const any = cards.some(c => c.value != null)
  const hasDays = useStore(s => Object.keys(s.days).length > 0 || s.activities.length > 0)
  return <div className="page page-fade rp-page">
    <PageHeader title="Reports" subtitle="Weekly view of each area, tap for the full report" />
    {!hasDays && <Card><Empty icon="reports" title="No data to report on yet" body="Sync your Garmin data, or explore with demo data, and each report fills in here." action={<Button variant="primary" href="#/sync">Open Sync Center</Button>} /></Card>}
    <div className="rp-grid">
      {cards.map(c => <a key={c.id} className="rp-card" href={c.to} style={{ '--rp-hue': `var(--hue-${c.hue})` }}>
        <div className="rp-card-top"><span className="rp-chip" aria-hidden="true"><Icon name={c.icon} size={18} /></span><h2>{c.title}</h2><Icon name="chevron-right" size={18} className="chev" /></div>
        <p className="rp-card-desc">{c.desc}</p>
        <div className="rp-card-val">{c.value != null ? <><strong className="num">{c.value}</strong><span>{c.sub}</span></> : <span>{c.emptyText || 'No data in the last 7 days'}</span>}</div>
        {c.custom === 'health'
          ? <div className="rp-card-vitals">{c.vitals.map(v => <Badge key={v.key} tone={v.tone}>{v.short}</Badge>)}</div>
          : c.custom === 'habits'
            ? <div className="rp-card-vitals">{c.chips.map(f => <DeltaChip key={f.tag} delta={f.cmp.diff} metricKey={f.outcome.metric} text={f.label} />)}</div>
            : <Sparkline data={c.series} hue={c.hue} height={36} label={`${c.title}, last 7 days`} />}
      </a>)}
    </div>
  </div>
}
