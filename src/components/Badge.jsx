import { cx } from './cx'
import Icon from './Icon'

const ICON = { good: 'check', warning: 'alert', serious: 'alert', critical: 'alert', neutral: 'minus', accent: 'check' }

/** Status pill. tone: good|warning|serious|critical|neutral|accent. Always icon + text (never colour alone); icon={false} to hide. */
export default function Badge({ tone = 'neutral', icon = true, className, children }) {
  return <span className={cx('badge', `badge-${tone}`, className)}>{icon && <Icon name={ICON[tone] || 'minus'} size={12} strokeWidth={2.4} />}{children}</span>
}
export const StatusPill = Badge
