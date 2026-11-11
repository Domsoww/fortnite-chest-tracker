import chestSoundUrl from '../assets/chest.wav'
import blockedSoundUrl from '../assets/blocked.wav'

/** Short confirmation sounds. Both files are bundled with the app and were
 *  generated for this project, so playback never needs the network. */
export type SoundName = 'chest' | 'blocked'

const urls: Record<SoundName, string> = {
  chest: chestSoundUrl,
  blocked: blockedSoundUrl,
}

const pools = new Map<SoundName, HTMLAudioElement[]>()
const POOL_SIZE = 4

function pool(name: SoundName): HTMLAudioElement[] {
  let existing = pools.get(name)
  if (!existing) {
    // A small pool lets rapid presses overlap instead of cutting each other off.
    existing = Array.from({ length: POOL_SIZE }, () => {
      const audio = new Audio(urls[name])
      audio.preload = 'auto'
      return audio
    })
    pools.set(name, existing)
  }
  return existing
}

/** Warm the decoder so the first chest of a session is not late. */
export function primeSounds(): void {
  if (typeof Audio === 'undefined') return
  try {
    for (const name of Object.keys(urls) as SoundName[]) {
      for (const audio of pool(name)) audio.load()
    }
  } catch {
    /* audio is a nicety, never a failure */
  }
}

/** Play one of the bundled sounds. `volume` is 0–1; 0 plays nothing. */
export function playSound(name: SoundName, volume = 0.6): void {
  if (typeof Audio === 'undefined') return
  const level = Math.min(1, Math.max(0, volume))
  if (level === 0) return
  try {
    const voices = pool(name)
    const free = voices.find((a) => a.paused || a.ended) ?? voices[0]
    free.volume = level
    free.currentTime = 0
    const played = free.play()
    if (played && typeof played.catch === 'function') {
      // Autoplay policies can reject before the first user gesture.
      played.catch(() => undefined)
    }
  } catch {
    /* audio is a nicety, never a failure */
  }
}

export function playChestSound(volume = 0.6): void {
  playSound('chest', volume)
}

export function playBlockedSound(volume = 0.6): void {
  playSound('blocked', volume * 0.8)
}
