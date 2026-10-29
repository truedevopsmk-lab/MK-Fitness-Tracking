import { useMemo } from 'react'
import { useExcluded, useStore } from '../state/store'
import { computeInsights, DETECTORS_INFO } from '../lib/insights'
import { dataBounds } from '../data/select'
import { daysBetween, today } from '../lib/dates'
import Badge from '../components/Badge'
import Button from '../components/Button'
import Empty from '../components/Empty'
import Card from '../components/Card'
import Icon from '../components/Icon'
import PageHeader from '../components/PageHeader'
import SectionTitle from '../components/SectionTitle'
import '../styles/insights.css'

const TONE = {
  positive: { badge: 'good', label: 'Going well', icon: 'trends' },
  negative: { badge: 'warning', label: 'Worth watching', icon: 'alert' },
  neutral: { badge: 'neutral', label: 'Pattern', icon: 'insights' },
}

function InsightCard({ insight }) {
  const tone = TONE[insight.tone] || TONE.neutral
  return <article className={`insight insight-${insight.tone}`}>
    <div className="insight-top">
      <span className="insight-icon" aria-hidden="true"><Icon name={tone.icon} size={20} /></span>
      <Badge tone={tone.badge}>{tone.label}</Badge>
    </div>
    <h2 className="insight-title">{insight.title}</h2>
    <p className="insight-body">{insight.body}</p>
    <p className="insight-evidence">{insight.evidence}</p>
    {insight.href && <a className="insight-link" href={insight.href}>See trend<Icon name="chevron-right" size={16} /></a>}
  </article>
}

export default function Insights() {
  const days = useStore(s => s.days)
  const activities = useStore(s => s.activities)
  const exclude = useExcluded()
  const list = useMemo(() => computeInsights(days, activities, { exclude }), [days, activities, exclude])
  const bounds = useMemo(() => dataBounds(days), [days])
  const span = bounds ? daysBetween(bounds.first, today()) + 1 : 0
  const enough = span >= 14

  return <div className="page page-fade insights-page">
    <PageHeader title="Insights" subtitle="Patterns from your own data — trends, not medical advice." />
    {!enough
      ? <Card><Empty icon="insights" title="Insights appear after about 2 weeks of synced data"
          body={bounds ? `You have ${span} day${span === 1 ? '' : 's'} so far. Sync more history to see patterns.` : 'Sync your Garmin data to get started.'}
          action={<Button variant="primary" href="#/sync">Open Sync Center</Button>} /></Card>
      : list.length === 0
        ? <Card><Empty icon="insights" title="No clear patterns right now"
            body="Nothing in your recent data is strong enough to call out. Insights only show when there is enough data and a real difference." /></Card>
        : <>
            <p className="insights-count">{list.length} pattern{list.length === 1 ? '' : 's'} found, strongest first</p>
            <div className="insight-list">{list.map(i => <InsightCard key={i.id} insight={i} />)}</div>
          </>}

    <div>
      <SectionTitle>How this works</SectionTitle>
      <details className="insights-info">
        <summary>What we look at</summary>
        <p className="insights-info-intro">Each check stays silent unless there is enough data and the difference is big enough to matter. These describe what happened in your data, not why. Days you mark sick, injured, travelling or on a break in the Journal, and the day after each, are left out.</p>
        <dl>
          {DETECTORS_INFO.map(d => <div key={d.id}><dt>{d.name}</dt><dd>{d.rule}</dd></div>)}
        </dl>
      </details>
    </div>
  </div>
}
