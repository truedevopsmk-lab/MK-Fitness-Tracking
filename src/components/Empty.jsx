import Icon from './Icon'

/** Empty / no-data state. `action` is a node (usually a Button). */
export default function Empty({ icon = 'activity', title, body, action }) {
  return <div className="empty">
    <div className="empty-icon"><Icon name={icon} size={26} /></div>
    <h3 className="empty-title">{title}</h3>
    {body && <p className="empty-body">{body}</p>}
    {action && <div className="empty-action">{action}</div>}
  </div>
}
