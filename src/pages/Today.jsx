import { useEffect, useMemo, useRef } from 'react'
import '../styles/home.css'
import { getState, useExcluded, useStore } from '../state/store'
import { today, daysBetween } from '../lib/dates'
import { fmtDay, fmtDuration, fmtNumber } from '../lib/format'
import { METRICS, hrvStatusBand, isMeaningfulDelta } from '../lib/metrics'
import { computeInsights } from '../lib/insights'
import { latestValue, lastNDays } from '../data/select'
import { useDisplayName, withName } from '../lib/name'
import { usePrefs } from '../lib/prefs'
import { MIN_DAYS, effortFor, effortStatus, effortTarget, statusText } from '../lib/effort'
import { healthMonitor, monitorSummary } from '../lib/health'
import { bankText, clockFromNorm, sleepCoach } from './sleepLogic'
import { bodyBatteryNow, deltaVs7, greetingFor, headlineFor, intensityWeek, latestActivity, recoveryFor, weekGrid, whenLabel } from '../lib/homeLogic'
import { checkinDay, entryText, journalStats } from '../lib/journal'
import { Badge, Button, Card, Empty, Icon, InstallHint, Meter, PageHeader, Ring, SectionTitle, StatTile, toast } from '../components'

const trend = key => `#/trends/${key}`
const lastDay = (days, asOf) => Object.keys(days).filter(d => d <= asOf).sort().at(-1)

/** Toast when a sync (started by the shell's pull-to-refresh or auto-sync) finishes while this page is open. */
function useSyncToast() {
  const running = useStore(s => s.sync.running)
  const was = useRef(running)
  useEffect(() => {
    if (was.current && !running) {
      const { syncMeta, endpoints } = getState()
      const n = Object.values(endpoints).reduce((a, e) => a + (e.records || 0), 0)
      if (syncMeta.lastResult === 'ok') toast(n ? `Synced · ${n} ${n === 1 ? 'record' : 'records'} updated` : 'Synced · already up to date', { tone: 'good' })
      else if (syncMeta.lastResult === 'partial') toast('Synced with gaps · some data could not be fetched. See Sync Center.', { tone: 'warning', ms: 6000 })
      else if (syncMeta.lastResult === 'failed') toast('Sync failed. Open Sync Center for details.', { tone: 'critical', ms: 6000 })
    }
    was.current = running
  }, [running])
}

function Tile({ metricKey, asOf, overnight, sub, label, href, mapValue, band, deltaKey = metricKey, days, spark }) {
  const exclude = useExcluded()
  const last = latestValue(days, metricKey, { asOf })
  if (!last) return <StatTile metricKey={metricKey} value={null} label={label} href={href || trend(metricKey)} sub="No data yet" />
  const value = mapValue ? mapValue(last) : last.value
  const dv = deltaVs7(days, deltaKey, asOf, { exclude })
  const when = last.ageDays > (0) ? whenLabel(last.date, asOf, overnight) : overnight ? 'Last night' : null
  const text = [typeof sub === 'function' ? sub(last) : sub, when].filter(Boolean).join(' · ')
  return <StatTile metricKey={metricKey} label={label} value={value} band={band ? band(last, value) : undefined} href={href || trend(metricKey)}
    delta={dv ? dv.delta : undefined} sub={text} spark={spark ?? lastNDays(days, metricKey, 14, asOf)} />
}

function GoalTile({ className = '', metricKey, value, goal, sub, pct, href, when, hue }) {
  const m = METRICS[metricKey]
  return <a className={`tile tile-link ${className}`} href={href} style={{ '--tile-hue': `var(--hue-${m.hue})` }}>
    <div className="tile-top"><span className="tile-label"><i className="tile-dot" aria-hidden="true" />{m.short}</span><Icon name="chevron-right" size={16} className="tile-chev" /></div>
    <div className="tile-value num">{value == null ? '—' : fmtNumber(value)}{m.unit && <small>{m.unit}</small>}</div>
    <div className="tile-meta"><span className="tile-sub">{[sub, when].filter(Boolean).join(' · ')}</span></div>
    <div className="tile-meter"><Meter value={value ?? 0} max={goal || 1} hue={hue || m.hue} valueLabel={null} /></div>
    {pct != null && <span className="sr-only">{pct}% of goal</span>}
  </a>
}

