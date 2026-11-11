/** A short synthesised "chest opened" blip. Generated with WebAudio so the
 *  app ships no audio assets and needs no network. */
let ctx: AudioContext | null = null

type AudioCtor = typeof AudioContext

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor: AudioCtor | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext
  if (!Ctor) return null
  try {
    if (!ctx) ctx = new Ctor()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

export function playChestSound(): void {
  const audio = getContext()
  if (!audio) return
  try {
    const now = audio.currentTime
    const gain = audio.createGain()
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22)
    gain.connect(audio.destination)

    for (const [freq, offset] of [
      [880, 0],
      [1320, 0.06],
    ] as const) {
      const osc = audio.createOscillator()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(freq, now + offset)
      osc.connect(gain)
      osc.start(now + offset)
      osc.stop(now + offset + 0.16)
    }
  } catch {
    /* audio is a nicety, never a failure */
  }
}
