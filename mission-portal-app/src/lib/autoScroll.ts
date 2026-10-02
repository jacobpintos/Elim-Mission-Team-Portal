/**
 * Autoscroll for the chord sheet: the arithmetic, apart from the screen, so
 * it can be tested. useAutoScroll drives it; ChordSheetViewer draws it.
 */

/**
 * Speeds, slowest first, in points a second at the sheet's normal text size.
 *
 * A sheet at that size runs about 2,000–3,000 points for a song of three or
 * four minutes, so the middle of the range — 8 to 12 — carries one through in
 * about the time it is played. The steps grow as they go: a step at the slow
 * end is the difference a slow ballad needs, and at the fast end the same
 * point or two would hardly be noticed.
 */
export const SCROLL_SPEEDS = [3, 4, 5, 6.5, 8, 10, 12.5, 15, 18, 22, 27, 33] as const

/** Speeds are shown and kept as 1–12. */
export const MIN_LEVEL = 1
export const MAX_LEVEL = SCROLL_SPEEDS.length
export const DEFAULT_LEVEL = 5

export function clampLevel(level: number): number {
  if (!Number.isFinite(level)) return DEFAULT_LEVEL
  return Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, Math.round(level)))
}

/**
 * Points a second at this speed, for text at this scale. Bigger text is a
 * taller sheet for the same song, so it has to move faster to keep time.
 */
export function pointsPerSecond(level: number, textScale: number): number {
  return SCROLL_SPEEDS[clampLevel(level) - 1] * textScale
}

/**
 * One frame's movement. The time since the last frame is capped: after the
 * page has been in the background, or a long stall, the sheet should carry on
 * from where it was rather than leap ahead to where it would have been.
 */
export function advance(
  y: number,
  level: number,
  textScale: number,
  seconds: number,
  end: number
): { y: number; done: boolean } {
  const next = y + pointsPerSecond(level, textScale) * Math.min(Math.max(seconds, 0), 0.1)
  return next >= end ? { y: Math.max(end, 0), done: true } : { y: next, done: false }
}

/**
 * A tap on the sheet — which pauses and resumes — rather than the start of a
 * scroll by hand: short, and hardly moved.
 */
export function isTap(moved: number, ms: number): boolean {
  return moved < 10 && ms < 350
}

/** Each song's speed, and the last one picked, for songs not yet given one. */
export interface SavedSpeeds {
  last: number
  bySheet: Record<string, number>
}

export function parseSpeeds(raw: string | null): SavedSpeeds {
  try {
    const parsed = raw ? (JSON.parse(raw) as Partial<SavedSpeeds>) : {}
    const bySheet: Record<string, number> = {}
    for (const [id, level] of Object.entries(parsed.bySheet ?? {})) {
      if (typeof level === 'number') bySheet[id] = clampLevel(level)
    }
    return { last: clampLevel(parsed.last ?? DEFAULT_LEVEL), bySheet }
  } catch {
    return { last: DEFAULT_LEVEL, bySheet: {} }
  }
}

/** A song keeps the speed it was last played at; a new one starts at the last speed used. */
export function speedFor(saved: SavedSpeeds, sheetId: string): number {
  return saved.bySheet[sheetId] ?? saved.last
}

export function withSpeed(saved: SavedSpeeds, sheetId: string, level: number): SavedSpeeds {
  const l = clampLevel(level)
  return { last: l, bySheet: { ...saved.bySheet, [sheetId]: l } }
}
