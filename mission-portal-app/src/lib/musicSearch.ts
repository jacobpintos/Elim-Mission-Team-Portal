/**
 * Searching the content library.
 *
 * The library is browsed in rows — New, Featured, Music, Podcasts, Sermons —
 * which works while it is short and stops working the moment someone is
 * looking for a particular episode. Everything worth recognising a video by
 * is searched: its title, the album or series it belongs to, whoever is on
 * it, the year, and what kind of thing it is.
 */

/** Only the fields searched, so this can be tested without the store. */
export interface SearchableItem {
  title: string
  type: 'music' | 'podcast' | 'sermon'
  album?: string
  host?: string
  guest?: string
  preacher?: string
  year?: number
}

/** What someone would type for each kind, beyond the words in the record. */
const TYPE_WORDS: Record<SearchableItem['type'], string> = {
  music: 'music song',
  podcast: 'podcast episode',
  sermon: 'sermon message preaching',
}

function haystack(item: SearchableItem): string {
  return [
    item.title,
    item.album,
    item.host,
    item.guest,
    item.preacher,
    item.year !== undefined ? String(item.year) : '',
    TYPE_WORDS[item.type] ?? '',
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

/**
 * Every word has to appear somewhere, though not in the order given and not
 * in the same field — "reece oneness" finds the episode whose guest is one
 * and whose title is the other, which is how people half-remember a video.
 */
export function matchesQuery(item: SearchableItem, query: string): boolean {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return true
  const text = haystack(item)
  return terms.every((term) => text.includes(term))
}

/** The items matching `query`, in the order they were given. */
export function searchMusic<T extends SearchableItem>(items: T[], query: string): T[] {
  if (query.trim() === '') return items
  return items.filter((item) => matchesQuery(item, query))
}
