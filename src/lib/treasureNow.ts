/** The Treasure Hour that is running right now, as a single shared value.
 *
 *  Counting happens in the tracker reducer and the schedule lives in its own
 *  provider; this tiny module lets a chest be stamped with the window it was
 *  opened in without either side having to know about the other. */

let currentWindowId: string | null = null

export function setActiveTreasureWindow(id: string | null): void {
  currentWindowId = id
}

export function activeTreasureWindow(): string | null {
  return currentWindowId
}
