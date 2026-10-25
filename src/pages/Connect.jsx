import { actions } from '../state/store'
import ConnectForm from '../components/ConnectForm'
import Button from '../components/Button'
import Icon from '../components/Icon'

/** Full-screen first-run screen: no session, no cached data, not demo. */
export default function Connect({ onConnected }) {
  return <main className="connect">
    <div className="connect-hero">
      <svg className="connect-mark" viewBox="0 0 64 64" aria-hidden="true">
        <rect width="64" height="64" rx="18" fill="var(--surface-2)" />
        <path d="M8 38h11l5-14 8 24 6-18 4 8h14" fill="none" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <h1 className="connect-title">MK<span>Fitness</span></h1>
      <p className="connect-lede">Your Garmin sleep, stress, HRV and training in one calm place.</p>
    </div>
    <div className="card"><ConnectForm onConnected={onConnected} /></div>
    <div className="connect-alt">
      <Button variant="ghost" onClick={() => actions.switchSource('demo')}>Explore with demo data</Button>
      <p className="privacy"><Icon name="lock" size={16} />Your key is used once to get a short-lived token and is never stored. Your data stays on this device.</p>
    </div>
  </main>
}
