import { cx } from './cx'
import Icon from './Icon'

/** variant: primary|secondary|ghost|danger · size: sm|md|lg · href renders a link · icon: Icon name · loading shows spinner */
export default function Button({ variant = 'secondary', size = 'md', href, icon, loading, block, className, children, disabled, type = 'button', ...rest }) {
  const cls = cx('btn', `btn-${variant}`, `btn-${size}`, block && 'btn-block', loading && 'is-loading', className)
  const inner = <>{loading ? <span className="spinner" aria-hidden="true" /> : icon && <Icon name={icon} size={size === 'sm' ? 16 : 18} />}{children != null && <span>{children}</span>}</>
  if (href && !disabled) return <a className={cls} href={href} {...rest}>{inner}</a>
  return <button className={cls} type={type} disabled={disabled || loading} {...rest}>{inner}</button>
}
