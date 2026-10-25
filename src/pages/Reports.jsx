import { useMemo } from 'react'
import { useStore } from '../state/store'
import { lastNDays } from '../data/select'
import { mean, sum } from '../lib/stats'
import { fmtNumber } from '../lib/format'
import { addDays, today } from '../lib/dates'
import Sparkline from '../charts/Sparkline'
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
  { id: 'rec', title: 'Recovery', icon: 'battery', hue: 'readiness', to: '#/reports/recovery', desc: 'Readiness, sleep, HRV and Body Battery together', key: 'readiness', label: 'avg readiness' },
]

function useCards() {
  const days = useStore(s => s.days), acts = useStore(s => s.activities)
  return useMemo(() => REPORTS.map(r => {
    let series = [], value = null, sub = r.label
    if (r.key) {
      series = lastNDays(days, r.key, 7)
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
    return { ...r, series, value, sub }
  }), [days, acts])
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
        <div className="rp-card-val">{c.value != null ? <><strong className="num">{c.value}</strong><span>{c.sub}</span></> : <span>No data in the last 7 days</span>}</div>
        <Sparkline data={c.series} hue={c.hue} height={36} label={`${c.title}, last 7 days`} />
      </a>)}
    </div>
  </div>
}
