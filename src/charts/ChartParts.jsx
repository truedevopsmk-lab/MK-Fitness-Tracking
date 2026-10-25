import { fmtWeekday } from '../lib/format'

/** Tooltip card: secondary label on top, then rows with a colour key, bold value and secondary name. */
export function TipCard({ title, rows }) {
  return <div className="tip">
    {title && <div className="tip-title">{title}</div>}
    {rows.map((r, i) => <div className="tip-row" key={i}>
      {r.color && <i className="tip-key" style={{ background: r.color }} />}
      <strong className="tip-val num">{r.value}</strong>
      {r.label && <span className="tip-label">{r.label}</span>}
    </div>)}
  </div>
}

export const defaultTipTitle = d => d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? fmtWeekday(d) : d

/** HTML legend (≥ 2 series). items: [{ label, color }] with colours already resolved. */
export function Legend({ items }) {
  return <ul className="legend">{items.map(i => <li key={i.label}><i style={{ background: i.color }} />{i.label}</li>)}</ul>
}

/** Reference-line label with a surface halo so it stays readable over bars and lines. */
export const refLabel = (value, position, t) => ({
  value, position, content: ({ viewBox, value: v }) => {
    const right = position.endsWith('Right'), x = right ? viewBox.x + viewBox.width - 4 : viewBox.x + 4
    const y = position.startsWith('insideTop') ? viewBox.y - 6 : viewBox.y + 14
    return <text x={x} y={y} textAnchor={right ? 'end' : 'start'} fill={t.text2} stroke={t.surface} strokeWidth={4} paintOrder="stroke" strokeLinejoin="round" fontSize={11} fontFamily={t.fontUi}>{v}</text>
  },
})
