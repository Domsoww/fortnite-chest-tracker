import { Gem } from 'lucide-react'
import { useTreasure } from '../state/treasure'
import { useTracker } from '../state/tracker'
import { formatCountdown } from '../lib/prague'

/** The live marker shown next to the counter. It appears only while a window
 *  is actually running, and only mentions a multiplier Epic confirmed. */
export function TreasureBadge() {
  const { treasureSettings } = useTracker()
  const { state, now } = useTreasure()

  if (!treasureSettings.enabled || !state.current) return null

  const w = state.current
  const remaining = Math.max(0, w.endsAt - now)
  const showMultiplier = w.multiplier !== null && w.multiplierConfirmed

  return (
    <span className="treasure-chip" title={`Treasure Hour ends in ${formatCountdown(remaining)}`}>
      <Gem size={13} className="shrink-0" />
      <span className="font-bold tracking-wide">TREASURE HOUR</span>
      {showMultiplier ? <span className="tabular opacity-90">{w.multiplier}× token</span> : null}
      <span className="tabular opacity-80">{formatCountdown(remaining)} left</span>
    </span>
  )
}
