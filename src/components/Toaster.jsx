import { useToasts, dismissToast } from './toast'
import Icon from './Icon'

const ICON = { good: 'check', warning: 'alert', critical: 'alert', neutral: 'check' }

export default function Toaster() {
  const items = useToasts()
  return <div className="toaster" role="status" aria-live="polite">
    {items.map(t => <button key={t.id} className={`toast toast-${t.tone}`} onClick={() => dismissToast(t.id)}>
      <Icon name={ICON[t.tone] || 'check'} size={18} /><span>{t.message}</span>
    </button>)}
  </div>
}
