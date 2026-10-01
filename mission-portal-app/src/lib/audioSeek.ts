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

/** The speeds a part is learned at: full, three quarters, half. */
export const RATES = [1, 0.75, 0.5] as const

/** The next speed along, round to full again after the slowest. */
export function nextRate(rate: number): number {
  const at = RATES.indexOf(rate as (typeof RATES)[number])
  return RATES[(at + 1) % RATES.length]
}

/** "1×", "0.75×", "0.5×". */
export function rateLabel(rate: number): string {
  return `${rate}×`
}

/**
 * A stretch of a track played over and over: from `start` to `end`, in
 * seconds. `end` is null between the two presses that mark it, when the
 * start is known and the end is not yet.
 */
export interface LoopRange {
  start: number
  end: number | null
}

/**
 * What one press of the loop button does, given where the track is.
 *
 * The first press marks the start. The second marks the end and the loop
 * begins — in whichever order the two points came, since somebody who
 * marked the start and then scrubbed backwards meant the stretch between
 * them. A second press within half a second of the first is taken as
 * changing their mind and clears it; a loop that short is not a loop. A
 * press with a loop running clears it.
 */
export function loopStep(loop: LoopRange | null, position: number): LoopRange | null {
  if (!loop) return { start: Math.max(0, position), end: null }
  if (loop.end !== null) return null
  if (Math.abs(position - loop.start) < 0.5) return null
  return { start: Math.min(loop.start, position), end: Math.max(loop.start, position) }
}

/** Where to go back to, if the track has reached the end of its loop. */
export function loopTarget(loop: LoopRange | null, position: number): number | null {
  if (!loop || loop.end === null) return null
  return position >= loop.end ? loop.start : null
}
