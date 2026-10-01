/**
 * The arithmetic behind the track player's controls, kept apart from the
 * player so it can be tested without one.
 */

/** Seconds as m:ss — the only format a song needs. */
export function clock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const total = Math.floor(seconds)
  const mins = Math.floor(total / 60)
  const secs = total % 60
  return `${mins}:${String(secs).padStart(2, '0')}`
}

/**
 * Where a skip lands: `delta` seconds from `position`, held inside the track.
 *
 * Forward stops just short of the end rather than on it: a player parked on
 * its last frame reads as finished, and the next press of play would restart
 * the song instead of playing the last few seconds somebody skipped to.
 */
export function skipTarget(position: number, duration: number, delta: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0
  const from = Number.isFinite(position) ? position : 0
  return Math.min(Math.max(0, duration - 0.5), Math.max(0, from + delta))
}

/**
 * How far along the bar a finger is, from 0 to 1.
 *
 * Worked from page coordinates and the bar's left edge, not from the offset
 * within whatever element is under the finger: once a drag leaves the bar —
 * as a thumb sliding to the very end always does — that element is something
 * else, and its offsets mean nothing here.
 */
export function fractionAt(pageX: number, barLeft: number, barWidth: number): number {
  if (!(barWidth > 0)) return 0
  return Math.min(1, Math.max(0, (pageX - barLeft) / barWidth))
}
