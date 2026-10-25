import Sheet from './Sheet'
import Button from './Button'

/** tone: 'danger' | 'primary'. Renders nothing unless `open` (default true so it can be conditionally mounted). */
export default function ConfirmDialog({ open = true, title, body, confirmLabel = 'Confirm', cancelLabel = 'Cancel', tone = 'primary', onConfirm, onCancel }) {
  return <Sheet open={open} onClose={onCancel} title={title} size="sm"
    footer={<><Button variant="ghost" onClick={onCancel}>{cancelLabel}</Button><Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} data-autofocus>{confirmLabel}</Button></>}>
    {body && <p className="muted">{body}</p>}
  </Sheet>
}
