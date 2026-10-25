import { cx } from './cx'

/** Single-choice control. options: [{ value, label, icon? }]. size: md|sm. */
export default function Segmented({ value, options, onChange, label, className, stretch = true }) {
  const onKey = (e, i) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!d) return
    e.preventDefault()
    const next = options[(i + d + options.length) % options.length]
    onChange(next.value)
    e.currentTarget.parentElement.querySelectorAll('button')[(i + d + options.length) % options.length]?.focus()
  }
  return <div className={cx('seg', stretch && 'seg-stretch', className)} role="radiogroup" aria-label={label}>
    {options.map((o, i) => <button key={o.value} type="button" role="radio" aria-checked={o.value === value} tabIndex={o.value === value ? 0 : -1}
      className={cx('seg-btn', o.value === value && 'is-on')} onClick={() => onChange(o.value)} onKeyDown={e => onKey(e, i)}>{o.label}</button>)}
  </div>
}
