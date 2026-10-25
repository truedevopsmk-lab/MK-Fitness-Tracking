/** Horizontal progress bar. value/max, hue, label (left) and valueLabel (right, defaults to value / max). */
export default function Meter({ value, max = 100, hue = 'steps', label, valueLabel, goalLabel }) {
  const frac = value == null ? 0 : Math.max(0, Math.min(1, value / max))
  return <div className="meter">
    {(label || valueLabel !== null) && <div className="meter-head">
      <span className="meter-label">{label}</span>
      <span className="meter-value num">{valueLabel ?? (value == null ? '—' : `${Math.round(value)} / ${max}`)}</span>
    </div>}
    <div className="meter-track" role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value ?? undefined} aria-label={label}>
      <div className="meter-fill" style={{ width: `${frac * 100}%`, background: `var(--hue-${hue})` }} />
    </div>
    {goalLabel && <span className="meter-goal">{goalLabel}</span>}
  </div>
}
