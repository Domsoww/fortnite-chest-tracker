import { lazy, Suspense, useEffect } from 'react'
import { ConfirmDialog } from './components/ConfirmDialog'
import { useConfirm } from './components/useConfirm'
import { AppShell } from './components/AppShell'
import { Toaster } from './components/Toaster'
import { Logo } from './components/Logo'
import { Dashboard } from './pages/Dashboard'
import { History } from './pages/History'
import { Settings } from './pages/Settings'
import { useHashRoute } from './lib/useHashRoute'
import { useTracker } from './state/tracker'
import { useToast } from './state/toast'

// The charting library is the heaviest dependency and is only needed here,
// so the Statistics page is fetched the first time it is opened.
const Statistics = lazy(() =>
  import('./pages/Statistics').then((m) => ({ default: m.Statistics })),
)

export function App() {
  const [route, navigate] = useHashRoute()
  const { confirm, dialogProps } = useConfirm()
  const { settings, loadWarnings, dismissLoadWarnings, storageStatus, hydrated } = useTracker()
  const { push } = useToast()

  // Theme, accent and motion preference live on <html> so CSS can own the rest.
  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = settings.theme
    root.dataset.accent = settings.accent
    root.dataset.motion = settings.animations ? 'on' : 'off'
  }, [settings.theme, settings.accent, settings.animations])

  // Surface anything that was repaired while loading saved data.
  useEffect(() => {
    if (loadWarnings.length === 0) return
    push(loadWarnings[0], 'warning')
    dismissLoadWarnings()
  }, [loadWarnings, push, dismissLoadWarnings])

  useEffect(() => {
    if (storageStatus === 'unavailable') {
      push('This browser blocks local storage, so nothing can be saved.', 'danger')
    } else if (storageStatus === 'quota-exceeded') {
      push('Storage is full — the last change could not be saved.', 'danger')
    }
  }, [storageStatus, push])

  // Saved data is read asynchronously on the desktop, so hold the UI for that
  // moment rather than flashing an empty dashboard over real statistics.
  if (!hydrated) return <Splash />

  return (
    <>
      <AppShell route={route} onNavigate={navigate}>
        <div key={route} className="animate-slide-up">
          {route === 'dashboard' ? <Dashboard confirm={confirm} onNavigate={navigate} /> : null}
          {route === 'history' ? <History confirm={confirm} /> : null}
          {route === 'statistics' ? (
            <Suspense fallback={<ChartsLoading />}>
              <Statistics />
            </Suspense>
          ) : null}
          {route === 'settings' ? <Settings confirm={confirm} /> : null}
        </div>
      </AppShell>
      <Toaster />
      <ConfirmDialog {...dialogProps} />
    </>
  )
}

function ChartsLoading() {
  return (
    <div className="card grid min-h-64 place-items-center p-10 text-sm text-muted">
      Loading charts…
    </div>
  )
}

function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <div className="flex flex-col items-center gap-3">
        <Logo size={48} />
        <p className="text-sm text-muted">Loading your sessions…</p>
      </div>
    </div>
  )
}