function WeekStrip({ days, activities, asOf }) {
  const grid = useMemo(() => weekGrid(days, activities, asOf), [days, activities, asOf])
  return <Card title="This week" subtitle="Sleep score, steps against your goal, and workouts">
    <div className="week">{grid.map(d => {
      const frac = d.steps != null ? Math.min(1, d.steps / (d.goal || 10000)) : 0
      return <div key={d.date} className={`week-day${d.isToday ? ' is-today' : ''}${d.future ? ' is-future' : ''}`} aria-label={`${fmtDay(d.date)}: sleep ${d.sleep ?? 'none'}, steps ${d.steps ?? 'none'}, ${d.acts} workouts`}>
        <span className="week-letter">{d.letter}</span>
        <span className={`week-sleep num${d.sleep == null ? ' is-empty' : ''}`}>{d.sleep == null ? '–' : Math.round(d.sleep)}</span>
        <span className="week-bar"><i style={{ height: `${frac * 100}%` }} /></span>
        <span className="week-steps">{d.steps == null ? '' : d.steps >= 1000 ? `${(d.steps / 1000).toFixed(1)}k` : d.steps}</span>
        <span className="week-dots">{Array.from({ length: Math.min(3, d.acts) }, (_, i) => <i key={i} />)}</span>
      </div>
    })}</div>
    <div className="week-key"><span><i style={{ background: 'var(--hue-sleep)' }} />Sleep score</span><span><i style={{ background: 'var(--hue-steps)' }} />Steps</span><span><i style={{ background: 'var(--hue-intensity)' }} />Workout</span></div>
  </Card>
}

function EffortRow({ eff, target, recScore }) {
  const { score, reason, n } = eff, scored = score != null
  if (reason === 'history' && n === 0) return null
  const status = effortStatus(score, target), range = target ? `${target.lo}–${target.hi}` : null
  const name = scored ? (range ? `${score} · target ${range}` : `${score}`) : reason === 'no-data' ? 'Nothing synced for today yet' : `Effort builds after ${MIN_DAYS} days`
  const sub = scored ? (target ? statusText(status, true) : 'Target needs a recovery score')
    : reason === 'no-data' ? (target ? `Today’s target ${range} from recovery ${recScore}` : 'Sync to see today’s effort') : `${n} of ${MIN_DAYS} days so far`
  return <a className="home-act home-effort" href="#/reports/effort">
    <span className="home-act-ico"><Icon name="gauge" size={22} /></span>
    <span className="home-act-text"><span className="home-act-label">Effort today</span>
      <span className="home-act-name">{name}</span>
      <span className="home-act-sub">{sub}</span>
      {scored && <span className="eff-bar" aria-hidden="true">{target && <i className="eff-zone" style={{ left: `${target.lo}%`, width: `${target.hi - target.lo}%` }} />}<i className="eff-fill" style={{ width: `${score}%` }} /></span>}</span>
    <Icon name="chevron-right" size={18} />
  </a>
}

function JournalRow({ journal, asOf }) {
  const day = checkinDay(), entry = journal[day], when = day === asOf ? 'today' : 'yesterday'
  const st = useMemo(() => journalStats(journal, asOf, 7), [journal, asOf])
  return <a className="home-act home-journal" href="#/journal">
    <span className="home-act-ico"><Icon name="tag" size={22} /></span>
    <span className="home-act-text"><span className="home-act-label">Journal</span>
      <span className="home-act-name">{!entry ? `Check in for ${when}` : entryText(entry) || `Nothing tagged ${when}`}</span>
      <span className="home-act-sub">{!entry ? 'Alcohol, late meals, travel and more · stays on this device' : `Logged ${st.logged} of the last 7 days`}</span></span>
    <Icon name="chevron-right" size={18} />
  </a>
}

function TonightRow({ coach }) {
  const p = coach.plan, bed = clockFromNorm(p.bedNorm), wake = clockFromNorm(p.wakeNorm)
  return <a className="home-act home-tonight" href="#/sleep">
    <span className="home-act-ico"><Icon name="moon" size={22} /></span>
    <span className="home-act-text"><span className="home-act-label">Tonight</span>
      <span className="home-act-name">{p.late ? `Past your ${bed} bedtime` : `Bedtime ${bed}`}</span>
      <span className="home-act-sub">{p.late ? `Going to sleep now leaves about ${fmtDuration(p.leftSec)} before ${wake}` : [`${fmtDuration(p.asleepSec)} asleep before a ${wake} wake`, bankText(coach.bank)].filter(Boolean).join(' · ')}</span></span>
    <Icon name="chevron-right" size={18} />
  </a>
}

