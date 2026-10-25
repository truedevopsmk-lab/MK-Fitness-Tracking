import Segmented from './Segmented'

export const rangeLabel = n => n % 365 === 0 ? `${n / 365}Y` : n >= 120 && n % 30 === 0 ? `${n / 30}M` : `${n}D`

/** Day-range picker. options are day counts (or {value,label}); labels: 7D 30D 60D 4M 1Y. */
export default function RangeTabs({ value, options = [7, 30, 60, 120, 365], onChange, label = 'Date range', ...rest }) {
  return <Segmented value={value} onChange={onChange} label={label} {...rest}
    options={options.map(o => typeof o === 'object' ? o : { value: o, label: rangeLabel(o) })} />
}
