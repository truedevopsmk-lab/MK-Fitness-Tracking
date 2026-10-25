import { cx } from './cx'
import Icon from './Icon'

/** Surface container. `href` makes the whole card a link, `onClick` a button. */
export default function Card({ title, subtitle, action, href, onClick, className, flush, children, ...rest }) {
  const head = (title || action) && <div className="card-head">
    <div className="card-titles">
      {title && <h2 className="card-title">{title}</h2>}
      {subtitle && <p className="card-sub">{subtitle}</p>}
    </div>
    {action && <div className="card-action">{action}</div>}
  </div>
  const body = <>{head}{children}</>
  const cls = cx('card', (href || onClick) && 'card-interactive', flush && 'card-flush', className)
  if (href) return <a className={cls} href={href} {...rest}>{body}<Icon name="chevron-right" size={18} className="card-chev" /></a>
  if (onClick) return <div className={cls} role="button" tabIndex={0} onClick={onClick} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(e) } }} {...rest}>{body}</div>
  return <section className={cls} {...rest}>{body}</section>
}
