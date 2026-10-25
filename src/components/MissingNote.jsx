import Icon from './Icon'

/** '3 of 30 days missing' — renders nothing when nothing is missing. */
export default function MissingNote({ missing, total, unit = 'days' }) {
  if (!missing) return null
  return <p className="missing"><Icon name="alert" size={14} />{missing} of {total} {unit} missing</p>
}
