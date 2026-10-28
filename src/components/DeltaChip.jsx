import { deltaTone, isMeaningfulDelta, METRICS } from '../lib/metrics'
import { fmtDuration, fmtNumber } from '../lib/format'
import { cx } from './cx'
import Icon from './Icon'

/** Signed delta text in a metric's own units: '+0:24' style durations, '+3 bpm', '−1.2'. */
export function fmtDelta(metricKey, delta) {
  if (delta == null || !Number.isFinite(delta)) return '—'
  const m = METRICS[metricKey], sign = delta > 0 ? '+' : delta < 0 ? '−' : '', abs = Math.abs(delta)
  if (m?.unit === 'h') return `${sign}${fmtDuration(abs)}`
  const digits = m?.unit === 'br/min' ? 1 : m?.unit === 'kg' && abs < 10 && !Number.isInteger(abs) ? 1 : 0
  const unit = ['ms', 'bpm', 'min', 'kg', 'br/min'].includes(m?.unit) ? ` ${m.unit}` : ''
  return `${sign}${fmtNumber(abs, digits)}${unit}`
}

/** Change chip: arrow icon + text, tone from metric's `better` direction. `text` overrides formatting (e.g. '+4%'); `tone` overrides good|bad|neutral. */
export default function DeltaChip({ delta, metricKey, text, tone, note, className }) {
  if (delta == null && !text) return null
  // Changes below the metric's noise floor read as "about the same", not a coloured −0.4
  if (!text && metricKey && !isMeaningfulDelta(metricKey, delta)) return <span className={cx('delta', 'delta-neutral', className)}>
    <span className="delta-chip"><Icon name="minus" size={12} strokeWidth={2.6} /><span>Same</span></span>
    {note && <span className="delta-note">{note}</span>}
  </span>
  const t = tone || deltaTone(metricKey, delta)
  const icon = delta > 0 ? 'arrow-up' : delta < 0 ? 'arrow-down' : 'minus'
  const label = t === 'good' ? 'better' : t === 'bad' ? 'worse' : 'change'
  return <span className={cx('delta', `delta-${t}`, className)}>
    <span className="delta-chip"><Icon name={icon} size={12} strokeWidth={2.6} /><span>{text || fmtDelta(metricKey, delta)}</span><span className="sr-only"> {label}</span></span>
    {note && <span className="delta-note">{note}</span>}
  </span>
}
