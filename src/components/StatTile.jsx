import { METRICS } from '../lib/metrics'
import Sparkline from '../charts/Sparkline'
import { cx } from './cx'
import Badge from './Badge'
import DeltaChip from './DeltaChip'
import Icon from './Icon'

/**
 * Metric tile. Label, formatting, hue and status band come from the registry via `metricKey`.
 *  value   raw number (formatted by the registry) or a ready string
 *  sub     small secondary line, e.g. 'Last night' · delta number in metric units (+ deltaKey for tone, deltaText/deltaNote to override copy)
 *  spark   [{date,value}] · band: undefined = auto from registry, false = hide, {label,tone} = explicit
 *  href    makes the whole tile a link · label overrides the registry label
 */
export default function StatTile({ metricKey, value, sub, delta, deltaKey, deltaText, deltaNote, spark, href, band, label, unit, className }) {
  const m = METRICS[metricKey] || {}
  const has = value != null && value !== ''
  const shown = !has ? '—' : typeof value === 'number' ? (m.format ? m.format(value) : String(value)) : value
  // Split a trailing unit ('62 ms', '54 bpm') so it renders smaller than the number.
  const mm = typeof shown === 'string' && shown.match(/^(.*?\d)\s?(br\/min|ms|bpm|min|kg)$/)
  const main = mm ? mm[1] : shown, suffix = unit ?? (mm ? mm[2] : '')
  const b = band === false ? null : band || (typeof value === 'number' && m.band ? m.band(value) : null)
  const Tag = href ? 'a' : 'div'
  return <Tag className={cx('tile', href && 'tile-link', className)} href={href} style={{ '--tile-hue': `var(--hue-${m.hue || 'steps'})` }}>
    <div className="tile-top">
      <span className="tile-label"><i className="tile-dot" aria-hidden="true" />{label || m.short || m.label || metricKey}</span>
      {href && <Icon name="chevron-right" size={16} className="tile-chev" />}
    </div>
    <div className="tile-value num">{main}{suffix && <small>{suffix}</small>}</div>
    <div className="tile-meta">
      {b && <Badge tone={b.tone}>{b.label}</Badge>}
      {delta != null || deltaText ? <DeltaChip delta={delta} metricKey={deltaKey || metricKey} text={deltaText} note={deltaNote} /> : null}
      {sub && <span className="tile-sub">{sub}</span>}
    </div>
    {spark?.length > 1 && <Sparkline data={spark} hue={m.hue || 'steps'} height={36} />}
  </Tag>
}
