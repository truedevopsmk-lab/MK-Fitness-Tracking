import { Component } from 'react'
import Button from './Button'
import Icon from './Icon'

/** Catches render errors in a subtree. Pass `resetKey` (e.g. the route path) to recover on navigation. */
export default class ErrorBoundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(error) { return { error } }
  componentDidUpdate(prev) { if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null }) }
  componentDidCatch(error, info) { console.error('Page crashed', error, info?.componentStack) }
  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return <div className="card err-card" role="alert">
      <div className="empty-icon err-icon"><Icon name="alert" size={26} /></div>
      <h2 className="empty-title">This page hit a problem</h2>
      <p className="empty-body">Your data is safe on this device. Reload the page, or go back to Today.</p>
      <pre className="err-detail">{String(error?.message || error)}</pre>
      <div className="empty-action row-gap"><Button variant="primary" onClick={() => location.reload()}>Reload</Button><Button href="#/">Go to Today</Button></div>
    </div>
  }
}
