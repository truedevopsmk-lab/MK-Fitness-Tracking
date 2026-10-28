// Dev-only kitchen sink: every UI-kit component and chart with demo data.  #/__kit
import { useMemo, useState } from 'react'
import { useStore } from '../state/store'
import { addDays, today } from '../lib/dates'
import { fmtDuration } from '../lib/format'
import { SLEEP_STAGES, STRESS_LEVELS } from '../lib/metrics'
import { lastNDays, metricSeries } from '../data/select'
import { summarize } from '../lib/stats'
import { Badge, Button, Card, ConfirmDialog, DataTable, DateStepper, Empty, Icon, InstallHint, KeyValue, Meter, MissingNote, PageHeader, RangeTabs, Ring, SectionTitle, Segmented, Sheet, StatTile, TagChips, toast } from '../components'
import TrendChart from '../charts/TrendChart'
import StackedBars from '../charts/StackedBars'
import Sparkline from '../charts/Sparkline'

const ICONS = ['today', 'trends', 'sleep', 'reports', 'more', 'sync', 'settings', 'insights', 'activity', 'heart', 'battery', 'stress', 'steps', 'flame', 'chevron-left', 'chevron-right', 'check', 'alert', 'x', 'download', 'upload', 'lock', 'sun', 'moon', 'palette', 'refresh']

