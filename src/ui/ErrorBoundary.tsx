import { Component, type ReactNode, type ErrorInfo } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Last line of defence. A thrown render error should show a calm, honest
 * message rather than a blank page — this is a gift, and a white screen on the
 * day would be the worst possible failure.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[The Cheetah & The Peach] render error:', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="webgl-error">
        <div className="webgl-error__inner">
          <h1>Something came loose.</h1>
          <p>
            The journey hit an unexpected snag. Reloading almost always fixes it, and your
            progress is saved.
          </p>
          <p style={{ fontSize: '0.78rem', opacity: 0.5 }}>{error.message}</p>
          <button type="button" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </div>
    )
  }
}
