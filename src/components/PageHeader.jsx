import Icon from './Icon'

/** Page title row. back: href string (link) or true (history.back). actions: node(s) on the right. */
export default function PageHeader({ title, subtitle, back, actions }) {
  return <div className="page-head">
    {back && (typeof back === 'string'
      ? <a className="page-back" href={back} aria-label="Back"><Icon name="chevron-left" size={22} /></a>
      : <button className="page-back" type="button" onClick={() => history.back()} aria-label="Back"><Icon name="chevron-left" size={22} /></button>)}
    <div className="page-head-text">
      <h1 className="page-title">{title}</h1>
      {subtitle && <p className="page-sub">{subtitle}</p>}
    </div>
    {actions && <div className="page-actions">{actions}</div>}
  </div>
}
