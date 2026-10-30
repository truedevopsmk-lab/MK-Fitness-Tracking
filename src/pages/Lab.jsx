import { useEffect, useMemo, useRef, useState } from 'react'
import { actions, useExcluded, useStore } from '../state/store'
import { addDays, today, toDay } from '../lib/dates'
import { fmtClock, fmtDay, fmtNumber, fmtPct } from '../lib/format'
import { setPrefs, usePrefs } from '../lib/prefs'
import { fmtKm, fmtPace, typeGroup, typeName } from '../lib/activities'
import { BEST, INTENSITY, MIN_EACH, MIN_RUNS, SHAPES, VERDICTS, bestEfforts, fatigueCheck, goalProgress, recoveryAfterRuns, runsOf, whyFaster, zonePace } from '../lib/fitAnalysis'
import { href } from '../router'
import { Badge, Button, Card, Empty, Icon, PageHeader, SectionTitle, Segmented, toast } from '../components'
import { HowToRead, MiniTrend, ReportNote } from './reports/ReportLayout'
import { TypeBadge } from './Activities'
import '../styles/activities.css'
import '../styles/reports.css'
import '../styles/lab.css'

const num = v => typeof v === 'number' && Number.isFinite(v)
const clock = s => { if (!num(s)) return '—'; const t = Math.round(s), h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), x = t % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}` }
const runs = n => `${n} ${n === 1 ? 'run' : 'runs'}`
const paceDelta = d => Math.abs(d) < 1 ? 'same pace' : `${Math.round(Math.abs(d))} s/km ${d < 0 ? 'faster' : 'slower'}`
const bpmDelta = d => Math.abs(d) < 0.5 ? 'same' : `${fmtNumber(Math.abs(d), 0)} bpm ${d < 0 ? 'lower' : 'higher'}`
const GOALS = [{ value: 5000, label: '5K' }, { value: 10000, label: '10K' }, { value: 21097.5, label: 'Half' }]

function ImportCard({ count, demo }) {
  const input = useRef(null)
  const [busy, setBusy] = useState(null)
  const [report, setReport] = useState(null)
  const pick = async e => {
    const files = [...(e.target.files || [])]
    e.target.value = ''
    if (!files.length) return
    setReport(null); setBusy({ fit: 0, added: 0 })
    try {
      const { importFit } = await import('../data/fitImport')
      const r = await importFit(files, { known: await actions.fitKnown(), onBatch: actions.addFitBatch, onProgress: p => setBusy({ fit: p.fit, added: p.added }) })
      setReport(r)
      toast(r.added ? `Imported ${r.added} ${r.added === 1 ? 'workout' : 'workouts'}` : r.fit ? 'Nothing new to import' : 'No FIT files found', { tone: r.added ? 'good' : 'neutral' })
    } catch (err) {
      setReport({ files: files.length, fit: 0, added: 0, duplicates: 0, skipped: 0, damaged: 0, errors: [{ path: files[0].name, error: 'Could not read the files' }] })
    } finally { setBusy(null) }
  }
  return <Card title="Import FIT files" subtitle="Garmin’s original recordings, with every sample your watch took">
    <input ref={input} type="file" multiple accept=".zip,.fit,application/zip,application/octet-stream" className="sr-only" onChange={pick} tabIndex={-1} aria-hidden="true" />
    <div className="lab-import">
      <Button variant="primary" icon="upload" disabled={!!busy} onClick={() => input.current?.click()}>{busy ? `Reading… ${busy.fit} ${busy.fit === 1 ? 'file' : 'files'}` : 'Choose zip or FIT files'}</Button>
      <span className="lab-import-n">{count ? `${count} ${count === 1 ? 'workout' : 'workouts'} imported` : 'Nothing imported yet'}</span>
    </div>
    {report && <div className="lab-report" role="status">
      <strong>{report.added ? `Added ${report.added} ${report.added === 1 ? 'workout' : 'workouts'}` : 'Nothing new added'}</strong>
      <span>{[`${report.fit} FIT ${report.fit === 1 ? 'file' : 'files'} found`, report.duplicates && `${report.duplicates} already imported`, report.skipped && `${report.skipped} not workouts (daily monitoring, settings)`, report.damaged && `${report.damaged} damaged but read`].filter(Boolean).join(' · ')}</span>
      {report.errors.length > 0 && <ul>{report.errors.slice(0, 5).map((e, i) => <li key={i}>{e.path.split('/').pop()}: {e.error}</li>)}{report.errors.length > 5 && <li>and {report.errors.length - 5} more</li>}</ul>}
    </div>}
    <details className="lab-how">
      <summary>Where to get the files</summary>
      <ol>
        <li><strong>One workout:</strong> open it on connect.garmin.com, then ⚙ → <em>Export Original</em>. You get a .zip with a .fit inside; pick the .zip here.</li>
        <li><strong>All your history:</strong> Garmin account → Data Management → <em>Export Your Data</em>. Garmin e-mails a link to a large .zip; pick it here. The app reads only the workout files inside and skips the rest.</li>
        <li><strong>From the watch:</strong> connect it by USB and copy the files in <em>GARMIN/Activity</em>.</li>
      </ol>
      <p>Files are read on this device and never uploaded. The originals are kept here too, so they can be re-read when the app improves. {demo ? 'You’re viewing demo data, so the workouts here are generated.' : ''}</p>
    </details>
  </Card>
}

function WhyCard({ why, fatigue }) {
  if (!why.ready) return <Card title="Fitness or effort?" subtitle="Did your recent runs get faster because you got fitter, or because you pushed harder?"><ReportNote>Needs {why.need} runs of 10+ minutes with heart rate ({why.n} so far).</ReportNote></Card>
  const v = VERDICTS[why.verdict], { prev, recent } = why
  return <Card className="rb-card" title="Fitness or effort?" subtitle={`Your last ${runs(why.k)} against the ${why.k} before`}>
    <div className="rb-head"><div className="rb-head-text"><span className="rb-kind">{fmtDay(recent.from, { day: 'numeric', month: 'short' })} – {fmtDay(recent.to, { day: 'numeric', month: 'short' })} vs {fmtDay(prev.from, { day: 'numeric', month: 'short' })} – {fmtDay(prev.to, { day: 'numeric', month: 'short' })}</span>
      <p className="rb-lead">{v.title}</p></div></div>
    <p className="rs-text">{v.text}</p>
    <div className="lab-compare">
      {[['Running pace', `${fmtPace(1000 / recent.speed)} /km`, `${fmtPace(1000 / prev.speed)} /km`, paceDelta(1000 / recent.speed - 1000 / prev.speed)],
        ['Heart rate', `${Math.round(recent.hr)} bpm`, `${Math.round(prev.hr)} bpm`, bpmDelta(recent.hr - prev.hr)],
        ['Per heartbeat', `${fmtNumber(recent.eff, 2)} m`, `${fmtNumber(prev.eff, 2)} m`, fmtPct(why.dEff, 1)]].map(([label, a, b, d]) =>
        <div key={label}><span>{label}</span><strong className="num">{a}</strong><small>{d}</small><small>was {b}</small></div>)}
    </div>
    {fatigue.flag && <p className="lab-flag"><Icon name="alert" size={16} />Your pace is up, but over the last 14 nights {num(fatigue.hrvPct) && fatigue.hrvPct <= -5 ? `HRV averaged ${fmtPct(fatigue.hrvPct)} against the 4 weeks before` : `resting heart rate averaged ${fmtNumber(fatigue.rhrDiff, 1)} bpm higher than the 4 weeks before`}. Fatigue can build while pace improves, so an easier few days may help.</p>}
    <p className="rb-foot">Running time only, after the first 5 minutes of each run. Heat, hills and terrain change both numbers, so compare similar runs when you can.</p>
  </Card>
}

function EffCard({ list }) {
  const data = list.filter(r => num(r.derived?.eff)).map(r => ({ date: r.day, value: Math.round(r.derived.eff * 1000) / 1000 }))
  if (data.length < 3) return null
  return <Card title="Distance per heartbeat" subtitle="Metres you cover per heartbeat while running. Higher means more efficient.">
    <MiniTrend data={data} label="Metres per beat" hue="steps" height={150} format={v => `${fmtNumber(v, 2)} m`} axisFormat={v => fmtNumber(v, 2)} ariaLabel={`Distance per heartbeat over ${data.length} runs`} />
    <p className="lab-foot">Calculated by this app from running stretches after the first 5 minutes (heart rate lags pace at the start). Easy and hard runs both count, so look at the trend rather than one run.</p>
  </Card>
}

function ZonePaceCard({ list, asOf }) {
  const rows = useMemo(() => zonePace(list, asOf), [list, asOf])
  if (!rows.some(r => r.recent.n || r.before.n)) return null
  return <Card title="Pace at the same heart rate" subtitle="Running pace (per km) in each of your watch’s heart-rate zones">
    <table className="lab-best lab-zp"><thead><tr><th>Zone</th><th className="r">Last 60 days</th><th className="r">Before</th><th className="r">Change</th></tr></thead>
      <tbody>{rows.filter(r => r.recent.n || r.before.n).map(r => <tr key={r.zone}><td>Zone {r.zone}</td>
        <td className="r num">{num(r.recent.pace) ? fmtPace(r.recent.pace) : '—'}<small>{runs(r.recent.n)}</small></td>
        <td className="r num">{num(r.before.pace) ? fmtPace(r.before.pace) : '—'}<small>{runs(r.before.n)}</small></td>
        <td className="r">{r.ready ? <Badge tone={r.diffSec <= -3 ? 'good' : r.diffSec >= 3 ? 'warning' : 'neutral'}>{paceDelta(r.diffSec).replace(' s/km', ' s')}</Badge> : <small>Needs {MIN_RUNS} each</small>}</td></tr>)}</tbody></table>
    <p className="lab-foot">Each zone needs 3+ minutes of running in it to count a run. Faster pace in the same zone is a sign of better aerobic fitness.</p>
  </Card>
}

function GoalCard({ list, asOf }) {
  const prefs = usePrefs(), goal = { m: prefs.runGoalM, sec: prefs.runGoalSec }
  const g = useMemo(() => goalProgress(list, goal, asOf), [list, goal.m, goal.sec, asOf])
  const best = useMemo(() => bestEfforts(list, addDays(asOf, -89)), [list, asOf])
  const label = GOALS.find(x => x.value === goal.m)?.label ?? `${fmtKm(goal.m)} km`
  const [mins, setMins] = useState(String(Math.round(goal.sec / 60)))
  useEffect(() => setMins(String(Math.round(goal.sec / 60))), [goal.sec])
  const save = () => { const v = Number(mins); if (v >= 10 && v <= 400) setPrefs({ runGoalSec: Math.round(v * 60) }); else setMins(String(Math.round(goal.sec / 60))) }
  const ref = g.atGoal ?? g.estimate
  return <Card title="Your goal" subtitle={`${label} in ${clock(goal.sec)} needs ${fmtPace(g.pace)} /km`}>
    <div className="lab-goal-set">
      <Segmented value={goal.m} options={GOALS} onChange={m => setPrefs({ runGoalM: m })} label="Goal distance" stretch={false} />
      <label className="lab-goal-min"><span className="sr-only">Goal time in minutes</span><input className="input num" inputMode="numeric" value={mins} onChange={e => setMins(e.target.value.replace(/\D/g, ''))} onBlur={save} onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()} /><span>min</span></label>
    </div>
    {ref ? <div className="lab-goal">
      <strong className="num">{clock(ref.sec)}</strong>
      <span>{g.atGoal ? `Your fastest ${label} in the last 90 days` : `Estimate from your ${fmtKm(g.estimate.fromM)} km best (${clock(g.estimate.fromSec)}) in the last 90 days`}</span>
      <Badge tone={g.gapSec <= 0 ? 'good' : 'neutral'}>{g.gapSec <= 0 ? `${clock(-g.gapSec)} under goal` : `${clock(g.gapSec)} to go · ${fmtNumber(g.gapSec / (goal.m / 1000), 0)} s/km`}</Badge>
    </div> : <ReportNote>Needs a run of at least 5 km in the last 90 days{g.longest ? ` (longest so far ${fmtKm(g.longest)} km)` : ''}.</ReportNote>}
    <table className="lab-best"><thead><tr><th>Best effort</th><th className="r">Last 90 days</th><th className="r">All imported</th></tr></thead>
      <tbody>{BEST.map(b => <tr key={b.m}><td>{b.label}</td>
        <td className="r num">{best[b.m].recent ? <a href={href(`/lab/${encodeURIComponent(best[b.m].recent.id)}`)}>{clock(best[b.m].recent.sec)}</a> : '—'}</td>
        <td className="r num">{best[b.m].all ? <a href={href(`/lab/${encodeURIComponent(best[b.m].all.id)}`)}>{clock(best[b.m].all.sec)}</a> : '—'}</td></tr>)}</tbody></table>
    <p className="lab-foot">Best efforts are the fastest stretch of that distance inside any run, from the GPS distance. The estimate uses the Riegel formula (time × distance ratio^1.06), computed on your device; it isn’t Garmin’s race prediction.</p>
  </Card>
}

function RecoveryCard({ list, days, exclude }) {
  const r = useMemo(() => recoveryAfterRuns(list, days, { exclude }), [list, days, exclude])
  const row = (label, x) => <div><span>{label}</span><strong className="num">{num(x.hrvPct) ? fmtPct(x.hrvPct, 1) : '—'}</strong><small>HRV next morning · {runs(x.nHrv)}</small>
    <strong className="num">{num(x.rhrDiff) ? `${x.rhrDiff > 0 ? '+' : ''}${fmtNumber(x.rhrDiff, 1)} bpm` : '—'}</strong><small>resting HR</small></div>
  return <Card title="Recovery after hard runs" subtitle="The next morning after hard runs (aerobic effect 3.5+ or mostly hard zones) against easier ones">
    {r.ready ? <>
      <div className="lab-compare lab-compare-2">{row('Hard runs', r.hard)}{row('Easier runs', r.easy)}</div>
      {r.back.n >= MIN_EACH && <p className="rs-text">After a hard run, your HRV was back within 3% of its 7-night average after <strong>{fmtNumber(r.back.median)} {r.back.median === 1 ? 'night' : 'nights'}</strong> (median of {runs(r.back.n)}: {Object.entries(r.back.dist).filter(([, v]) => v).map(([k, v]) => `${k} ${k === '1' ? 'night' : 'nights'} ×${v}`).join(', ')}).</p>}
    </> : <ReportNote>Needs {MIN_EACH} hard and {MIN_EACH} easier runs with HRV synced for the next morning ({r.hard.nHrv} hard, {r.easy.nHrv} easier so far).</ReportNote>}
    <p className="rb-foot">HRV and resting heart rate come from your synced Garmin data, compared with the 7 nights up to each run. Days with a journal status are left out. These are trends in your own data, not medical advice.</p>
  </Card>
}

function MixCard({ list }) {
  const recent = list.slice(-20).filter(r => r.derived?.mix)
  if (recent.length < 3) return null
  const n = k => recent.filter(r => r.derived.mix.kind === k).length
  const shapes = Object.entries(recent.reduce((a, r) => (r.derived.shape && (a[r.derived.shape] = (a[r.derived.shape] || 0) + 1), a), {})).sort((a, b) => b[1] - a[1])
  return <Card title="How you run" subtitle={`Your last ${runs(recent.length)}, by time in your watch’s zones`}>
    <div className="lab-mix">{['easy', 'moderate', 'hard'].map(k => <div key={k} className={`lab-mix-${k}`}><strong className="num">{n(k)}</strong><span>{INTENSITY[k]}</span></div>)}</div>
    {shapes.length > 0 && <p className="rs-text">{shapes.map(([k, v]) => `${SHAPES[k].label} ×${v}`).join(' · ')}</p>}
    <p className="lab-foot">Mostly easy = 70%+ of the time in zone 2 or below; mostly hard = 40%+ in zones 4–5. A common guide for endurance training is about 80% of time easy. It’s a guide, not a rule.</p>
  </Card>
}

function Row({ w }) {
  const g = typeGroup(w.type), pace = w.avgSpeed > 0 ? 1000 / w.avgSpeed : null, d = w.derived
  return <li><a className="act-row" href={href(`/lab/${encodeURIComponent(w.id)}`)}>
    <TypeBadge type={w.type} />
    <div className="act-main">
      <div className="act-name">{typeName(w.type)}{d?.shape && <span className="lab-row-tag">{SHAPES[d.shape].label}</span>}</div>
      <div className="act-when">{fmtDay(w.day, { weekday: 'short', day: 'numeric', month: 'short', year: w.day.slice(0, 4) !== today().slice(0, 4) ? 'numeric' : undefined })}, {fmtClock(w.startTs)}</div>
      <div className="act-meta">
        {num(w.timerSec) && <span>{clock(w.timerSec)}</span>}
        {(g === 'run' || g === 'walk') && pace && <span>{fmtPace(pace)} <small>/km</small></span>}
        {w.avgHr && <span><Icon name="heart" size={13} />{w.avgHr} <small>bpm</small></span>}
        {num(d?.eff) && <span>{fmtNumber(d.eff, 2)} <small>m/beat</small></span>}
      </div>
    </div>
    <div className="act-dist num">{w.distanceM > 0 ? <>{fmtKm(w.distanceM)}<small>km</small></> : null}</div>
    <Icon name="chevron-right" size={16} className="act-chev" />
  </a></li>
}

export default function Lab() {
  const workouts = useStore(s => s.fitWorkouts), days = useStore(s => s.days), source = useStore(s => s.source), exclude = useExcluded()
  const [shown, setShown] = useState(20)
  const [seeding, setSeeding] = useState(source === 'demo' && !workouts.length)
  useEffect(() => { if (source === 'demo') actions.ensureDemoFit().catch(e => console.warn('demo fit', e)).finally(() => setSeeding(false)) }, [source])
  const list = useMemo(() => runsOf(workouts), [workouts])
  const asOf = today()
  const why = useMemo(() => whyFaster(list), [list])
  const fatigue = useMemo(() => fatigueCheck(days, why, asOf, { exclude }), [days, why, asOf, exclude])

  return <div className="page page-fade lab">
    <PageHeader title="Workout lab" subtitle="Every sample from your watch’s original files" />
    <ImportCard count={workouts.length} demo={source === 'demo'} />
    {seeding && <p className="muted" aria-busy="true">Preparing demo workouts…</p>}
    {!seeding && !workouts.length && <Empty icon="activity" title="No workouts imported yet" body="Import a workout’s original FIT file to see its splits, pace and heart rate second by second, and how you recovered the night after." />}
    {list.length > 0 && <>
      <SectionTitle>Across your runs</SectionTitle>
      <WhyCard why={why} fatigue={fatigue} />
      <EffCard list={list} />
      <ZonePaceCard list={list} asOf={asOf} />
      <GoalCard list={list} asOf={asOf} />
      <RecoveryCard list={list} days={days} exclude={exclude} />
      <MixCard list={list} />
    </>}
    {workouts.length > 0 && <>
      <SectionTitle>Imported workouts</SectionTitle>
      <ul className="act-list">{workouts.slice(0, shown).map(w => <Row key={w.id} w={w} />)}</ul>
      {workouts.length > shown && <div className="act-more"><Button variant="secondary" onClick={() => setShown(n => n + 30)}>Show more</Button></div>}
      <HowToRead><strong>Where it comes from.</strong> Each workout is read from the original FIT file your watch recorded: every heart-rate, pace, cadence and GPS sample, the laps, pauses and your watch’s zones. Daily data (sleep, HRV, resting heart rate) still comes from sync.<br /><br /><strong>Garmin’s or the app’s.</strong> Training effect, load, zones and recovery heart rate are your watch’s. Distance per heartbeat, splits, best efforts, run shape and the goal estimate are calculated by this app.<br /><br /><strong>Missing data stays missing.</strong> If a file has no cadence or GPS, the app says so rather than showing zeros.</HowToRead>
    </>}
  </div>
}
