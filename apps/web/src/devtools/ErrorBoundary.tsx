import { Component, type ErrorInfo, type ReactNode } from 'react'
import { logEvent } from './log'

interface Props {
  /** Shown in the message, e.g. the app's name. */
  name: string
  children: ReactNode
}

/** Keeps one broken app from blanking all of NEXUS, and shows what went wrong. */
export class ErrorBoundary extends Component<Props, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logEvent('system', `${this.props.name} liep vast: ${error.message}`, true)
    console.error(error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div role="alert" className="space-y-3 p-4 text-sm">
        <p className="font-medium">{this.props.name} liep vast.</p>
        <pre className="max-h-48 overflow-auto rounded-md bg-nx-surface-2 p-2 font-mono text-xs whitespace-pre-wrap">
          {error.name}: {error.message}
          {error.stack ? `\n${error.stack.split('\n').slice(1, 6).join('\n')}` : ''}
        </pre>
        <button
          type="button"
          className="rounded-lg border border-nx-border px-3 py-1.5 hover:bg-nx-surface-2"
          onClick={() => this.setState({ error: null })}
        >
          Opnieuw proberen
        </button>
      </div>
    )
  }
}
