import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Gamepad2,
  Keyboard,
  MonitorDown,
  Play,
  PowerOff,
  RefreshCw,
  Volume2,
} from 'lucide-react'
import { Card, CardHeader } from './Card'
import { ShortcutInput } from './ShortcutInput'
import { useTracker } from '../state/tracker'
import { useDesktop } from '../state/desktop'
import { useToast } from '../state/toast'
import { defaultHotkeys, hotkeyActions, hotkeyLabels } from '../lib/storage'
import { appVersion, formatAccelerator } from '../desktop/bridge'
import { storageLocation } from '../lib/persistence'
import type { HotkeyAction } from '../types'

export function DesktopSettings() {
  const { desktopSettings, updateDesktopSettings, settings, updateSettings } = useTracker()
  const { results, applying, reapply, autostartActive, setAutostartEnabled, testSound } = useDesktop()
  const { push } = useToast()
  const [version, setVersion] = useState('')
  const [dataPath, setDataPath] = useState('')

  useEffect(() => {
    void appVersion().then(setVersion)
    void storageLocation().then(setDataPath)
  }, [])

  const { hotkeys } = desktopSettings

  /** Which other action, if any, already owns this combination. */
  const conflictWith = (action: HotkeyAction): string | null => {
    const mine = hotkeys[action].accelerator.toLowerCase()
    const other = hotkeyActions.find(
      (a) => a !== action && hotkeys[a].accelerator.toLowerCase() === mine,
    )
    return other ? hotkeyLabels[other] : null
  }

  const resultFor = (action: HotkeyAction) => results.find((r) => r.action === action)

  const setAccelerator = (action: HotkeyAction, accelerator: string) => {
    updateDesktopSettings({
      hotkeys: { ...hotkeys, [action]: { ...hotkeys[action], accelerator } },
    })
  }

  const setEnabled = (action: HotkeyAction, enabled: boolean) => {
    updateDesktopSettings({
      hotkeys: { ...hotkeys, [action]: { ...hotkeys[action], enabled } },
    })
  }

  const registeredCount = results.filter((r) => r.registered).length
  const failed = results.filter((r) => !r.registered && r.error)

  return (
    <>
      {/* ------------------- global shortcuts ------------------- */}
      <Card className="xl:col-span-2">
        <CardHeader
          title="Global keyboard shortcuts"
          subtitle="Work while Fortnite is in the foreground, even with this window hidden"
          icon={<Keyboard size={18} />}
          action={
            <button
              type="button"
              className="btn btn-ghost px-3 py-1.5 text-xs"
              onClick={() => void reapply()}
              disabled={applying}
            >
              <RefreshCw size={14} className={applying ? 'animate-spin' : ''} />
              {applying ? 'Registering…' : 'Re-register'}
            </button>
          }
        />

        <div className="space-y-4 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4 rounded-2xl border border-line bg-surface-2 p-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">Global shortcuts</p>
              <p className="mt-0.5 text-xs text-muted">
                {desktopSettings.globalShortcuts
                  ? `${registeredCount} of ${results.length || hotkeyActions.length} registered with Windows.`
                  : 'Switched off — no combinations are reserved from other apps.'}
              </p>
            </div>
            <Switch
              label="Global shortcuts"
              checked={desktopSettings.globalShortcuts}
              onChange={(v) => updateDesktopSettings({ globalShortcuts: v })}
            />
          </div>

          {failed.length > 0 ? (
            <div className="rounded-2xl border border-danger/40 bg-danger/10 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-danger">
                <AlertTriangle size={16} /> Windows refused{' '}
                {failed.length === 1 ? 'a shortcut' : `${failed.length} shortcuts`}
              </p>
              <ul className="mt-2 space-y-1 text-sm text-muted">
                {failed.map((r) => (
                  <li key={r.action}>
                    <strong className="text-ink">{hotkeyLabels[r.action]}</strong> —{' '}
                    {formatAccelerator(r.accelerator)}: {r.error}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-faint">
                Another application already owns the combination. Pick a different one below, then
                press Re-register.
              </p>
            </div>
          ) : null}

          <ul className="divide-y divide-[var(--border)]">
            {hotkeyActions.map((action) => {
              const result = resultFor(action)
              const conflict = conflictWith(action)
              const binding = hotkeys[action]
              const active = desktopSettings.globalShortcuts && binding.enabled
              return (
                <li key={action} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">{hotkeyLabels[action]}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs">
                      {!active ? (
                        <span className="text-faint">Disabled</span>
                      ) : result?.registered ? (
                        <span className="inline-flex items-center gap-1 text-success">
                          <CheckCircle2 size={12} /> Registered
                        </span>
                      ) : result ? (
                        <span className="inline-flex items-center gap-1 text-danger">
                          <AlertTriangle size={12} /> Not registered
                        </span>
                      ) : (
                        <span className="text-faint">Waiting for Windows…</span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <ShortcutInput
                      value={binding.accelerator}
                      disabled={!binding.enabled}
                      conflict={conflict}
                      onChange={(accelerator) => setAccelerator(action, accelerator)}
                      onReset={() => setAccelerator(action, defaultHotkeys()[action].accelerator)}
                    />
                    <Switch
                      label={`Enable ${hotkeyLabels[action]}`}
                      checked={binding.enabled}
                      onChange={(v) => setEnabled(action, v)}
                    />
                  </div>
                </li>
              )
            })}
          </ul>

          <p className="text-xs leading-relaxed text-faint">
            Shortcuts are plain Windows hotkeys. Nothing is read from or sent to Fortnite — the app
            only reacts to keys you press yourself.
          </p>
        </div>
      </Card>

      {/* ------------------- sound ------------------- */}
      <Card>
        <CardHeader
          title="Sound feedback"
          subtitle="Bundled with the app, no internet needed"
          icon={<Volume2 size={18} />}
        />
        <div className="space-y-5 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">Confirmation sound</p>
              <p className="mt-0.5 text-xs text-muted">
                Plays only after the counter really changed, including while minimised.
              </p>
            </div>
            <Switch
              label="Confirmation sound"
              checked={settings.sound}
              onChange={(v) => updateSettings({ sound: v })}
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="label" htmlFor="volume">
                Volume
              </label>
              <span className="tabular text-xs font-semibold text-muted">
                {Math.round(desktopSettings.soundVolume * 100)}%
              </span>
            </div>
            <input
              id="volume"
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round(desktopSettings.soundVolume * 100)}
              onChange={(e) =>
                updateDesktopSettings({ soundVolume: Number(e.target.value) / 100 })
              }
              disabled={!settings.sound}
              className="mt-2 w-full accent-[var(--accent)] disabled:opacity-50"
            />
          </div>

          <button
            type="button"
            className="btn"
            onClick={() => {
              if (!settings.sound) {
                push('Switch the confirmation sound on first.', 'info')
                return
              }
              testSound()
            }}
          >
            <Play size={16} /> Test sound
          </button>
        </div>
      </Card>

      {/* ------------------- windows behaviour ------------------- */}
      <Card>
        <CardHeader
          title="Windows behaviour"
          subtitle="Tray, start-up and gaming mode"
          icon={<MonitorDown size={18} />}
        />
        <div className="space-y-5 p-5 sm:p-6">
          <Row
            icon={<MonitorDown size={16} />}
            title="Close to system tray"
            description="Closing the window hides it and keeps counting. Quit from the tray menu to exit fully."
            checked={desktopSettings.minimizeToTray}
            onChange={(v) => updateDesktopSettings({ minimizeToTray: v })}
          />
          <Row
            icon={<PowerOff size={16} />}
            title="Start with Windows"
            description={
              autostartActive
                ? 'Registered with Windows start-up.'
                : 'The app will not launch automatically at sign-in.'
            }
            checked={autostartActive}
            onChange={(v) => void setAutostartEnabled(v)}
          />
          <Row
            icon={<Gamepad2 size={16} />}
            title="Gaming mode"
            description="Keeps the tray icon, shortcuts and sound alive while the window is hidden."
            checked={desktopSettings.gamingMode}
            onChange={(v) => updateDesktopSettings({ gamingMode: v })}
          />

          <div className="hairline" />

          <dl className="grid grid-cols-1 gap-3 text-xs">
            <div>
              <dt className="label">Desktop version</dt>
              <dd className="mt-0.5 font-semibold text-ink">{version || 'unknown'}</dd>
            </div>
            <div className="min-w-0">
              <dt className="label">Data file</dt>
              <dd className="mt-0.5 break-all font-semibold text-ink">{dataPath || '…'}</dd>
            </div>
          </dl>
        </div>
      </Card>
    </>
  )
}

function Row({
  icon,
  title,
  description,
  checked,
  onChange,
}: {
  icon: React.ReactNode
  title: string
  description: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border border-line bg-surface-2 text-faint">
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">{title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">{description}</p>
        </div>
      </div>
      <Switch label={title} checked={checked} onChange={onChange} />
    </div>
  )
}

export function Switch({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative mt-1 h-6 w-11 shrink-0 rounded-full border transition-colors ${
        checked ? 'border-transparent bg-accent' : 'border-line bg-surface-3'
      }`}
    >
      <span
        className={`absolute top-0.5 size-4.5 rounded-full bg-white shadow transition-all ${
          checked ? 'left-[1.4rem]' : 'left-0.5'
        }`}
      />
    </button>
  )
}
