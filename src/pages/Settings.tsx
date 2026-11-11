import { useRef, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Download,
  Eraser,
  FileJson,
  Info,
  Keyboard,
  Palette,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  Upload,
  Volume2,
} from 'lucide-react'
import { Card, CardHeader } from '../components/Card'
import { PageHeader } from '../components/PageHeader'
import type { ConfirmOptions } from '../components/ConfirmDialog'
import { useTracker } from '../state/tracker'
import { useToast } from '../state/toast'
import { buildExport, exportFileName, validateAppData } from '../lib/storage'
import { sessionCount } from '../lib/stats'
import { formatNumber } from '../lib/format'
import type { AccentName, AppData, ThemeMode } from '../types'

const accents: { name: AccentName; label: string; from: string; to: string }[] = [
  { name: 'violet', label: 'Violet', from: '#8b5cf6', to: '#3b82f6' },
  { name: 'azure', label: 'Azure', from: '#3b82f6', to: '#22d3ee' },
  { name: 'gold', label: 'Gold', from: '#f59e0b', to: '#a855f7' },
  { name: 'mint', label: 'Mint', from: '#10b981', to: '#3b82f6' },
]

interface PendingImport {
  data: AppData
  warnings: string[]
  fileName: string
}

export function Settings({ confirm }: { confirm: (options: ConfirmOptions) => Promise<boolean> }) {
  const {
    data,
    settings,
    updateSettings,
    replaceData,
    mergeImport,
    deleteAllSessions,
    resetEverything,
    storageStatus,
  } = useTracker()
  const { push } = useToast()
  const fileInput = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<PendingImport | null>(null)
  const [importErrors, setImportErrors] = useState<string[]>([])
  const [goalDraft, setGoalDraft] = useState(String(settings.dailyGoal))

  const totalChests = data.sessions.reduce((sum, s) => sum + sessionCount(s), 0)

  /* ---------------- export ---------------- */

  const handleExport = () => {
    try {
      const payload = JSON.stringify(buildExport(data), null, 2)
      const blob = new Blob([payload], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = exportFileName()
      document.body.appendChild(link)
      link.click()
      link.remove()
      // Revoke on the next tick so Safari has time to start the download.
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      push('Export file downloaded.', 'success')
    } catch {
      push('The export could not be created in this browser.', 'danger')
    }
  }

  /* ---------------- import ---------------- */

  const handleFile = async (file: File) => {
    setPending(null)
    setImportErrors([])

    if (file.size > 20 * 1024 * 1024) {
      setImportErrors(['That file is larger than 20 MB, which is far too big to be tracker data.'])
      return
    }

    let text: string
    try {
      text = await file.text()
    } catch {
      setImportErrors(['The file could not be read.'])
      return
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      setImportErrors(['This is not valid JSON. Pick a file exported from Chest Tracker.'])
      return
    }

    const result = validateAppData(parsed)
    if (!result.ok || !result.data) {
      setImportErrors(result.errors.length ? result.errors : ['The file is not valid tracker data.'])
      return
    }
    if (result.data.sessions.length === 0) {
      setImportErrors(['The file is valid but contains no sessions.'])
      return
    }
    setPending({ data: result.data, warnings: result.warnings, fileName: file.name })
  }

  const applyImport = async (mode: 'merge' | 'replace') => {
    if (!pending) return
    const incoming = pending.data
    const incomingChests = incoming.sessions.reduce((sum, s) => sum + sessionCount(s), 0)

    if (mode === 'replace') {
      const ok = await confirm({
        title: 'Replace all local data?',
        message: `Your ${formatNumber(data.sessions.length)} stored ${
          data.sessions.length === 1 ? 'session' : 'sessions'
        } will be deleted and replaced by ${formatNumber(incoming.sessions.length)} imported ${
          incoming.sessions.length === 1 ? 'session' : 'sessions'
        }. This cannot be undone.`,
        confirmLabel: 'Replace data',
      })
      if (!ok) return
      replaceData({ ...incoming, settings: { ...incoming.settings } })
      push(`Imported ${formatNumber(incomingChests)} chests, replacing local data.`, 'success')
    } else {
      mergeImport(incoming)
      push(`Merged ${formatNumber(incoming.sessions.length)} sessions into your history.`, 'success')
    }
    setPending(null)
    if (fileInput.current) fileInput.current.value = ''
  }

  /* ---------------- destructive ---------------- */

  const handleDeleteSessions = async () => {
    const ok = await confirm({
      title: 'Delete all sessions?',
      message: `All ${formatNumber(data.sessions.length)} ${
        data.sessions.length === 1 ? 'session' : 'sessions'
      } and ${formatNumber(
        totalChests,
      )} recorded chests are permanently removed. Your settings are kept. Export your data first if you want a backup.`,
      confirmLabel: 'Delete everything',
    })
    if (!ok) return
    deleteAllSessions()
    push('All sessions deleted.', 'danger')
  }

  const handleFactoryReset = async () => {
    const ok = await confirm({
      title: 'Reset the whole app?',
      message:
        'Sessions, statistics and settings are all deleted from this device and the app returns to its initial state. This cannot be undone.',
      confirmLabel: 'Reset app',
    })
    if (!ok) return
    resetEverything()
    setGoalDraft('50')
    push('App reset to defaults.', 'danger')
  }

  const commitGoal = () => {
    const parsed = Number.parseInt(goalDraft, 10)
    const value = Number.isFinite(parsed) ? Math.min(10_000, Math.max(0, parsed)) : 0
    setGoalDraft(String(value))
    updateSettings({ dailyGoal: value })
  }

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Data & preferences"
        description="Your data never leaves this device. Export it whenever you want a backup or want to move it to another browser."
      />

      {storageStatus !== 'ok' ? (
        <Card className="mb-5 border-danger/40 p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="mt-0.5 shrink-0 text-danger" />
            <div>
              <h2 className="font-semibold text-ink">
                {storageStatus === 'unavailable'
                  ? 'Local storage is not available'
                  : 'Local storage is full'}
              </h2>
              <p className="mt-1 text-sm text-muted">
                {storageStatus === 'unavailable'
                  ? 'Your browser is blocking local storage, which often happens in private windows. The app still works, but nothing will be saved when you close the tab.'
                  : 'The browser refused the last save because its storage quota is full. Export your data and delete old sessions to free space.'}
              </p>
            </div>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-2">
        {/* ------------------------- Data ------------------------- */}
        <Card>
          <CardHeader
            title="Data management"
            subtitle="Backup, restore and clean up"
            icon={<Database size={18} />}
          />
          <div className="space-y-4 p-5 sm:p-6">
            <div className="rounded-2xl border border-line bg-surface-2 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-ink">Stored on this device</p>
                  <p className="tabular mt-0.5 text-sm text-muted">
                    {formatNumber(data.sessions.length)}{' '}
                    {data.sessions.length === 1 ? 'session' : 'sessions'} ·{' '}
                    {formatNumber(totalChests)} chests
                  </p>
                </div>
                <span className="chip">
                  <ShieldCheck size={14} className="text-success" />
                  Local only
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-primary" onClick={handleExport}>
                <Download size={16} /> Export JSON
              </button>
              <button type="button" className="btn" onClick={() => fileInput.current?.click()}>
                <Upload size={16} /> Import JSON
              </button>
              <input
                ref={fileInput}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void handleFile(file)
                }}
              />
            </div>

            {importErrors.length > 0 ? (
              <div className="rounded-2xl border border-danger/40 bg-danger/10 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-danger">
                  <AlertTriangle size={16} /> Import failed
                </p>
                <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-muted">
                  {importErrors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {pending ? (
              <div className="animate-pop rounded-2xl border border-line-strong bg-surface-2 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <FileJson size={16} className="text-accent" /> {pending.fileName}
                </p>
                <p className="mt-1.5 text-sm text-muted">
                  Valid tracker data: {formatNumber(pending.data.sessions.length)}{' '}
                  {pending.data.sessions.length === 1 ? 'session' : 'sessions'} ·{' '}
                  {formatNumber(
                    pending.data.sessions.reduce((sum, s) => sum + sessionCount(s), 0),
                  )}{' '}
                  chests
                </p>
                {pending.warnings.length > 0 ? (
                  <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-gold">
                    {pending.warnings.slice(0, 6).map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-success">
                    <CheckCircle2 size={14} /> No problems found in this file.
                  </p>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" className="btn btn-primary" onClick={() => void applyImport('merge')}>
                    Merge into my data
                  </button>
                  <button type="button" className="btn btn-danger" onClick={() => void applyImport('replace')}>
                    Replace my data
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => {
                      setPending(null)
                      if (fileInput.current) fileInput.current.value = ''
                    }}
                  >
                    Cancel
                  </button>
                </div>
                <p className="mt-2 text-xs text-faint">
                  Merging keeps everything you already have and skips sessions that are already
                  there.
                </p>
              </div>
            ) : null}

            <div className="hairline" />

            <div className="space-y-2">
              <span className="label">Danger zone</span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={handleDeleteSessions}
                  disabled={data.sessions.length === 0}
                >
                  <Trash2 size={16} /> Delete all sessions
                </button>
                <button type="button" className="btn btn-danger" onClick={handleFactoryReset}>
                  <Eraser size={16} /> Reset app
                </button>
              </div>
            </div>
          </div>
        </Card>

        {/* ---------------------- Appearance ---------------------- */}
        <Card>
          <CardHeader title="Appearance" subtitle="Theme and accent colour" icon={<Palette size={18} />} />
          <div className="space-y-5 p-5 sm:p-6">
            <div>
              <span className="label">Theme</span>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {(['dark', 'light'] as ThemeMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => updateSettings({ theme: mode })}
                    aria-pressed={settings.theme === mode}
                    className={`rounded-xl border px-4 py-3 text-sm font-semibold capitalize transition-colors ${
                      settings.theme === mode
                        ? 'border-accent bg-surface-3 text-ink'
                        : 'border-line bg-surface-2 text-muted hover:text-ink'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="label">Accent</span>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {accents.map((a) => (
                  <button
                    key={a.name}
                    type="button"
                    onClick={() => updateSettings({ accent: a.name })}
                    aria-pressed={settings.accent === a.name}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold transition-colors ${
                      settings.accent === a.name
                        ? 'border-accent bg-surface-3 text-ink'
                        : 'border-line bg-surface-2 text-muted hover:text-ink'
                    }`}
                  >
                    <span
                      className="size-4 shrink-0 rounded-full"
                      style={{ backgroundImage: `linear-gradient(135deg, ${a.from}, ${a.to})` }}
                    />
                    {a.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="hairline" />

            <Toggle
              icon={<Sparkles size={16} />}
              label="Animations"
              description="Counter pops, rising +1 labels and card transitions."
              checked={settings.animations}
              onChange={(v) => updateSettings({ animations: v })}
            />
            <Toggle
              icon={<Volume2 size={16} />}
              label="Chest sound"
              description="A short synthesised blip on each chest. No audio files are downloaded."
              checked={settings.sound}
              onChange={(v) => updateSettings({ sound: v })}
            />
          </div>
        </Card>

        {/* ---------------------- Counting ---------------------- */}
        <Card>
          <CardHeader
            title="Counting"
            subtitle="How the counter behaves"
            icon={<Target size={18} />}
          />
          <div className="space-y-5 p-5 sm:p-6">
            <div>
              <label className="label" htmlFor="daily-goal">
                Daily goal
              </label>
              <div className="mt-2 flex items-center gap-2">
                <input
                  id="daily-goal"
                  className="input tabular max-w-32"
                  value={goalDraft}
                  inputMode="numeric"
                  onChange={(e) => setGoalDraft(e.target.value.replace(/[^\d]/g, ''))}
                  onBlur={commitGoal}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitGoal()
                  }}
                />
                <span className="text-sm text-muted">chests per day</span>
              </div>
              <p className="mt-1.5 text-xs text-faint">
                Shown as the progress ring on the dashboard. Set it to 0 to hide the ring.
              </p>
            </div>

            <div className="hairline" />

            <Toggle
              icon={<Keyboard size={16} />}
              label="Keyboard shortcuts"
              description="Space or Enter registers a chest, Ctrl/Cmd+Z undoes the last action."
              checked={settings.hotkeys}
              onChange={(v) => updateSettings({ hotkeys: v })}
            />
            <Toggle
              icon={<AlertTriangle size={16} />}
              label="Confirm before resetting"
              description="Ask for confirmation before clearing the running counter."
              checked={settings.confirmReset}
              onChange={(v) => updateSettings({ confirmReset: v })}
            />
          </div>
        </Card>

        {/* ---------------------- About ---------------------- */}
        <Card>
          <CardHeader title="About" subtitle="How this app treats your data" icon={<Info size={18} />} />
          <div className="space-y-4 p-5 text-sm leading-relaxed text-muted sm:p-6">
            <p className="flex items-start gap-2.5">
              <ShieldCheck size={18} className="mt-0.5 shrink-0 text-success" />
              <span>
                Chest Tracker runs entirely in your browser. There is no account, no server and no
                analytics — your sessions are saved in this browser's local storage and are never
                sent anywhere.
              </span>
            </p>
            <p className="flex items-start gap-2.5">
              <Database size={18} className="mt-0.5 shrink-0 text-accent" />
              <span>
                Because the data lives in this browser, clearing site data or switching browsers
                starts you from scratch. Use <strong className="text-ink">Export JSON</strong> for
                backups.
              </span>
            </p>
            <p className="flex items-start gap-2.5">
              <Info size={18} className="mt-0.5 shrink-0 text-faint" />
              <span>
                This is an unofficial fan-made tool. It is not affiliated with, endorsed by or
                sponsored by Epic Games, and it contains no game assets — every graphic here is
                original CSS and SVG.
              </span>
            </p>
            <div className="hairline" />
            <dl className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <dt className="label">Version</dt>
                <dd className="mt-0.5 font-semibold text-ink">1.0.0</dd>
              </div>
              <div>
                <dt className="label">Data format</dt>
                <dd className="mt-0.5 font-semibold text-ink">v{data.version}</dd>
              </div>
              <div>
                <dt className="label">Storage</dt>
                <dd className="mt-0.5 font-semibold text-ink">
                  {storageStatus === 'ok' ? 'localStorage — active' : 'unavailable'}
                </dd>
              </div>
              <div>
                <dt className="label">License</dt>
                <dd className="mt-0.5 font-semibold text-ink">MIT</dd>
              </div>
            </dl>
          </div>
        </Card>
      </div>
    </>
  )
}

function Toggle({
  icon,
  label,
  description,
  checked,
  onChange,
}: {
  icon: React.ReactNode
  label: string
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
          <p className="text-sm font-semibold text-ink">{label}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">{description}</p>
        </div>
      </div>
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
    </div>
  )
}
