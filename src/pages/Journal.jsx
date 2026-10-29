import { useMemo } from 'react'
import '../styles/reports.css'
import '../styles/journal.css'
import { actions, useStore } from '../state/store'
import { addDays, toDay, today } from '../lib/dates'
import { fmtClock, fmtDay } from '../lib/format'
import { COUNTERS, STATUSES, TAGS, TAG_GROUPS, checkinDay, countStats, entryText, isCheckedIn, journalStats, recentDays, statusInfo, tagInfo } from '../lib/journal'
import { setParams, useRoute } from '../router'
import { Button, Card, DateStepper, Icon, PageHeader, Stepper, TagChips, dayLabel, toast } from '../components'

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
  const loggedRecent = recent.filter(r => isCheckedIn(r.entry)).length
  const stats = useMemo(() => journalStats(journal, asOf, 30), [journal, asOf])
  const cStats = useMemo(() => countStats(journal, asOf, 30), [journal, asOf])
  const counted = cStats.filter(c => c.days > 0)
  const unknown = tags.filter(t => tagInfo(t).group === 'other')
  const toggle = k => actions.toggleTag(shown, k)
  const savedAt = entry?.updatedAt ? (toDay(new Date(entry.updatedAt)) === asOf ? fmtClock(entry.updatedAt) : fmtDay(toDay(new Date(entry.updatedAt)))) : null
  const parts = [statusInfo(entry?.status)?.label, n ? `${n} ${n === 1 ? 'tag' : 'tags'}` : null].filter(Boolean)
  const summary = !entry ? 'Not logged yet' : !isCheckedIn(entry) ? 'Not checked in yet' : parts.length ? parts.join(' · ') : 'Checked in · nothing to tag'

  return <div className="page page-fade">
    <PageHeader title="Journal" subtitle="Tag your days. Your journal stays on this device." />
    <DateStepper date={shown} onChange={go} min={addDays(asOf, -365)} max={asOf} />
    <div className="jr-layout">
      <Card title="Tags" subtitle={summary} className="jr-tags">
        {TAG_GROUPS.map(g => <div key={g.key} className="jr-sec">
          <h3 className="jr-group">{g.label}</h3>
          <TagChips label={g.label} options={TAGS.filter(t => t.group === g.key)} selected={tags} onToggle={toggle} />
        </div>)}
        {unknown.length > 0 && <div className="jr-sec">
          <h3 className="jr-group">Other</h3>
          <TagChips label="Other" options={unknown.map(k => ({ key: k, label: tagInfo(k).label }))} selected={tags} onToggle={toggle} />
        </div>}
        <div className="jr-sec">
          <h3 className="jr-group">Day status</h3>
          <TagChips label={`Day status for ${shown}`} options={STATUSES} selected={entry?.status ? [entry.status] : []} onToggle={k => actions.setStatus(shown, entry?.status === k ? null : k)} />
          <p className="jr-hint">Left out of your baselines, along with the night after.</p>
        </div>
        <div className="jr-foot jr-foot-rule">
          {isCheckedIn(entry)
            ? <><span className="jr-status">{savedAt ? `Saved ${savedAt}` : 'Saved'}</span>
              <Button size="sm" variant="ghost" onClick={() => { actions.clearJournalDay(shown); toast('Day cleared') }}>Clear day</Button></>
            : <Button size="sm" variant="secondary" onClick={() => actions.checkIn(shown)}>{n ? 'Done' : 'Nothing to tag'}</Button>}
        </div>
      </Card>
      <Card title="Counts" subtitle="Tap + as you go · stays on this device" className="jr-counts">
        <ul className="rp-list">
          {COUNTERS.map(c => <li key={c.key}>
            <span className="rp-li-main">{c.label}<small>{c.hint}</small></span>
            <Stepper value={entry?.counts?.[c.key] || 0} max={c.max} label={`${c.label} for ${shown}`} decLabel={`Remove one ${c.noun[0]}`} incLabel={`Add one ${c.noun[0]}`} onChange={v => actions.setCount(shown, c.key, v)} />
          </li>)}
        </ul>
        {counted.length > 0 && <>
          <h3 className="jr-group">Last 30 days</h3>
          <ul className="rp-list">
            {counted.map(c => <li key={c.key}>
              <span className="rp-li-main">{c.label}<small>Average on the {c.days} {c.days === 1 ? 'day' : 'days'} you counted</small></span>
              <strong className="num">{c.avg} {COUNTERS.find(x => x.key === c.key).unit[1]}</strong>
            </li>)}
          </ul>
        </>}
      </Card>
      <Card title="Last 14 days" subtitle={`Logged ${loggedRecent} of 14 days`} className="jr-recent">
        <ul className="rp-list">
          {recent.map(({ date: d, entry: e }) => { const text = entryText(e); return <li key={d}>
            <a className="jr-day" href={`#/journal?date=${d}`} aria-current={d === shown ? 'date' : undefined} onClick={ev => { ev.preventDefault(); go(d) }}>
              <span className="rp-li-main">{dayLabel(d)}<small>{isCheckedIn(e) ? text || 'Nothing tagged' : e && text ? `${text} · not checked in` : 'Not logged'}</small></span>
              <Icon name="chevron-right" size={18} />
            </a>
          </li> })}
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
