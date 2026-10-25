import { useEffect, useRef, useState } from 'react'
import { usePrefs } from '../lib/prefs'
import { disableLock, pinLength, pinRetryInMs, verifyBiometric, verifyPin } from '../lib/lock'
import { actions } from '../state/store'
import Button from './Button'
import ConfirmDialog from './ConfirmDialog'
import Icon from './Icon'
import '../styles/settings.css'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'bio', '0', 'del']

export default function LockScreen({ onUnlock }) {
  const { lockMethod } = usePrefs()
  const [pin, setPin] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [reset, setReset] = useState(false)
  const tried = useRef(false)

  const bio = async () => {
    setBusy(true); setError('')
    const ok = await verifyBiometric()
    setBusy(false)
    if (ok) onUnlock(); else setError('Could not verify. Try again.')
  }
  useEffect(() => { if (lockMethod === 'biometric' && !tried.current) { tried.current = true; bio() } }, [lockMethod]) // eslint-disable-line react-hooks/exhaustive-deps

  const waitMsg = () => { const s = Math.ceil(pinRetryInMs() / 1000); return s > 0 ? `Too many wrong PINs. Try again in ${s > 90 ? `${Math.ceil(s / 60)} min` : `${s} s`}.` : '' }
  const submit = async value => {
    if (await verifyPin(value)) { setPin(''); onUnlock(); return }
    setPin('')
    setError(waitMsg() || 'Wrong PIN. Try again.')
  }
  const press = k => {
    if (busy) return
    const wait = waitMsg()
    if (wait) return setError(wait)
    setError('')
    if (k === 'del') return setPin(p => p.slice(0, -1))
    const next = (pin + k).slice(0, 6), len = pinLength()
    setPin(next)
    clearTimeout(press.t)
    // Submit at the saved PIN's exact length; PINs saved before lengths were stored fall back to a pause after 4+ digits
    if (len ? next.length === len : next.length === 6) submit(next)
    else if (!len && next.length >= 4) press.t = setTimeout(() => submit(next), 900)
  }
  const wipe = async () => { await actions.clearLocalData(); disableLock(); setReset(false); onUnlock() }

  return <div className="lock" role="dialog" aria-modal="true" aria-label="App locked">
    <div className="lock-in">
      <div className="lock-logo">MK<span>FITNESS</span></div>
      <p className="lock-hint">{lockMethod === 'biometric' ? 'Locked. Use Face ID or Touch ID to open.' : 'Enter your PIN to open.'}</p>
      {lockMethod === 'biometric'
        ? <Button variant="primary" size="lg" icon="lock" loading={busy} onClick={bio}>Unlock</Button>
        : <>
          <div className="lock-dots" aria-label={`${pin.length} digits entered`}>{[0, 1, 2, 3, 4, 5].map(i => <i key={i} className={i < pin.length ? 'is-on' : ''} />)}</div>
          <div className="lock-pad">{KEYS.map(k => k === 'bio' ? <span key={k} /> : <button key={k} type="button" className="lock-key" onClick={() => press(k)} aria-label={k === 'del' ? 'Delete' : k}>{k === 'del' ? <Icon name="chevron-left" size={22} /> : k}</button>)}</div>
        </>}
      <p className="lock-error" role="alert">{error}</p>
      <button type="button" className="lock-forgot" onClick={() => setReset(true)}>{lockMethod === 'pin' ? 'Forgot PIN? Clear local data' : 'Cannot unlock? Clear local data'}</button>
    </div>
    {reset && <ConfirmDialog tone="danger" title="Clear local data?" confirmLabel="Clear data and unlock"
      body="This deletes all health data stored in this browser and turns off the lock. Your Garmin account is not affected; you can sync again afterwards."
      onConfirm={wipe} onCancel={() => setReset(false)} />}
  </div>
}
