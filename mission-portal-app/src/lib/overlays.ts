/**
 * How many full-screen overlays are open — a chord sheet being played, a
 * form — so that something wanting to take the person elsewhere (Miriam,
 * with an answer) can tell it would be pulling them out of one, and offer
 * instead. Counted by FullScreenOverlay.
 */
let open = 0

/** Counts one as open; returns its closing. */
export function overlayOpened(): () => void {
  open++
  let closed = false
  return () => {
    if (closed) return
    closed = true
    open--
  }
}

export function anyOverlayOpen(): boolean {
  return open > 0
}
