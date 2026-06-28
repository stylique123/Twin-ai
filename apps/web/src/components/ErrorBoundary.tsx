import { Component, type ReactNode } from 'react'

// App-wide safety net. Without this, any uncaught render error unmounts the whole
// React tree and the user sees a black screen. Here we catch it, keep the page
// chrome, and offer a one-tap recovery instead of a dead end.
// `resetKey` (e.g. the current route path) clears a caught error when it changes,
// so navigating away from a broken view recovers without a manual reload, while
// the boundary itself stays mounted so route transitions are never disrupted.
interface Props { children: ReactNode; resetKey?: string }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null })
    }
  }

  componentDidCatch(error: Error) {
    // Surface to the console for debugging; never crash silently.
    console.error('[ErrorBoundary] render error:', error)
  }

  render() {
    if (this.state.error) {
      return (
        <main className="grid min-h-[70vh] place-items-center px-5">
          <div className="glass max-w-md p-8 text-center">
            <p className="font-display text-2xl text-cream">Something hiccuped.</p>
            <p className="mt-2 text-sm text-sand">
              This view ran into an error. Your work is safe, reloading usually clears it.
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <button
                onClick={() => this.setState({ error: null })}
                className="btn-ghost"
              >
                Try again
              </button>
              <button
                onClick={() => { window.location.href = '/dashboard' }}
                className="btn-gradient"
              >
                Go to dashboard
              </button>
            </div>
          </div>
        </main>
      )
    }
    return this.props.children
  }
}