export default function Today() {
  const days = useStore(s => s.days)
  const activities = useStore(s => s.activities)
  const profile = useStore(s => s.profile)
  const journal = useStore(s => s.journal)
  const source = useStore(s => s.source)
  const exclude = useExcluded()
  const asOf = today(), { sleepNeedHours, wakeTime } = usePrefs()
  useSyncToast()
  const has = Object.keys(days).length > 0 || activities.length > 0
  const rec = useMemo(() => recoveryFor(days, asOf, { sleepNeedHours, exclude }), [days, asOf, sleepNeedHours, exclude])
  const eff = useMemo(() => effortFor(days, activities, asOf, undefined, { exclude }), [days, activities, asOf, exclude])
  const target = effortTarget(rec.score)
  const insights = useMemo(() => { try { return computeInsights(days, activities, { asOf, exclude }).slice(0, 2) } catch { return [] } }, [days, activities, asOf, exclude])
  const vitals = useMemo(() => { const m = healthMonitor(days, asOf, { exclude }); return { m, s: monitorSummary(m) } }, [days, asOf, exclude])
  const coach = useMemo(() => sleepCoach(days, { prefHours: sleepNeedHours, wakeClock: wakeTime }), [days, asOf, sleepNeedHours, wakeTime])
  const wk = useMemo(() => intensityWeek(days, asOf), [days, asOf])
  const act = useMemo(() => latestActivity(activities), [activities])
  const name = useDisplayName()
  const newest = lastDay(days, asOf)
  const behind = newest ? daysBetween(newest, asOf) : null

  const head = <PageHeader title={withName(greetingFor(), name)} subtitle={new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })} />
  if (!has) return <div className="page home"><div className="home-greet">{head}</div><InstallHint />
    <Card><Empty icon="sync" title="Welcome. Let’s bring in your data" body={source === 'demo' ? 'This demo has no data loaded.' : 'Sync with Garmin to fill in your sleep, Body Battery, HRV and activity. The first sync can take a few minutes.'} action={<Button variant="primary" href="#/sync" icon="sync">Open Sync Center</Button>} /></Card></div>

  const sleepLast = latestValue(days, 'sleepScore', { asOf })
  const bbLast = latestValue(days, 'bodyBatteryHigh', { asOf })
  const steps = latestValue(days, 'steps', { asOf })
  const stepGoal = steps ? (steps.record.steps?.goal || profile?.stepGoal || 10000) : (profile?.stepGoal || 10000)
  const hrvLast = latestValue(days, 'hrv', { asOf })
  const hrvStatus = hrvStatusBand(hrvLast?.record.hrv?.status)
  const hrvWeekly = hrvLast ? (hrvLast.record.hrv?.weeklyAvg ?? deltaVs7(days, 'hrv', asOf, { exclude })?.avg) : null
  const hrvWhen = hrvLast && hrvLast.ageDays > 0 ? whenLabel(hrvLast.date, asOf, true) : 'Last night'
  const recWhen = rec.date && rec.date !== asOf ? whenLabel(rec.date, asOf, true) : null
  const bbRec = bbLast?.record.bodyBattery

  return <div className="page home">
    <div className="home-greet">{head}</div>
    <InstallHint />
    {behind > 1 && <p className="missing"><Icon name="alert" size={14} />Latest data is from {fmtDay(newest)}. Pull down to sync.</p>}

    <Card className="home-hero">
      <div className="home-hero-main">
        <Ring value={rec.score} hue="readiness" size={132} thickness={12} label={rec.score == null ? 'No data' : rec.kind === 'garmin' ? 'readiness' : 'recovery'} />
        <div className="home-hero-text">
          <span className="home-hero-kind">{rec.kind === 'garmin' ? 'Training readiness' : 'Recovery estimate'}{recWhen ? ` · ${recWhen}` : ''}</span>
          <h2 className="home-headline">{headlineFor(rec.score)}</h2>
          {rec.parts.length > 0 && <div className="home-chips">{rec.parts.map(p => <Badge key={p.key} tone={p.tone}>{p.text}</Badge>)}</div>}
        </div>
      </div>
      <div className="home-hero-foot">
        {rec.kind === 'estimate' && <p className="home-note">Estimate from sleep, HRV and Body Battery. It is not a Garmin number.</p>}
        {rec.score == null && <p className="home-note">Needs at least two of sleep score, HRV and Body Battery from the last few days.</p>}
        {rec.score != null && <a className="home-hero-link" href="#/reports/recovery"><span>What moved it</span><Icon name="chevron-right" size={18} /></a>}
      </div>
    </Card>

    <EffortRow eff={eff} target={target} recScore={rec.score} />

    {vitals.s && <a className={`home-act home-vitals is-${vitals.s.tone}`} href="#/reports/health">
      <span className="home-act-ico"><Icon name="shield" size={22} /></span>
      <span className="home-act-text"><span className="home-act-label">Health monitor</span><span className="home-act-name">{vitals.s.title}</span><span className="home-act-sub">{[vitals.s.sub, whenLabel(vitals.m.date, asOf, true)].join(' · ')}</span></span>
      <Icon name="chevron-right" size={18} />
    </a>}

    {coach.has && coach.plan && <TonightRow coach={coach} />}
    <JournalRow journal={journal} asOf={asOf} />

    <div className="home-tiles">
      <Tile days={days} asOf={asOf} metricKey="sleepScore" overnight href="#/sleep" sub={l => fmtDuration(l.record.sleep?.durationSec)} spark={undefined} />
      <StatTile metricKey="bodyBatteryHigh" label={bbLast?.ageDays ? 'Body Battery' : 'Battery now'} href={trend('bodyBatteryHigh')} value={bbLast ? bodyBatteryNow(bbLast.record) : null}
        sub={bbRec ? [bbRec.high != null && `Peak ${bbRec.high}`, bbRec.charged != null && `+${bbRec.charged} charged`, bbRec.drained != null && `−${bbRec.drained} drained`, bbLast.ageDays > 0 && whenLabel(bbLast.date, asOf)].filter(Boolean).join(' · ') : 'No data yet'}
        spark={lastNDays(days, 'bodyBatteryHigh', 14, asOf)} />
      <Tile days={days} asOf={asOf} metricKey="stressAvg" label="Stress" sub={l => l.record.stress?.highSec ? `High stress ${fmtDuration(l.record.stress.highSec)}` : null} />
      <StatTile metricKey="hrv" href={trend('hrv')} value={hrvLast?.value ?? null} band={hrvStatus || false}
        sub={[hrvWeekly != null && `7-day avg ${Math.round(hrvWeekly)} ms`, hrvWhen].filter(Boolean).join(' · ')}
        delta={hrvLast && hrvWeekly != null && isMeaningfulDelta('hrv', hrvLast.value - hrvWeekly) ? hrvLast.value - hrvWeekly : undefined} spark={lastNDays(days, 'hrv', 14, asOf)} />
      <Tile days={days} asOf={asOf} metricKey="restingHr" label="Resting HR" sub="vs 7-day avg" />
      <GoalTile metricKey="steps" href={trend('steps')} value={steps?.value} goal={stepGoal} pct={steps ? Math.round(steps.value / stepGoal * 100) : null}
        sub={steps ? `${Math.round(steps.value / stepGoal * 100)}% of ${fmtNumber(stepGoal)}` : 'No data yet'} when={steps && steps.ageDays > 0 ? whenLabel(steps.date, asOf) : null} />
      <GoalTile className="home-int" metricKey="intensity" href={trend('intensity')} value={wk.any ? wk.total : null} goal={wk.goal} hue="intensity"
        sub={wk.any ? `${fmtNumber(wk.total)} / ${fmtNumber(wk.goal)} min this week` : 'No minutes this week'} />
      {act
        ? <a className="home-act home-wide" href={`#/activities/${encodeURIComponent(act.id)}`}>
          <span className="home-act-ico"><Icon name={act.type.includes('run') || act.type === 'walking' ? 'steps' : act.type === 'cycling' ? 'activity' : 'flame'} size={22} /></span>
          <span className="home-act-text">
            <span className="home-act-label">Latest activity</span>
            <span className="home-act-name">{act.name || act.type}</span>
            <span className="home-act-sub">{[whenLabel(act.day, asOf), act.distanceM ? `${(act.distanceM / 1000).toFixed(1)} km` : null, fmtDuration(act.durationSec), act.trainingLoad != null ? `Load ${Math.round(act.trainingLoad)}` : null].filter(Boolean).join(' · ')}</span>
          </span><Icon name="chevron-right" size={18} />
        </a>
        : <div className="home-act home-wide"><span className="home-act-ico"><Icon name="activity" size={22} /></span><span className="home-act-text"><span className="home-act-name">No activities yet</span><span className="home-act-sub">Workouts show up here after a sync.</span></span></div>}
    </div>

    <WeekStrip days={days} activities={activities} asOf={asOf} />

    {insights.length > 0 && <Card title="Worth a look" href="#/insights">
      <div className="home-insights">{insights.map(i => <div key={i.id} className="home-insight"><strong>{i.title}</strong><span>{i.body}</span></div>)}</div>
    </Card>}
  </div>
}
