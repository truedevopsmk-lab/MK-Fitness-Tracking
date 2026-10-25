const cell = v => {
  if (v == null) return ''
  const s = String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * @param {object[]} rows
 * @param {Array<{key:string, label?:string, value?:(row:object)=>any}>} columns
 */
export function toCsv(rows, columns) {
  const head = columns.map(c => cell(c.label ?? c.key)).join(',')
  const body = rows.map(r => columns.map(c => cell(c.value ? c.value(r) : r[c.key])).join(','))
  return [head, ...body].join('\r\n')
}

/** Trigger a browser download. Works in iOS Safari (opens the share sheet for the file). */
export function downloadFile(filename, content, mime = 'text/csv;charset=utf-8') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
