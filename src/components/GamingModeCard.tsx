import { AlertTriangle, CheckCircle2, Gamepad2, MinusSquare } from 'lucide-react'
import { Card, CardHeader } from './Card'
import { useTracker } from '../state/tracker'
import { useDesktop } from '../state/desktop'
import { hotkeyActions, hotkeyLabels } from '../lib/storage'
import { formatAccelerator, showMainWindow } from '../desktop/bridge'

/** Desktop-only panel: what the global shortcuts are doing right now, so the
 *  player can confirm the setup before alt-tabbing into a match. */
export function GamingModeCard({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { desktopSettings, activeSession, paused } = useTracker()
  const { results, applying } = useDesktop()

  const live = desktopSettings.globalShortcuts
  const registered = results.filter((r) => r.registered).length
  const expected = hotkeyActions.filter((a) => desktopSettings.hotkeys[a].enabled).length
  const allGood = live && expected > 0 && registered === expected

  return (
    <Card hover>
      <CardHeader
        title="Gaming mode"
        subtitle={
          activeSession
            ? paused
              ? 'Session paused — shortcuts will not count'
              : 'Counting while you play'
            : 'Start a session, then alt-tab into the game'
        }
        icon={<Gamepad2 size={18} />}
        action={
          <span
            className={`chip ${
              applying
                ? ''
                : allGood
                  ? 'border-success/40 text-success'
                  : live
                    ? 'border-danger/40 text-danger'
                    : ''
            }`}
          >
            {applying ? (
              'Registering…'
            ) : allGood ? (
              <>
                <CheckCircle2 size={13} /> {registered} active
              </>
            ) : live ? (
              <>
                <AlertTriangle size={13} /> {registered}/{expected} active
              </>
            ) : (
              'Shortcuts off'
            )}
          </span>
        }
      />

      <ul className="space-y-2 px-5 pb-4 pt-4 sm:px-6">
        {hotkeyActions.map((action) => {
          const binding = desktopSettings.hotkeys[action]
          const result = results.find((r) => r.action === action)
          const enabled = live && binding.enabled
          return (
            <li key={action} className="flex items-center justify-between gap-3 text-sm">
              <span className={enabled ? 'text-muted' : 'text-faint line-through'}>
                {hotkeyLabels[action]}
              </span>
              <kbd
                className={`tabular rounded-lg border px-2 py-1 text-xs font-semibold ${
                  !enabled
                    ? 'border-line bg-surface-2 text-faint'
                    : result?.registered
                      ? 'border-line-strong bg-surface-3 text-ink'
                      : 'border-danger/40 bg-danger/10 text-danger'
                }`}
              >
                {formatAccelerator(binding.accelerator)}
              </kbd>
            </li>
          )
        })}
      </ul>

      <div className="flex flex-wrap gap-2 px-5 pb-5 sm:px-6">
        <button type="button" className="btn flex-1" onClick={onOpenSettings}>
          Change shortcuts
        </button>
        {desktopSettings.minimizeToTray ? (
          <button
            type="button"
            className="btn"
            onClick={() => void hideToTray()}
            title="Hide the window and keep counting"
          >
            <MinusSquare size={16} /> Hide to tray
          </button>
        ) : null}
      </div>
    </Card>
  )
}

async function hideToTray() {
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    await getCurrentWindow().hide()
  } catch {
    // If hiding is not possible, at least keep the window usable.
    await showMainWindow()
  }
}
