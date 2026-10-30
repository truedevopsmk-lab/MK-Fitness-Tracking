import { useEffect, useMemo, useState } from 'react'
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { actions, useExcluded, useStore } from '../state/store'
import { toDay, today } from '../lib/dates'
import { fmtClock, fmtDay, fmtDuration, fmtNumber, fmtPct } from '../lib/format'
import { GROUP, fmtKm, fmtPace, trainingEffect, typeGroup, typeName } from '../lib/activities'
import { INTENSITY, SHAPES, chartRows, coverage, hrDrift, kmSplits, matchActivity, nightAfterRun, routePath, runShape, runWalk, targetAdherence, zoneTimes } from '../lib/fitAnalysis'
import { niceTicks, useChartTheme } from '../charts/chartTheme'
import { TipCard } from '../charts/ChartParts'
import { navigate } from '../router'
import { Badge, Button, Card, ConfirmDialog, DataTable, Empty, Icon, PageHeader, toast } from '../components'
import { HowToRead } from './reports/ReportLayout'
import { TypeBadge } from './Activities'
import '../styles/activities.css'
import '../styles/lab.css'

const num = v => typeof v === 'number' && Number.isFinite(v)
const clock = s => { if (!num(s)) return '—'; const t = Math.round(s), h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), x = t % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}` }
/** Auto laps every 1 km repeat the kilometre splits, so the laps table is left out. */
const autoKmLaps = laps => laps.slice(0, -1).every(l => l.trigger === 'distance' && Math.abs(l.distanceM - 1000) < 5)
const ZONE_NAMES = ['Below zone 1', 'Zone 1', 'Zone 2', 'Zone 3', 'Zone 4', 'Zone 5', 'Above zone 5']
const CALC = { percentMaxHr: '% of max heart rate', percentHrr: '% of heart-rate reserve', percentLthr: '% of lactate threshold heart rate', custom: 'custom limits' }

function Stat({ label, value, unit, sub }) {
  const has = value != null && value !== '' && value !== '—'
  return <div className="ad-stat"><span className="ad-stat-label">{label}</span>
    <span className="ad-stat-value num">{has ? value : '—'}{has && unit && <small>{unit}</small>}</span>{sub && <span className="ad-stat-sub">{sub}</span>}</div>
}

/** Route drawn from the file's GPS points; no map tiles, so nothing is sent anywhere. */
function Route({ route, at }) {
  const p = at != null ? route.pts[at] : null
  return <svg className="lab-route" viewBox={`0 0 ${route.w} ${route.h}`} role="img" aria-label="Route shape from GPS, without a map">
    <path d={route.d} className="lab-route-line" />
    <circle cx={route.start[0]} cy={route.start[1]} r="5" className="lab-route-start" />
    <circle cx={route.end[0]} cy={route.end[1]} r="5" className="lab-route-end" />
    {p && <circle cx={p[0]} cy={p[1]} r="7" className="lab-route-at" />}
  </svg>
}

/** One synced panel: the same x (timer time) for every channel, hover moves the marker on all of them and on the route. */
function Panel({ rows, k, label, unit, hue, fmt, invert, at, onAt, refLine, step = 1 }) {
  const t = useChartTheme(), color = t.hue(hue)
  const vals = rows.map(r => r[k]).filter(num)
  if (vals.length < 2) return null
  // 2nd–98th percentile, so a few walking or GPS-glitch samples don't flatten the rest (they're clipped at the edge)
  const sorted = [...vals].sort((x, y) => x - y), q = f => sorted[Math.min(sorted.length - 1, Math.floor(f * (sorted.length - 1)))]
  const lo = q(0.02), hi = q(0.98), pad = (hi - lo) * 0.1 || 1
  const { ticks, domain } = niceTicks(lo - pad, hi + pad, 3, step)
  const tick = { fill: t.text3, fontSize: 11, fontFamily: t.fontUi }
  const atRow = at != null ? rows[at] : null
  const Tip = ({ active, payload }) => {
    const r = active && payload?.[0]?.payload
    return r ? <TipCard title={`${clock(r.t)}${num(r.km) ? ` · ${fmtNumber(r.km, 2)} km` : ''}`} rows={[{ color, value: num(r[k]) ? `${fmt(r[k])} ${unit}` : 'No data', label }]} /> : null
  }
  const move = s => { const i = s?.activeTooltipIndex; onAt(i == null ? null : Number(i)) }
  return <div className="lab-panel">
    <div className="lab-panel-head"><span><i style={{ background: color }} />{label}</span>{atRow && num(atRow[k]) && <strong className="num">{fmt(atRow[k])} <small>{unit}</small></strong>}</div>
    <div className="chart" role="img" aria-label={`${label} through the workout, ${fmt(lo)} to ${fmt(hi)} ${unit}`}>
      <ResponsiveContainer width="100%" height={110} minWidth={0}>
        <LineChart data={rows} margin={{ top: 6, right: 8, bottom: 0, left: 0 }} onMouseMove={move} onTouchMove={move} onMouseLeave={() => onAt(null)}>
          <CartesianGrid vertical={false} stroke={t.grid} />
          <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={clock} tick={tick} axisLine={false} tickLine={false} minTickGap={48} tickMargin={6} />
          <YAxis ticks={ticks} domain={domain} allowDataOverflow reversed={invert} tickFormatter={fmt} tick={tick} axisLine={false} tickLine={false} width={44} />
          {refLine && <ReferenceLine y={refLine.value} stroke={t.text3} strokeDasharray="4 4" strokeWidth={1} />}
          <Tooltip content={<Tip />} cursor={{ stroke: t.text3, strokeWidth: 1 }} isAnimationActive={false} wrapperStyle={{ outline: 'none', zIndex: 5 }} />
          <Line dataKey={k} type="linear" stroke={color} strokeWidth={2} dot={false} activeDot={{ r: 4, fill: color, stroke: t.surface, strokeWidth: 2 }} connectNulls={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  </div>
}

function Zones({ w, series }) {
  const z = w.zones
  const secs = z?.secs ?? (z?.bounds ? zoneTimes(series, z.bounds) : null)
  if (!secs || !(secs.reduce((a, b) => a + b, 0) > 0)) return null
  const total = secs.reduce((a, b) => a + b, 0), b = z.bounds
  const range = i => !b ? '' : i === 0 ? `under ${b[0]} bpm` : i >= b.length ? `over ${b.at(-1)} bpm` : `${b[i - 1]}–${b[i]} bpm`
  const rows = secs.map((s, i) => ({ i, s })).filter(r => r.s > 0 || (r.i >= 1 && r.i <= 5))
  return <Card title="Heart-rate zones" subtitle={z.secs ? 'Time in each zone, as your watch counted it' : 'Calculated from the heart-rate samples, with your watch’s zone limits'}>
    <div className="ad-zbar" role="img" aria-label={rows.map(r => `${ZONE_NAMES[r.i]} ${clock(r.s)}`).join(', ')}>
      {rows.map(r => r.s > 0 && <i key={r.i} style={{ flexGrow: r.s, background: `var(--zone-${Math.min(5, Math.max(1, r.i))})` }} />)}
    </div>
    <ul className="ad-zlist">
      {rows.map(r => <li key={r.i}><i style={{ background: `var(--zone-${Math.min(5, Math.max(1, r.i))})` }} /><span className="ad-zname">{ZONE_NAMES[r.i]}<small>{range(r.i)}</small></span>
        <span className="ad-ztime num">{r.s ? clock(r.s) : '—'}</span><span className="ad-zpct num">{Math.round(r.s / total * 100)}%</span></li>)}
    </ul>
    <p className="lab-foot">{z.maxHr ? `Your watch set these limits as ${CALC[z.calc] || 'its own limits'}, with a maximum of ${z.maxHr} bpm.` : 'Zone limits from your watch.'} Change them on the watch or in Garmin Connect; new workouts will use the new limits.</p>
  </Card>
}

function Night({ w, days, exclude }) {
  const n = nightAfterRun(days, w, { exclude, asOf: today() })
  const rows = [
    n.hrv && { label: 'Overnight HRV', value: `${Math.round(n.hrv.value)} ms`, sub: num(n.hrv.pct) ? `${fmtPct(n.hrv.pct)} vs your 7-night average` : null },
    n.rhr && { label: 'Resting heart rate', value: `${Math.round(n.rhr.value)} bpm`, sub: num(n.rhr.diff) ? `${n.rhr.diff > 0 ? '+' : ''}${fmtNumber(n.rhr.diff, 1)} bpm vs your 7-night average` : null },
    num(n.sleepScore) && { label: 'Sleep score', value: String(Math.round(n.sleepScore)) },
  ].filter(Boolean)
  return <Card title="The night after" subtitle={`${fmtDay(n.date, { weekday: 'long', day: 'numeric', month: 'short' })}, from your synced Garmin data`}>
    {rows.length ? <div className="lab-night">{rows.map(r => <div key={r.label}><span>{r.label}</span><strong className="num">{r.value}</strong>{r.sub && <small>{r.sub}</small>}</div>)}</div>
      : <p className="muted">{n.pending ? 'Sync tomorrow morning to see how you slept and recovered after this workout.' : 'No synced sleep or HRV for that night.'}</p>}
  </Card>
}

export default function LabWorkout({ id }) {
  const workouts = useStore(s => s.fitWorkouts), days = useStore(s => s.days), activities = useStore(s => s.activities), source = useStore(s => s.source), exclude = useExcluded()
  const w = workouts.find(x => x.id === id)
  const [seeding, setSeeding] = useState(source === 'demo' && !workouts.length)
  useEffect(() => { if (seeding) actions.ensureDemoFit().catch(() => {}).finally(() => setSeeding(false)) }, [])
  const [series, setSeries] = useState(undefined)
  const [at, setAt] = useState(null)
  const [confirm, setConfirm] = useState(false)
  useEffect(() => { let on = true; setSeries(undefined); actions.getFitSeries(id).then(s => on && setSeries(s ?? null)).catch(() => on && setSeries(null)); return () => { on = false } }, [id, !!w])

  const a = useMemo(() => {
    if (!w || !series) return null
    const rows = chartRows(series), route = routePath(series)
    return { rows, route, splits: kmSplits(series), shape: runShape(series), drift: hrDrift(series), target: targetAdherence(w, series), rw: runWalk(w), cover: coverage(w, series) }
  }, [w, series])
  const synced = useMemo(() => w ? matchActivity(w, activities) : null, [w, activities])

  if (!w && seeding) return <div className="page" aria-busy="true"><PageHeader title="Workout" back="#/lab" /><p className="muted">Preparing demo workouts…</p></div>
  if (!w) return <div className="page page-fade"><PageHeader title="Workout" back="#/lab" /><Empty icon="activity" title="Workout not found" body="It may have been removed from the Workout lab." action={<Button variant="primary" href="#/lab">Workout lab</Button>} /></div>

  const g = typeGroup(w.type), run = g === 'run' || g === 'walk', pace = w.avgSpeed > 0 ? 1000 / w.avgSpeed : null
  const when = `${fmtDay(w.day, { weekday: 'long', day: 'numeric', month: 'long' })}, ${fmtClock(w.startTs)}`
  const paused = num(w.elapsedSec) && num(w.timerSec) ? w.elapsedSec - w.timerSec : null
  const atRow = at != null && a ? a.rows[at] : null
  const routeAt = atRow ? atRow.i : null
  const remove = async () => { await actions.deleteFitWorkouts([w.id]); toast('Workout removed from the lab'); navigate('#/lab', { replace: true }) }

  return <div className="page page-fade ad lab" style={{ '--act-hue': `var(--hue-${GROUP[g].hue})` }}>
    <PageHeader title={w.profileName && !typeName(w.type).toLowerCase().startsWith(w.profileName.toLowerCase()) ? `${typeName(w.type)} · ${w.profileName}` : typeName(w.type)} subtitle={when} back="#/lab" />
    <div className="ad-hero">
      <TypeBadge type={w.type} size={52} />
      <div><div className="ad-type">From the original FIT file{w.workout?.name ? ` · workout “${w.workout.name}”` : ''}</div>
        <div className="lab-tags">{a?.shape && <Badge tone="neutral" icon={false}>{SHAPES[a.shape.kind].label}</Badge>}{w.derived?.mix && <Badge tone="neutral" icon={false}>{INTENSITY[w.derived.mix.kind]}</Badge>}{synced && <a className="lab-link" href={`#/activities/${encodeURIComponent(synced.id)}`}>Synced activity<Icon name="chevron-right" size={14} /></a>}</div></div>
    </div>

    <div className="ad-stats">
      <Stat label="Distance" value={w.distanceM > 0 ? fmtKm(w.distanceM) : null} unit="km" />
      <Stat label="Timer time" value={clock(w.timerSec)} sub={num(paused) && paused >= 30 ? `${clock(w.elapsedSec)} elapsed, ${clock(paused)} paused` : null} />
      {run ? <Stat label="Average pace" value={pace ? fmtPace(pace) : null} unit="/km" sub={pace && num(w.elapsedSec) && paused >= 30 ? `${fmtPace(w.elapsedSec / w.distanceM * 1000)} /km including pauses` : null} />
        : <Stat label="Average speed" value={w.avgSpeed > 0 ? fmtNumber(w.avgSpeed * 3.6, 1) : null} unit="km/h" />}
      <Stat label="Heart rate" value={w.avgHr} unit="bpm" sub={w.maxHr ? `max ${w.maxHr} bpm` : null} />
      <Stat label="Cadence" value={w.avgCadence ? Math.round(w.avgCadence) : null} unit={run ? 'spm' : 'rpm'} sub={w.maxCadence ? `max ${Math.round(w.maxCadence)}` : null} />
      <Stat label="Training load" value={num(w.trainingLoad) ? Math.round(w.trainingLoad) : null} sub={num(w.aerobicTE) ? `aerobic ${fmtNumber(w.aerobicTE, 1)} · anaerobic ${fmtNumber(w.anaerobicTE, 1)}` : null} />
      <Stat label="Climb" value={num(w.ascentM) ? w.ascentM : null} unit="m" sub={num(w.descentM) ? `${w.descentM} m down` : null} />
      <Stat label="Effort you logged" value={num(w.rpe) ? `${fmtNumber(w.rpe)}/10` : null} sub={num(w.calories) ? `${w.calories} kcal` : null} />
    </div>

    {series === undefined && <p className="muted" aria-busy="true">Loading samples…</p>}
    {series === null && <Card title="Samples missing"><p className="muted">This workout’s samples could not be read from storage. Import the file again to restore them.</p></Card>}

    {a && <>
      {(a.route || a.rows.length > 1) && <Card title="Through the workout" subtitle={`Timer time on the x-axis, so pauses are left out. ${a.route ? 'Touch a chart to see where you were.' : ''}`}>
        <div className={`lab-trace${a.route ? '' : ' no-route'}`}>
          {a.route && <Route route={a.route} at={routeAt} />}
          <div className="lab-panels">
            {run && <Panel rows={a.rows} k="pace" label="Pace" unit="/km" hue="steps" fmt={fmtPace} invert step={30} at={at} onAt={setAt} refLine={pace ? { value: pace } : null} />}
            {!run && <Panel rows={a.rows.map(r => ({ ...r, kmh: num(r.pace) ? 3600 / r.pace : null }))} k="kmh" label="Speed" unit="km/h" hue="steps" fmt={v => fmtNumber(v, 1)} at={at} onAt={setAt} />}
            <Panel rows={a.rows} k="hr" label="Heart rate" unit="bpm" hue="heart" fmt={v => fmtNumber(v)} at={at} onAt={setAt} />
            <Panel rows={a.rows} k="cad" label="Cadence" unit={run ? 'spm' : 'rpm'} hue="hrv" fmt={v => fmtNumber(v)} at={at} onAt={setAt} />
            <Panel rows={a.rows} k="alt" label="Elevation" unit="m" hue="battery" fmt={v => fmtNumber(v)} at={at} onAt={setAt} />
          </div>
        </div>
        {a.route && <p className="lab-foot">Green dot: start · ring: finish. Drawn from your GPS points with no map, so your location isn’t sent to a map service.</p>}
      </Card>}

      {a.splits.length > 1 && <Card title="Kilometre splits" subtitle={a.shape ? `${SHAPES[a.shape.kind].label}: ${SHAPES[a.shape.kind].text.toLowerCase()}` : null}>
        <DataTable caption="Kilometre splits" rows={a.splits} maxRows={12} columns={[
          { key: 'n', label: 'Km', render: r => r.partial ? `${r.n} (${fmtNumber(r.distanceM)} m)` : r.n },
          { key: 'pace', label: 'Pace', align: 'right', render: r => `${fmtPace(r.pace)} /km` },
          { key: 'avgHr', label: 'Avg HR', align: 'right', render: r => num(r.avgHr) ? Math.round(r.avgHr) : '—' },
          { key: 'maxHr', label: 'Max HR', align: 'right', render: r => r.maxHr ?? '—' },
          { key: 'avgCad', label: 'Cadence', align: 'right', render: r => num(r.avgCad) ? Math.round(r.avgCad) : '—' },
          { key: 'elevM', label: 'Elev', align: 'right', render: r => num(r.elevM) ? `${r.elevM > 0 ? '+' : ''}${Math.round(r.elevM)} m` : '—' },
        ]} />
      </Card>}

      {w.laps.length > 1 && !autoKmLaps(w.laps) && <Card title="Laps" subtitle="Laps as recorded on your watch">
        <DataTable caption="Laps" rows={w.laps} columns={[
          { key: 'index', label: 'Lap', render: r => r.index + 1 },
          { key: 'distanceM', label: 'Distance', align: 'right', render: r => `${fmtKm(r.distanceM)} km` },
          { key: 'timerSec', label: 'Time', align: 'right', render: r => clock(r.timerSec) },
          { key: 'pace', label: run ? 'Pace' : 'Speed', align: 'right', render: r => r.avgSpeed > 0 ? (run ? `${fmtPace(1000 / r.avgSpeed)} /km` : `${fmtNumber(r.avgSpeed * 3.6, 1)} km/h`) : '—' },
          { key: 'avgHr', label: 'HR', align: 'right', render: r => r.avgHr ? `${r.avgHr}${r.maxHr ? ` / ${r.maxHr}` : ''}` : '—' },
        ]} />
      </Card>}

      <Zones w={w} series={series} />

      {(a.rw || w.pauses.length > 0 || w.recovery.length > 0 || a.target || a.drift.ready) && <Card title="How the workout went">
        <ul className="lab-facts">
          {a.target && <li><Icon name="gauge" size={18} /><div><strong>{a.target.name ? `Workout “${a.target.name}”: ` : 'Workout target: '}{Math.round(a.target.within / a.target.sec * 100)}% of the time in the target {a.target.kind === 'speed' ? 'pace' : 'heart rate'}</strong>
            <span>Target {a.target.kind === 'speed' ? `${fmtPace(1000 / a.target.hi)}–${fmtPace(1000 / a.target.lo)} /km` : `${a.target.lo}–${a.target.hi} bpm`}. {a.target.kind === 'speed' ? `Faster ${Math.round(a.target.above / a.target.sec * 100)}%, slower ${Math.round(a.target.below / a.target.sec * 100)}%` : `Above ${Math.round(a.target.above / a.target.sec * 100)}%, below ${Math.round(a.target.below / a.target.sec * 100)}%`} (pace smoothed over 15 s).</span></div></li>}
          {a.rw && <li><Icon name="steps" size={18} /><div><strong>Running {clock(a.rw.run?.timerSec)}{a.rw.walk ? `, walking ${clock(a.rw.walk.timerSec)}` : ''}</strong>
            <span>Your watch split the workout into {a.rw.run?.count ?? 0} running and {a.rw.walk?.count ?? 0} walking stretches{a.rw.run?.avgSpeed ? `. Running pace ${fmtPace(1000 / a.rw.run.avgSpeed)} /km at ${a.rw.run.avgHr} bpm` : ''}.</span></div></li>}
          {w.pauses.length > 0 && <li><Icon name="clock" size={18} /><div><strong>{w.pauses.length} {w.pauses.length === 1 ? 'pause' : 'pauses'}, {clock(w.pauses.reduce((s, p) => s + p.sec, 0))} in total</strong>
            <span>{w.pauses.map(p => clock(p.sec)).join(', ')}. Timer time and pace leave pauses out; elapsed time keeps them.</span></div></li>}
          {w.recovery.map((r, i) => <li key={i}><Icon name="heart" size={18} /><div><strong>Heart rate fell {num(r.hrAtStop) ? `${r.hrAtStop - r.hrAfter} bpm` : `to ${r.hrAfter} bpm`} in {r.afterSec ? `${Math.round(r.afterSec / 60)} minutes` : '2 minutes'}</strong>
            <span>{num(r.hrAtStop) ? `${r.hrAtStop} → ${r.hrAfter} bpm after you stopped at ${fmtClock(r.stopTs)}. ` : ''}Recovery heart rate recorded by your watch. A bigger drop over the same time usually comes with better fitness; compare it only with your own earlier readings.</span></div></li>)}
          {a.drift.ready && <li><Icon name="trends" size={18} /><div><strong>Heart-rate drift {fmtPct(a.drift.pct, 1)}</strong>
            <span>Distance per heartbeat in the second half against the first. Under about 5% on a steady run usually means the pace suited your aerobic fitness; heat and dehydration raise it.</span></div></li>}
        </ul>
      </Card>}

      <Night w={w} days={days} exclude={exclude} />

      <Card title="What this file recorded" subtitle={w.sensors.length ? `Sensors: ${w.sensors.join(', ')}` : null}>
        <ul className="lab-cover">
          {a.cover.map(c => <li key={c.key} className={c.ok ? 'is-ok' : ''}><Icon name={c.ok ? 'check' : 'minus'} size={16} /><span>{c.label}</span><small>{c.ok ? c.detail : c.hint || 'Not in this file'}</small></li>)}
        </ul>
        <p className="lab-foot">{w.crcOk ? 'File check passed.' : 'This file failed its check, so some values may be missing.'} {w.fileName ? `File ${w.fileName}, ` : ''}imported {fmtDay(toDay(new Date(w.importedAt ?? Date.now())))}. The original file is kept on this device so it can be re-read when the app improves.</p>
      </Card>

      <HowToRead><strong>Pace and timer time</strong> leave out the time the watch was paused. <strong>Elapsed time</strong> runs from start to finish.<br /><br /><strong>Samples</strong> are recorded every 1–10 seconds (Garmin’s smart recording), so every average here is weighted by time, never by sample count.<br /><br /><strong>Training effect, load and zones</strong> are Garmin’s. Splits, run shape, drift and target time are calculated by this app from the samples.<br /><br />These are trends in your own data, not medical advice.</HowToRead>
    </>}

    <div className="lab-remove"><Button variant="ghost" icon="x" onClick={() => setConfirm(true)}>Remove from Workout lab</Button></div>
    {confirm && <ConfirmDialog title="Remove this workout?" body="The imported file and its samples are deleted from this device. Your synced Garmin data isn’t affected, and you can import the file again." confirmLabel="Remove" tone="danger" onConfirm={remove} onCancel={() => setConfirm(false)} />}
  </div>
}
