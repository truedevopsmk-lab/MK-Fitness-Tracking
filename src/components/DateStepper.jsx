import { addDays, today } from '../lib/dates'
import { fmtWeekday } from '../lib/format'
import Icon from './Icon'

export const dayLabel = date => date === today() ? 'Today' : date === addDays(today(), -1) ? 'Yesterday' : fmtWeekday(date)

/** ← label →  for a YYYY-MM-DD day. min/max clamp the arrows (max defaults to today). */
export default function DateStepper({ date, onChange, min, max = today(), label }) {
  const prev = addDays(date, -1), next = addDays(date, 1)
  const canPrev = !min || prev >= min, canNext = !max || next <= max
  return <div className="stepper" role="group" aria-label="Choose day">
    <button type="button" className="stepper-btn" disabled={!canPrev} onClick={() => onChange(prev)} aria-label="Previous day"><Icon name="chevron-left" size={20} /></button>
    <button type="button" className="stepper-label" onClick={() => max && onChange(max)} disabled={date === max} aria-label={`${label || dayLabel(date)}. Jump to latest`}>
      <span className="stepper-main">{label || dayLabel(date)}</span>
      {!label && dayLabel(date) !== fmtWeekday(date) && <span className="stepper-sub">{fmtWeekday(date)}</span>}
    </button>
    <button type="button" className="stepper-btn" disabled={!canNext} onClick={() => onChange(next)} aria-label="Next day"><Icon name="chevron-right" size={20} /></button>
  </div>
}
