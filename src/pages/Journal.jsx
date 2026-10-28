import { useMemo } from 'react'
import '../styles/reports.css'
import '../styles/journal.css'
import { actions, useStore } from '../state/store'
import { addDays, toDay, today } from '../lib/dates'
import { fmtClock, fmtDay } from '../lib/format'
import { TAGS, TAG_GROUPS, checkinDay, journalStats, recentDays, tagInfo, tagLabels } from '../lib/journal'
import { setParams, useRoute } from '../router'
import { Button, Card, DateStepper, Icon, PageHeader, TagChips, dayLabel, toast } from '../components'

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const count = n => `${n} ${n === 1 ? 'day' : 'days'}`

export default function Journal() {
  const journal = useStore(s => s.journal)
  const { params } = useRoute()
  const asOf = today(), def = checkinDay()
  const shown = DAY_RE.test(params.date || '') && params.date <= asOf ? params.date : def
  const go = d => setParams({ date: d === def ? null : d })
  const entry = journal[shown], tags = entry?.tags || [], n = tags.length
  const recent = useMemo(() => recentDays(journal, asOf, 14), [journal, asOf])
  const loggedRecent = recent.filter(r => r.entry).length
  const stats = useMemo(() => journalStats(journal, asOf, 30), [journal, asOf])
  const unknown = tags.filter(t => tagInfo(t).group === 'other')
  const toggle = k => actions.toggleTag(shown, k)
  const savedAt = entry?.updatedAt ? (toDay(new Date(entry.updatedAt)) === asOf ? fmtClock(entry.updatedAt) : fmtDay(toDay(new Date(entry.updatedAt)))) : null
  const status = !entry ? 'Not logged yet' : n ? `${n} ${n === 1 ? 'tag' : 'tags'}` : 'Checked in · nothing to tag'

  return <div className="page page-fade">
    <PageHeader title="Journal" subtitle="Tag your days. Your journal stays on this device." />
    <DateStepper date={shown} onChange={go} min={addDays(asOf, -365)} max={asOf} />
    <div className="jr-layout">
      <Card title="Tags" subtitle={status} className="jr-tags">
        {TAG_GROUPS.map(g => <div key={g.key} className="jr-sec">
          <h3 className="jr-group">{g.label}</h3>
          <TagChips label={g.label} options={TAGS.filter(t => t.group === g.key)} selected={tags} onToggle={toggle} />
        </div>)}
        {unknown.length > 0 && <div className="jr-sec">
          <h3 className="jr-group">Other</h3>
          <TagChips label="Other" options={unknown.map(k => ({ key: k, label: tagInfo(k).label }))} selected={tags} onToggle={toggle} />
        </div>}
        <div className="jr-foot jr-foot-rule">
          {entry
            ? <><span className="jr-status">{savedAt ? `Saved ${savedAt}` : 'Saved'}</span>
              <Button size="sm" variant="ghost" onClick={() => { actions.clearJournalDay(shown); toast('Day cleared') }}>Clear day</Button></>
            : <Button size="sm" variant="secondary" onClick={() => actions.setJournal(shown, { tags: [] })}>Nothing to tag</Button>}
        </div>
      </Card>
      <Card title="Last 14 days" subtitle={`Logged ${loggedRecent} of 14 days`} className="jr-recent">
        <ul className="rp-list">
          {recent.map(({ date: d, entry: e }) => <li key={d}>
            <a className="jr-day" href={`#/journal?date=${d}`} aria-current={d === shown ? 'date' : undefined} onClick={ev => { ev.preventDefault(); go(d) }}>
              <span className="rp-li-main">{dayLabel(d)}<small>{!e ? 'Not logged' : e.tags.length ? tagLabels(e.tags).join(', ') : 'Nothing tagged'}</small></span>
              <Icon name="chevron-right" size={18} />
            </a>
          </li>)}
        </ul>
      </Card>
      <Card title="Most tagged" subtitle={`Last 30 days · ${count(stats.logged)} logged`} className="jr-most" action={<Button size="sm" variant="ghost" href="#/reports/habits">Habit impact</Button>}>
        {stats.counts.length
          ? <ul className="rp-list">{stats.counts.map(c => <li key={c.key}>
            <span className="jr-most-label">{c.label}</span>
            <span className="jr-bar" aria-hidden="true"><i style={{ width: `${(c.days / stats.counts[0].days) * 100}%` }} /></span>
            <strong className="num">{count(c.days)}</strong>
          </li>)}</ul>
          : <p className="rp-note">Nothing tagged in the last 30 days</p>}
      </Card>
    </div>
    <p className="jr-note">Tag the day it happened: a drink last night belongs to yesterday, so it lines up with the night that followed. Your journal is never sent to Garmin or anywhere else, and it is included in JSON exports.</p>
  </div>
}