export default function Kit() {
  const days = useStore(s => s.days)
  const [range, setRange] = useState(30), [date, setDate] = useState(today()), [seg, setSeg] = useState('a'), [sheet, setSheet] = useState(false), [confirm, setConfirm] = useState(false), [chips, setChips] = useState(['nap'])
  const end = today()
  const series = k => metricSeries(days, k, addDays(end, -(range - 1)), end)
  const sleep = series('sleepScore'), steps = series('steps'), hrv = series('hrv'), dur = series('sleepDuration'), rhr = series('restingHr')
  const sum = useMemo(() => summarize(sleep), [sleep])
  const stageRows = useMemo(() => Array.from({ length: 21 }, (_, i) => { const d = addDays(end, -(20 - i)), s = days[d]?.sleep; return { date: d, deep: s?.deepSec ?? null, light: s?.lightSec ?? null, rem: s?.remSec ?? null, awake: s?.awakeSec ?? null } }), [days])
  const stressRows = useMemo(() => Array.from({ length: 21 }, (_, i) => { const d = addDays(end, -(20 - i)), s = days[d]?.stress; return { date: d, restSec: s?.restSec ?? null, lowSec: s?.lowSec ?? null, mediumSec: s?.mediumSec ?? null, highSec: s?.highSec ?? null } }), [days])
  const hrvBase = useMemo(() => { const d = days[end] || days[addDays(end, -1)]; return d?.hrv ? { low: d.hrv.baselineLow, high: d.hrv.baselineHigh, label: 'Baseline range' } : null }, [days])
  const withGaps = hrv.map((p, i) => i % 9 === 4 ? { ...p, value: null } : p)
  const tableRows = [...steps].reverse().slice(0, 12).map(p => ({ date: p.date, steps: p.value }))
  return <div className="page">
    <PageHeader title="UI kit" subtitle="Dev-only kitchen sink" back="#/" actions={<Button size="sm" onClick={() => toast('Saved to this device', { tone: 'good' })}>Toast</Button>} />
    <InstallHint />
    <SectionTitle>Stat tiles</SectionTitle>
    <div className="grid grid-4">
      <StatTile metricKey="sleepScore" value={84} sub="Last night" delta={4} spark={lastNDays(days, 'sleepScore', 14)} href="#/trends/sleepScore" />
      <StatTile metricKey="hrv" value={46} sub="Baseline 49–63" delta={-6} spark={lastNDays(days, 'hrv', 14)} href="#/trends/hrv" />
      <StatTile metricKey="steps" value={7421} sub="of 10,000" delta={820} spark={lastNDays(days, 'steps', 14)} />
      <StatTile metricKey="sleepDuration" value={25200} sub="vs 7h 12m avg" delta={-1800} />
      <StatTile metricKey="bodyBatteryHigh" value={72} sub="Charged overnight" />
      <StatTile metricKey="stressAvg" value={null} sub="No data yet" />
      <StatTile metricKey="restingHr" value={54} delta={2} sub="7-day avg 53" />
      <StatTile metricKey="readiness" value={91} delta={0} deltaText="No change" />
    </div>
    <SectionTitle>Cards, controls</SectionTitle>
    <div className="grid grid-1 grid-2d">
      <Card title="Card title" subtitle="Secondary line" action={<Badge tone="good">Balanced</Badge>}>
        <KeyValue rows={[{ label: 'Average', value: '7h 12m' }, { label: 'Best night', value: '8h 20m', hint: '18 Oct' }, { label: 'Missing', value: <MissingNote missing={3} total={30} /> }]} />
      </Card>
      <Card title="Tappable card" subtitle="Whole card is a link" href="#/trends"><p className="muted">Body copy sits in a legible system face.</p></Card>
      <Card title="Controls">
        <div className="kit-stack">
          <RangeTabs value={range} onChange={setRange} />
          <Segmented value={seg} onChange={setSeg} options={[{ value: 'a', label: 'Day' }, { value: 'b', label: 'Week' }, { value: 'c', label: 'Month' }]} />
          <DateStepper date={date} onChange={setDate} />
          <TagChips label="Example tags" options={[{ key: 'alcohol', label: 'Alcohol' }, { key: 'nap', label: 'Nap' }, { key: 'travel', label: 'Travel' }]} selected={chips} onToggle={k => setChips(c => c.includes(k) ? c.filter(x => x !== k) : [...c, k])} />
          <div className="kit-row"><Button variant="primary">Primary</Button><Button>Secondary</Button><Button variant="ghost">Ghost</Button><Button variant="danger">Delete</Button></div>
          <div className="kit-row"><Button size="sm" icon="sync">Small</Button><Button variant="primary" loading>Syncing</Button><Button disabled>Disabled</Button></div>
          <div className="kit-row"><Badge tone="good">Good</Badge><Badge tone="warning">Warning</Badge><Badge tone="serious">Serious</Badge><Badge tone="critical">Critical</Badge><Badge tone="neutral">Neutral</Badge><Badge tone="accent">Accent</Badge></div>
          <div className="kit-row"><Button size="sm" onClick={() => setSheet(true)}>Open sheet</Button><Button size="sm" variant="danger" onClick={() => setConfirm(true)}>Confirm</Button></div>
        </div>
      </Card>
      <Card title="Ring and meter">
        <div className="kit-row" style={{ gap: 20 }}>
          <Ring value={84} hue="sleep" label="Sleep" />
          <Ring value={7421} max={10000} hue="steps" size={84} thickness={8} display="74%" />
          <div style={{ flex: 1, minWidth: 140 }} className="kit-stack"><Meter value={7421} max={10000} hue="steps" label="Steps" valueLabel="7,421 / 10,000" /><Meter value={92} max={150} hue="intensity" label="Intensity this week" valueLabel="92 / 150 min" /></div>
        </div>
      </Card>
      <Card title="Empty state"><Empty icon="sleep" title="No sleep data yet" body="Sync Garmin to see your nights here." action={<Button variant="primary" size="sm" href="#/sync">Open Sync Center</Button>} /></Card>
      <Card title="Icons"><div className="kit-row" style={{ gap: 14, color: 'var(--text-2)' }}>{ICONS.map(n => <Icon key={n} name={n} size={24} />)}</div></Card>
    </div>
    <SectionTitle>Charts</SectionTitle>
    <div className="grid grid-1 grid-2d">
      <Card title="Sleep score" subtitle={`${range} days · avg ${Math.round(sum.avg ?? 0)}`} action={<MissingNote missing={sum.missing} total={sum.total} />}><TrendChart data={sleep} metricKey="sleepScore" kind="area" baseline={{ value: sum.avg, label: 'Avg' }} /></Card>
      <Card title="Steps" subtitle="Goal 10,000"><TrendChart data={steps} metricKey="steps" kind="bar" goal={{ value: 10000, label: 'Goal' }} /></Card>
      <Card title="Overnight HRV" subtitle="With gaps and baseline band"><TrendChart data={withGaps} metricKey="hrv" kind="line" band={hrvBase || undefined} /></Card>
      <Card title="Sleep duration"><TrendChart data={dur} metricKey="sleepDuration" kind="line" goal={{ value: 8 * 3600, label: 'Need' }} /></Card>
      <Card title="Resting heart rate"><TrendChart data={rhr} metricKey="restingHr" kind="area" height={160} /></Card>
      <Card title="Sleep stages" subtitle="Last 21 nights"><StackedBars data={stageRows} series={SLEEP_STAGES} unit={3600} axisFormat={v => `${Math.round(v / 3600)}h`} format={v => fmtDuration(v)} total /></Card>
      <Card title="Stress levels" subtitle="Last 21 days"><StackedBars data={stressRows} series={STRESS_LEVELS.map(s => ({ ...s, key: s.field }))} unit={3600} axisFormat={v => `${Math.round(v / 3600)}h`} format={v => fmtDuration(v)} /></Card>
      <Card title="Sparklines"><div className="kit-stack"><Sparkline data={lastNDays(days, 'sleepScore', 30)} hue="sleep" /><Sparkline data={lastNDays(days, 'steps', 30)} hue="steps" height={48} /></div></Card>
    </div>
    <SectionTitle>Table</SectionTitle>
    <Card flush><DataTable maxRows={5} caption="Recent steps" columns={[{ key: 'date', label: 'Date' }, { key: 'steps', label: 'Steps', align: 'right', format: v => v == null ? '—' : v.toLocaleString('en-IN') }]} rows={tableRows} /></Card>
    <Sheet open={sheet} onClose={() => setSheet(false)} title="Sheet title" footer={<Button variant="primary" onClick={() => setSheet(false)}>Done</Button>}><p className="muted">Bottom sheet on phones, centred modal on desktop. Focus is trapped; Esc closes.</p></Sheet>
    <ConfirmDialog open={confirm} title="Clear local data?" body="This removes all health data from this device. Your Garmin account is not affected." confirmLabel="Clear data" tone="danger" onConfirm={() => setConfirm(false)} onCancel={() => setConfirm(false)} />
  </div>
}
