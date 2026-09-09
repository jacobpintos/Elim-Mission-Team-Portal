/**
 * A service or worship event being streamed right now.
 *
 * The card an admin fills in stands on its own for a fixed window and then
 * disappears — there is no "end the stream" step to remember on a Sunday
 * afternoon, because forgetting it would leave a dead player on the front of
 * the app all week. Everything here is derived from two numbers, so the same
 * rules hold on a device, in the Firestore rules, and in the sweep that clears
 * old documents out.
 */

/** How long a stream card stands by default, in hours. */
export const DEFAULT_STREAM_HOURS = 6

/** The longest window an admin may set, so a typo cannot pin one up for a year. */
export const MAX_STREAM_HOURS = 24

export interface Livestream {
  id: string
  title: string
  youtubeUrl: string
  /** ms since epoch — when the card was posted. */
  createdAt: number
  /** ms since epoch — when it stops being shown. */
  expiresAt: number
  createdBy?: string
}

const HOUR_MS = 60 * 60 * 1000

/** When a card posted at `startMs` should come down. */
export function expiryFrom(startMs: number, hours: number = DEFAULT_STREAM_HOURS): number {
  const clamped = Math.min(Math.max(hours, 1), MAX_STREAM_HOURS)
  return startMs + clamped * HOUR_MS
}

/**
 * Is this card still standing?
 *
 * Strictly less than: a card expiring exactly now is already down. The same
 * comparison runs in the Firestore rule that serves the document, so a client
 * with a fast clock can render nothing but can never see more than this.
 */
export function isLive(stream: Pick<Livestream, 'expiresAt'>, now: number = Date.now()): boolean {
  return now < stream.expiresAt
}

/**
 * The one card to show, or null when nothing is on.
 *
 * Most recently posted wins. Two live cards at once is not a case worth a
 * picker — it means someone posted twice, and the newer one is the correction.
 */
export function activeStream(streams: Livestream[], now: number = Date.now()): Livestream | null {
  const live = streams.filter((s) => isLive(s, now))
  if (live.length === 0) return null
  return live.reduce((newest, s) => (s.createdAt > newest.createdAt ? s : newest))
}

/**
 * Milliseconds until this card comes down, floored at zero.
 *
 * The box reads this to set a timer. Without one it would sit on screen past
 * its window for anyone who left the app open, because a React tree does not
 * re-render just because the clock moved.
 */
export function msUntilExpiry(
  stream: Pick<Livestream, 'expiresAt'>,
  now: number = Date.now()
): number {
  return Math.max(0, stream.expiresAt - now)
}

/** Cards whose window has passed, for the scheduled sweep to delete. */
export function expiredStreams(streams: Livestream[], now: number = Date.now()): Livestream[] {
  return streams.filter((s) => !isLive(s, now))
}
