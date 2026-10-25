import { useMemo } from 'react'

/**
 * Tiny trend line (no axes). Plain SVG so it costs nothing at first paint.
 * data: [{ date, value }] (null values leave gaps) · hue: registry hue name · height px · area: 10% wash under the line
 */
export default function Sparkline({ data, hue = 'steps', height = 36, area = true, label }) {
  const geo = useMemo(() => {
    const vals = (data || []).map(p => p.value).filter(v => v != null)
    if (vals.length < 2) return null
    const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1, n = data.length
    const px = i => (i / (n - 1)) * 100, py = v => 94 - ((v - lo) / span) * 88
    const segs = []; let cur = []
    data.forEach((p, i) => { if (p.value == null) { if (cur.length) segs.push(cur); cur = [] } else cur.push([px(i), py(p.value)]) })
    if (cur.length) segs.push(cur)
    const last = [...data].map((p, i) => [p, i]).reverse().find(([p]) => p.value != null)
    return { segs, last: [px(last[1]), py(last[0].value)] }
  }, [data])
  if (!geo) return <div className="spark" style={{ height }} />
  const color = `var(--hue-${hue})`
  return <div className="spark" style={{ height }} role="img" aria-label={label || 'Recent trend'}>
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%">
      {geo.segs.map((s, i) => <g key={i}>
        {area && s.length > 1 && <path d={`M${s[0][0]},100 ${s.map(p => `L${p[0]},${p[1]}`).join(' ')} L${s.at(-1)[0]},100 Z`} fill={color} opacity=".1" />}
        {s.length > 1 && <polyline points={s.map(p => p.join(',')).join(' ')} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
      </g>)}
    </svg>
    <i className="spark-dot" style={{ left: `${geo.last[0]}%`, top: `${geo.last[1]}%`, background: color }} />
  </div>
}
