import type { AnnouncementAttachment } from '@/types/events'

/**
 * How big an announcement's photo is drawn, and when the announcement goes.
 *
 * The photo always spans the full width of the card it sits in. What varies is
 * its height, and the rule for that is the whole point of this file: a photo
 * is never stretched to fit. Its own proportions decide the height, and when
 * an admin overrides that height the photo is cropped to the new box rather
 * than squashed into it.
 */

/** Smallest height worth drawing — below this a photo is a coloured stripe. */
export const MIN_IMAGE_HEIGHT = 80

/** Tallest a photo may be. Past this it pushes the text off the screen. */
export const MAX_IMAGE_HEIGHT = 600

/** Height the card uses when a photo's natural size is not known yet. */
export const FALLBACK_IMAGE_HEIGHT = 200

/**
 * The height that keeps a photo's proportions at a given card width.
 *
 * Null when the natural size is unknown or nonsensical, so callers fall back
 * rather than dividing by zero and laying out a NaN-tall box.
 */
export function naturalHeight(
  natural: { width?: number; height?: number } | null | undefined,
  cardWidth: number
): number | null {
  const w = natural?.width
  const h = natural?.height
  if (!w || !h || w <= 0 || h <= 0) return null
  if (!Number.isFinite(cardWidth) || cardWidth <= 0) return null
  const scaled = Math.round((cardWidth * h) / w)
  return Number.isFinite(scaled) && scaled > 0 ? scaled : null
}

/**
 * Keep a height inside what the card can actually show.
 *
 * Only NaN falls back. An infinity is not a missing answer — it is an
 * unambiguously out-of-range one, and pinning it at the bound it exceeded is
 * closer to what was meant than dropping to the default.
 */
export function clampImageHeight(height: number): number {
  if (Number.isNaN(height)) return FALLBACK_IMAGE_HEIGHT
  return Math.min(MAX_IMAGE_HEIGHT, Math.max(MIN_IMAGE_HEIGHT, Math.round(height)))
}

/**
 * How tall to draw this attachment in a card of the given width.
 *
 * An admin's chosen height wins; otherwise the photo's own proportions decide.
 * The result is always inside the clamp, so a stored height from an older
 * build — or one edited by hand — cannot break the layout.
 */
export function cardImageHeight(
  attachment: Pick<AnnouncementAttachment, 'width' | 'height' | 'displayHeight'> | null | undefined,
  cardWidth: number
): number {
  if (!attachment) return FALLBACK_IMAGE_HEIGHT
  if (attachment.displayHeight) return clampImageHeight(attachment.displayHeight)
  const natural = naturalHeight(attachment, cardWidth)
  return clampImageHeight(natural ?? FALLBACK_IMAGE_HEIGHT)
}

/**
 * Is the photo being cropped rather than shown whole?
 *
 * True once the admin's height differs from the one the photo's proportions
 * ask for, which is what the composer warns about — the alternative to
 * cropping is distorting, and distorting is never on offer.
 */
export function isCropped(
  attachment: Pick<AnnouncementAttachment, 'width' | 'height' | 'displayHeight'> | null | undefined,
  cardWidth: number
): boolean {
  if (!attachment?.displayHeight) return false
  const natural = naturalHeight(attachment, cardWidth)
  if (natural === null) return false
  return clampImageHeight(attachment.displayHeight) !== clampImageHeight(natural)
}

/**
 * Has this announcement outlived its expiry date?
 *
 * Both dates are YYYY-MM-DD, which compares correctly as a string, and the
 * comparison is strictly greater than: an announcement set to expire today is
 * still shown all of today and goes tomorrow. "After that day passes" is what
 * was asked for, and a notice vanishing on the morning of the day it names
 * would be the opposite of useful.
 */
export function isExpired(expiresAt: string | undefined | null, todayStr: string): boolean {
  if (!expiresAt) return false
  return todayStr > expiresAt
}

/** Announcements still worth showing today. */
export function notExpired<T extends { expiresAt?: string }>(items: T[], todayStr: string): T[] {
  return items.filter((a) => !isExpired(a.expiresAt, todayStr))
}
