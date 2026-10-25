import { useEffect, useRef, useState } from 'react'
import Icon from './Icon'

const THRESHOLD = 70, MAX = 110

/** Touch pull-to-refresh for the window scroller (iOS standalone has none). Only arms when scrolled to the very top. */
export default function PullToRefresh({ onRefresh, children }) {
  const [pull, setPull] = useState(0), [busy, setBusy] = useState(false)
  const st = useRef({ y: 0, x: 0, active: false, pull: 0, busy: false })
  useEffect(() => {
    const s = st.current
    const start = e => {
      if (s.busy || window.scrollY > 0 || e.touches.length !== 1 || document.documentElement.style.overflow === 'hidden') return
      s.y = e.touches[0].clientY; s.x = e.touches[0].clientX; s.active = true; s.pull = 0
    }
    const move = e => {
      if (!s.active) return
      const dy = e.touches[0].clientY - s.y, dx = Math.abs(e.touches[0].clientX - s.x)
      if (dy <= 0 || window.scrollY > 0 || dx > dy) { if (s.pull) { s.pull = 0; setPull(0) } if (dy <= 0) s.active = false; return }
      s.pull = Math.min(MAX, dy * .5)
      if (e.cancelable && dy > 8) e.preventDefault()
      setPull(s.pull)
    }
    const end = async () => {
      if (!s.active) return
      s.active = false
      const hit = s.pull >= THRESHOLD
      s.pull = 0
      if (!hit) { setPull(0); return }
      s.busy = true; setBusy(true); setPull(THRESHOLD * .7)
      try { await onRefresh?.() } catch { /* the caller reports errors */ }
      s.busy = false; setBusy(false); setPull(0)
    }
    document.addEventListener('touchstart', start, { passive: true })
    document.addEventListener('touchmove', move, { passive: false })
    document.addEventListener('touchend', end)
    document.addEventListener('touchcancel', end)
    return () => { document.removeEventListener('touchstart', start); document.removeEventListener('touchmove', move); document.removeEventListener('touchend', end); document.removeEventListener('touchcancel', end) }
  }, [onRefresh])
  const ready = pull >= THRESHOLD
  return <div className="ptr">
    <div className="ptr-ind" style={{ height: pull, opacity: Math.min(1, pull / 40) }} aria-hidden={!pull}>
      {busy ? <span className="spinner" /> : <Icon name="arrow-down" size={20} className="ptr-arrow" style={{ transform: `rotate(${ready ? 180 : 0}deg)` }} />}
      <span>{busy ? 'Syncing' : ready ? 'Release to sync' : 'Pull to sync'}</span>
    </div>
    {children}
  </div>
}
