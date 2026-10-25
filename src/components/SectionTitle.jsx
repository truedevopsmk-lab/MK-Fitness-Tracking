/** Small heading above a group of cards. action: node on the right (e.g. a 'See all' link). */
export default function SectionTitle({ children, action, as: Tag = 'h2' }) {
  return <div className="section-title"><Tag>{children}</Tag>{action && <div className="section-action">{action}</div>}</div>
}
