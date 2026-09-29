import type { MusicItem } from '@/stores/musicStore'

/**
 * Titles as people actually type them, reduced to something comparable.
 *
 * A chord sheet called "Goodness Of God" and a Content video called
 * "Goodness of God " are the same song to everyone except a string compare.
 * Case and surrounding space are the two differences that come up constantly;
 * anything cleverer than that (dropping "(Live)", ignoring punctuation) starts
 * matching songs that are genuinely different recordings, which is worse than
 * not matching at all — the person can still pick one by hand.
 */
function normalizeTitle(title: string): string {
  return title.trim().toLowerCase()
}

/**
 * The one thing called this, or nothing.
 *
 * Exactly one on purpose: two entries sharing a title (a studio cut and a live
 * version, say) is precisely the case where guessing is wrong, so the builder
 * leaves those alone and the person picks.
 */
export function uniqueTitleMatch<T extends { title: string }>(
  title: string | null | undefined,
  items: T[]
): T | null {
  const wanted = normalizeTitle(title ?? '')
  if (!wanted) return null

  const matches = items.filter((item) => normalizeTitle(item.title) === wanted)
  return matches.length === 1 ? matches[0] : null
}

/**
 * The Content video for a song of this name.
 *
 * Only `music` items are considered — a sermon or a podcast episode that
 * happens to share a name with a song is not the recording anyone means.
 */
export function matchContentByTitle(
  title: string | null | undefined,
  items: MusicItem[]
): MusicItem | null {
  return uniqueTitleMatch(
    title,
    items.filter((item) => item.type === 'music' && !!item.youtubeUrl)
  )
}

/** The Content item a link already points at, so a picked video can be named. */
export function contentItemForUrl(
  url: string | null | undefined,
  items: MusicItem[]
): MusicItem | null {
  if (!url) return null
  return items.find((item) => item.youtubeUrl === url) ?? null
}
