import { cx } from './cx'
import Icon from './Icon'

/** − value + control for small whole numbers. onChange gets the new value. */
export default function Stepper({ value = 0, min = 0, max = 99, onChange, label, decLabel, incLabel, showValue = true, size = 'md' }) {
  return <div className={cx('num-stepper', size === 'sm' && 'num-stepper-sm')} role="group" aria-label={label}>
    <button type="button" className="num-stepper-btn" aria-label={decLabel} disabled={value <= min} onClick={() => onChange(value - 1)}><Icon name="minus" size={18} /></button>
    {showValue && <output className="num-stepper-val num" aria-live="polite">{value}</output>}
    <button type="button" className="num-stepper-btn" aria-label={incLabel} disabled={value >= max} onClick={() => onChange(value + 1)}><Icon name="plus" size={18} /></button>
  </div>
}
