import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { TrackerProvider } from './state/tracker'
import { DesktopProvider } from './state/desktop'
import { TreasureProvider } from './state/treasure'
import { ToastProvider } from './state/toast'
import './index.css'

const container = document.getElementById('root')
if (!container) throw new Error('Root element #root is missing from index.html')

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <TrackerProvider>
          <TreasureProvider>
            <DesktopProvider>
              <App />
            </DesktopProvider>
          </TreasureProvider>
        </TrackerProvider>
      </ToastProvider>
    </ErrorBoundary>
  </StrictMode>,
)
