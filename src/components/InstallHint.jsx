import { setPrefs, usePrefs } from '../lib/prefs'
import Icon from './Icon'

export const isIosSafari = () => /iP(hone|ad|od)/.test(navigator.userAgent) && !/CriOS|FxiOS/.test(navigator.userAgent)
export const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true

/** Dismissible 'Add to Home Screen' card — only on iOS Safari outside the installed app. */
export default function InstallHint() {
  const prefs = usePrefs()
  if (prefs.installDismissed || isStandalone() || !isIosSafari()) return null
  return <div className="install" role="note">
    <div className="install-icon"><Icon name="share" size={20} /></div>
    <p><strong>Install on your iPhone</strong><span>Tap Share, then Add to Home Screen. It opens full screen and works offline.</span></p>
    <button type="button" className="icon-btn" aria-label="Dismiss" onClick={() => setPrefs({ installDismissed: true })}><Icon name="x" size={18} /></button>
  </div>
}
