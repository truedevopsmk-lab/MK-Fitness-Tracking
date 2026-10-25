/** Progress ring. value/max, hue (registry hue name), size px, label under the number; `display` overrides the centre text. */
export default function Ring({ value, max = 100, hue = 'steps', size = 112, label, display, thickness = 10, children }) {
  const r = (size - thickness) / 2, c = 2 * Math.PI * r
  const frac = value == null ? 0 : Math.max(0, Math.min(1, value / max))
  return <div className="ring" style={{ width: size, height: size }} role="img" aria-label={`${label || 'Progress'}: ${value ?? 'no data'} of ${max}`}>
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={thickness} />
      {frac > 0 && <circle className="ring-arc" cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`var(--hue-${hue})`} strokeWidth={thickness} strokeLinecap="round"
        strokeDasharray={`${c * frac} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />}
    </svg>
    <div className="ring-in">{children || <><span className="ring-value num" style={{ fontSize: size * .28 }}>{display ?? (value == null ? '—' : Math.round(value))}</span>{label && <span className="ring-label">{label}</span>}</>}</div>
  </div>
}
