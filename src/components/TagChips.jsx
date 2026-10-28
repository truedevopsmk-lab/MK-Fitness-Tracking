import { cx } from './cx'
import Icon from './Icon'

/** Toggle chips for a tag list. options: [{ key, label }]. Selected chips show a check so state is not colour-only. */
export default function TagChips({ options, selected = [], onToggle, label }) {
  return <div className="tag-chips" role="group" aria-label={label}>
    {options.map(o => {
      const on = selected.includes(o.key)
      return <button key={o.key} type="button" className={cx('tag-chip', on && 'is-on')} aria-pressed={on} onClick={() => onToggle(o.key)}>
        {on && <Icon name="check" size={16} />}{o.label}
      </button>
    })}
  </div>
}
