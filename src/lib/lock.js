// App lock. Keeps casual eyes out — it does NOT encrypt data. Secrets never leave this device:
// a WebAuthn credential id (biometric) or a salted SHA-256 hash of the PIN, in localStorage.
// Contract used by App.jsx: useLockState() → { locked, unlock(), lock() }.
import { useEffect, useSyncExternalStore } from 'react'
import { getPrefs, setPrefs } from './prefs.js'

const KEY = 'mk_fitness_lock'
const subtle = () => globalThis.crypto?.subtle
const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {} } catch { return {} } }
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)))
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0))
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')

let locked = (() => { try { return !!getPrefs().lockEnabled && !!getPrefs().lockMethod } catch { return false } })()
const listeners = new Set()
const setLocked = v => { if (locked !== v) { locked = v; listeners.forEach(fn => fn()) } }
const subscribe = fn => { listeners.add(fn); return () => listeners.delete(fn) }

export const lockConfigured = () => { const p = getPrefs(), s = read(); return !!p.lockEnabled && (p.lockMethod === 'biometric' ? !!s.credId : !!s.pinHash) }
export const lockNow = () => { if (lockConfigured()) setLocked(true) }
export const unlockNow = () => setLocked(false)

export async function biometricAvailable() {
  try { return !!(window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()) } catch { return false }
}

export async function registerBiometric() {
  const challenge = crypto.getRandomValues(new Uint8Array(32)), userId = crypto.getRandomValues(new Uint8Array(16))
  const cred = await navigator.credentials.create({ publicKey: {
    challenge, rp: { name: 'MK Fitness' }, user: { id: userId, name: 'mk-fitness', displayName: 'MK Fitness' },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
    authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' }, timeout: 60000,
  } })
  if (!cred) throw new Error('Face ID or Touch ID setup was cancelled.')
  localStorage.setItem(KEY, JSON.stringify({ credId: b64(cred.rawId) }))
  setPrefs({ lockEnabled: true, lockMethod: 'biometric' })
}

export async function verifyBiometric() {
  const { credId } = read()
  if (!credId) return false
  try {
    const res = await navigator.credentials.get({ publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)), userVerification: 'required', timeout: 60000,
      allowCredentials: [{ type: 'public-key', id: unb64(credId), transports: ['internal'] }],
    } })
    return !!res
  } catch { return false }
}

async function hashPin(pin, salt) {
  if (!subtle()) throw new Error('Secure hashing is not available in this browser.')
  return hex(await subtle().digest('SHA-256', new TextEncoder().encode(`${salt}:${pin}`)))
}

export const validPin = pin => /^\d{4,6}$/.test(pin)

export async function setPin(pin) {
  if (!validPin(pin)) throw new Error('Use 4 to 6 digits.')
  const pinSalt = hex(crypto.getRandomValues(new Uint8Array(16)))
  localStorage.setItem(KEY, JSON.stringify({ pinSalt, pinHash: await hashPin(pin, pinSalt), pinLength: pin.length }))
  setPrefs({ lockEnabled: true, lockMethod: 'pin' })
}

/** Digits in the saved PIN, so the keypad submits at exactly that length (older saves: null). */
export const pinLength = () => read().pinLength ?? null

// Wrong-PIN throttle, persisted so a reload doesn't reset it: free tries, then 30 s doubling to 15 min.
const FAIL_KEY = 'mk_fitness_lock_fails', FREE_TRIES = 5
const fails = () => { try { return JSON.parse(localStorage.getItem(FAIL_KEY)) || { n: 0, until: 0 } } catch { return { n: 0, until: 0 } } }
/** Milliseconds until another PIN attempt is allowed (0 = now). */
export const pinRetryInMs = () => Math.max(0, fails().until - Date.now())

/** @returns {Promise<boolean>} false for a wrong PIN or while throttled (check pinRetryInMs()). */
export async function verifyPin(pin) {
  if (pinRetryInMs() > 0) return false
  const { pinSalt, pinHash } = read()
  const ok = !!pinHash && (await hashPin(pin, pinSalt)) === pinHash
  if (ok) localStorage.removeItem(FAIL_KEY)
  else {
    const n = fails().n + 1
    const wait = n > FREE_TRIES ? Math.min(15 * 60000, 30000 * 2 ** (n - FREE_TRIES - 1)) : 0
    localStorage.setItem(FAIL_KEY, JSON.stringify({ n, until: wait ? Date.now() + wait : 0 }))
  }
  return ok
}

export function disableLock() {
  localStorage.removeItem(KEY)
  localStorage.removeItem(FAIL_KEY)
  setPrefs({ lockEnabled: false, lockMethod: null })
  setLocked(false)
}

export function useLockState() {
  const isLocked = useSyncExternalStore(subscribe, () => locked)
  useEffect(() => {
    let hiddenAt = null
    const onVis = () => {
      if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return }
      const mins = getPrefs().lockAfterMin
      if (hiddenAt != null && Date.now() - hiddenAt >= mins * 60000) lockNow()
      hiddenAt = null
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])
  return { locked: isLocked && lockConfigured(), unlock: unlockNow, lock: lockNow }
}
