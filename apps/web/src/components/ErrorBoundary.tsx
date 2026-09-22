import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Last line of defence. Without it, any render-time throw white-screens the
 * whole app with no indication of what happened — which is precisely what a
 * malformed transcript used to cause.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled render error:', error, info.componentStack)
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="flex min-h-screen items-center justify-center bg-lavender p-6">
        <div
          role="alert"
          className="max-w-md rounded-[18px] border border-black/[0.06] bg-white p-6 shadow-card"
        >
          <h1 className="text-[17px] font-extrabold tracking-tight text-ink">
            Something broke while rendering
          </h1>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">
            The interface hit an unexpected error. The details are in the browser console.
          </p>
          <pre className="mt-3 overflow-x-auto rounded-[12px] bg-[#fbfaf6] p-3 font-mono text-[11px] text-ink/70">
            {error.message}
          </pre>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="mt-4 rounded-full bg-ink px-4 py-2 text-[12px] font-semibold text-white transition hover:bg-ink/85"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }
}
