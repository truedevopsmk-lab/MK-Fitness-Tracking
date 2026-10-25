/** Label/value rows. `rows`: [{ label, value, hint? }] (value may be a node) — or a single `label` + `value`. */
export default function KeyValue({ rows, label, value }) {
  const list = rows || [{ label, value }]
  return <dl className="kv">{list.filter(Boolean).map((r, i) => <div className="kv-row" key={r.label ?? i}>
    <dt>{r.label}{r.hint && <small>{r.hint}</small>}</dt><dd>{r.value ?? '—'}</dd></div>)}</dl>
}
