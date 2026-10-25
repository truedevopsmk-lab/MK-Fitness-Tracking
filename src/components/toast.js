import { useSyncExternalStore } from 'react'

let items = [], seq = 0
const listeners = new Set()
const emit = () => listeners.forEach(fn => fn())

/** toast('Saved', { tone: 'good'|'warning'|'critical'|'neutral', ms }) */
export function toast(message, { tone = 'neutral', ms = 4000 } = {}) {
  const id = ++seq
  items = [...items, { id, message, tone }]
  emit()
  setTimeout(() => dismissToast(id), ms)
  return id
}
export function dismissToast(id) { items = items.filter(t => t.id !== id); emit() }
export const useToasts = () => useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn) }, () => items)
