import { useState } from 'react'
import { cx } from './cx'

/**
 * columns: [{ key, label, align?: 'left'|'right', render?(row) → node, format?(value, row) }]
 * rows: objects. maxRows collapses long tables behind a 'Show all' button. onRowClick optional.
 */
export default function DataTable({ columns, rows, maxRows, caption, onRowClick, empty = 'No rows' }) {
  const [all, setAll] = useState(false)
  const shown = maxRows && !all ? rows.slice(0, maxRows) : rows
  return <div className="table-wrap">
    <div className="table-scroll"><table className="table">
      {caption && <caption className="sr-only">{caption}</caption>}
      <thead><tr>{columns.map(c => <th key={c.key} scope="col" className={cx(c.align === 'right' && 'r')}>{c.label}</th>)}</tr></thead>
      <tbody>
        {shown.map((row, i) => <tr key={row.id ?? row.date ?? i} className={cx(onRowClick && 'row-click')} onClick={onRowClick ? () => onRowClick(row) : undefined}>
          {columns.map(c => <td key={c.key} className={cx(c.align === 'right' && 'r')}>{c.render ? c.render(row) : c.format ? c.format(row[c.key], row) : row[c.key] ?? '—'}</td>)}
        </tr>)}
        {!shown.length && <tr><td colSpan={columns.length} className="table-empty">{empty}</td></tr>}
      </tbody>
    </table></div>
    {maxRows && rows.length > maxRows && <button type="button" className="table-more" onClick={() => setAll(v => !v)}>{all ? 'Show fewer' : `Show all ${rows.length}`}</button>}
  </div>
}
