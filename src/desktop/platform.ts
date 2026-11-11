/** True when the UI is running inside the Tauri desktop shell rather than a
 *  plain browser tab. Tauri injects this global before any app code runs, so
 *  the check is safe at module scope. */
export const isDesktop: boolean =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

/** Windows is the supported desktop target; the rest is best effort. */
export function isWindows(): boolean {
  if (typeof navigator === 'undefined') return false
  const data = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
  const platform = data?.platform ?? navigator.userAgent
  return /win/i.test(platform)
}
