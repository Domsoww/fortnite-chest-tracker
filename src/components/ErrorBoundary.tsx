import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { STORAGE_KEY } from '../lib/storage'

interface State {
  error: Error | null
}

/** Last line of defence: a render crash must never leave a blank page or
 *  silently destroy the player's saved sessions. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Chest Tracker crashed:', error, info.componentStack)
  }

  private downloadBackup = () => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY) ?? '{}'
      const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url
      link.download = 'chest-tracker-recovery.json'
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
      /* nothing else we can do here */
    }
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="grid min-h-dvh place-items-center p-6">
        <div className="card max-w-lg p-7">
          <h1 className="text-xl font-bold text-ink">Something went wrong</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            The app hit an unexpected error while rendering. Your saved sessions are untouched in
            this browser's local storage — reloading the page normally fixes it.
          </p>
          <pre className="mt-4 max-h-40 overflow-auto rounded-xl border border-line bg-surface-2 p-3 text-xs text-muted">
            {this.state.error.message}
          </pre>
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
              Reload the app
            </button>
            <button type="button" className="btn" onClick={this.downloadBackup}>
              Download a data backup
            </button>
          </div>
        </div>
      </div>
    )
  }
}
