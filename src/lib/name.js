// Greeting name. Garmin's `displayName` is often an internal id (a UUID, or a long
// random handle) rather than a name, so it is only used when it looks like a person's name.
import { usePrefs } from './prefs.js'
import { useStore } from '../state/store.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** True when a Garmin-provided name is fit to greet someone with. */
export function isHumanName(value) {
  const s = typeof value === 'string' ? value.trim() : ''
  if (!s || s.length > 40 || UUID.test(s)) return false
  if (/^[0-9a-f-]{12,}$/i.test(s)) return false            // other hex ids
  if (/\d{4,}/.test(s)) return false                        // 'user8842913'-style handles
  return /\p{L}/u.test(s)
}

/** Local override → Garmin full name → Garmin display name → '' (greeting without a name). */
export function resolveName(override, profile) {
  const own = typeof override === 'string' ? override.trim() : ''
  if (own) return own.slice(0, 40)
  const full = profile?.fullName?.trim()
  if (isHumanName(full)) return full.split(/\s+/)[0]
  return isHumanName(profile?.displayName) ? profile.displayName.trim() : ''
}

export function useDisplayName() {
  const { displayName } = usePrefs()
  const profile = useStore(s => s.profile)
  return resolveName(displayName, profile)
}

/** 'Good evening, Asha' or just 'Good evening'. */
export const withName = (greeting, name) => name ? `${greeting}, ${name}` : greeting
