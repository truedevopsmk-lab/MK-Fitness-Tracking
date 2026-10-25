import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import Icon from './Icon'

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

/** Bottom sheet on phones, centred modal on desktop. Focus-trapped; Esc / scrim closes. */
export default function Sheet({ open, onClose, title, children, footer, size = 'md' }) {
  const ref = useRef(null), id = useId()
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement, root = document.getElementById('root')
    root?.setAttribute('inert', '')
    document.documentElement.style.overflow = 'hidden'
    const el = ref.current
    const first = el.querySelector('[data-autofocus]') || el.querySelector(FOCUSABLE)
    ;(first || el).focus()
    const onKey = e => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose?.() }
      if (e.key !== 'Tab') return
      const f = [...el.querySelectorAll(FOCUSABLE)]
      if (!f.length) { e.preventDefault(); return }
      const a = f[0], z = f.at(-1)
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus() }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      root?.removeAttribute('inert')
      document.documentElement.style.overflow = ''
      prev?.focus?.()
    }
  }, [open, onClose])
  if (!open) return null
  return createPortal(<div className="sheet-layer">
    <div className="sheet-scrim" onClick={onClose} />
    <div className={`sheet sheet-${size}`} role="dialog" aria-modal="true" aria-labelledby={title ? id : undefined} ref={ref} tabIndex={-1}>
      <div className="sheet-grab" aria-hidden="true" />
      <div className="sheet-head">
        {title && <h2 id={id} className="sheet-title">{title}</h2>}
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" size={20} /></button>
      </div>
      <div className="sheet-body">{children}</div>
      {footer && <div className="sheet-foot">{footer}</div>}
    </div>
  </div>, document.body)
}
