import { useState } from 'react'
import { tokenFromApiKey } from '../sync/garmin'
import Button from './Button'
import Icon from './Icon'

/** Personal API key → short-lived token. The key is used once and never stored. */
export default function ConnectForm({ onConnected, compact }) {
  const [key, setKey] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('')
  async function submit(e) {
    e.preventDefault()
    if (!key.trim()) return
    setBusy(true); setError('')
    try { await tokenFromApiKey(key); setKey(''); onConnected?.() }
    catch (x) { setError(x.message || 'Could not connect to Garmin.') }
    finally { setBusy(false) }
  }
  return <form className="connect-form" onSubmit={submit}>
    <label className="field">
      <span className="field-label">Garmin Personal API key</span>
      <input className="input" type="password" autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={key} onChange={e => setKey(e.target.value)} placeholder="Paste your key" aria-invalid={!!error} aria-describedby={error ? 'connect-err' : undefined} />
    </label>
    {error && <p id="connect-err" className="field-error" role="alert"><Icon name="alert" size={16} />{error}</p>}
    <Button type="submit" variant="primary" size="lg" block loading={busy} disabled={!key.trim()} icon={busy ? undefined : 'link'}>{busy ? 'Connecting' : 'Connect Garmin'}</Button>
    {!compact && <p className="field-hint">Garmin Connect → Account → Personal API access. The key is exchanged once for a short-lived token.</p>}
  </form>
}
