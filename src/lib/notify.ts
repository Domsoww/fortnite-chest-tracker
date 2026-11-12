/** OS notifications, with an in-app toast as the guaranteed fallback.
 *
 *  Desktop uses the Tauri notification plugin, which hands the toast to
 *  Windows itself. The web build asks the browser, and only after the user
 *  has turned reminders on — never on page load. */

import { isDesktop } from '../desktop/platform'

export type NotifyPermission = 'granted' | 'denied' | 'unsupported' | 'default'

async function plugin() {
  return import('@tauri-apps/plugin-notification')
}

export async function notifyPermission(): Promise<NotifyPermission> {
  if (isDesktop) {
    try {
      const { isPermissionGranted } = await plugin()
      return (await isPermissionGranted()) ? 'granted' : 'default'
    } catch {
      return 'unsupported'
    }
  }
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission as NotifyPermission
}

/** Ask for permission. Returns what the user actually chose. */
export async function requestNotifyPermission(): Promise<NotifyPermission> {
  if (isDesktop) {
    try {
      const { isPermissionGranted, requestPermission } = await plugin()
      if (await isPermissionGranted()) return 'granted'
      return (await requestPermission()) === 'granted' ? 'granted' : 'denied'
    } catch {
      return 'unsupported'
    }
  }
  if (typeof Notification === 'undefined') return 'unsupported'
  if (Notification.permission === 'granted') return 'granted'
  if (Notification.permission === 'denied') return 'denied'
  try {
    return (await Notification.requestPermission()) as NotifyPermission
  } catch {
    return 'denied'
  }
}

/** Fire one notification. Returns false when the OS would not show it, so the
 *  caller can fall back to the in-app toast rather than assume it landed. */
export async function sendNotification(title: string, body: string): Promise<boolean> {
  if (isDesktop) {
    try {
      const { isPermissionGranted, requestPermission, sendNotification: send } = await plugin()
      let granted = await isPermissionGranted()
      if (!granted) granted = (await requestPermission()) === 'granted'
      if (!granted) return false
      send({ title, body })
      return true
    } catch {
      return false
    }
  }

  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false
  try {
    new Notification(title, { body })
    return true
  } catch {
    return false
  }
}
