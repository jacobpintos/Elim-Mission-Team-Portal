/**
 * Searching the content library.
 *
 * The library is browsed in rows — New, Featured, Music, Podcasts, Sermons —
 * which works while it is short and stops working the moment someone wants one
 * particular episode.
 *
 * Searching everything at once sounds more helpful than it is: typing a year
 * turns up every video whose title happens to contain those digits, and a
 * name matches the host of a series as readily as the episode being looked
 * for. So the search is narrow by default — titles only — and widens only
 * when asked.
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

/**
 * What a search is looking at.
 *
 * Two kinds of thing in one list, because that is how it is chosen. The first
 * five name a field to look in; the last three name a kind of content to look
 * within, searching titles inside it — picking "Podcasts" and typing nothing
 * is a legitimate way to browse.
 */
export type SearchScope = 'title' | 'album' | 'year' | 'people' | 'all' | MusicKind

type MusicKind = 'music' | 'podcast' | 'sermon'

const KINDS: MusicKind[] = ['music', 'podcast', 'sermon']

export const SEARCH_SCOPES: { value: SearchScope; label: string }[] = [
  { value: 'title', label: 'Title' },
  { value: 'album', label: 'Album or series' },
  { value: 'year', label: 'Year' },
  { value: 'people', label: 'People' },
  { value: 'all', label: 'Everything' },
  { value: 'music', label: 'Music only' },
  { value: 'podcast', label: 'Podcasts only' },
  { value: 'sermon', label: 'Sermons only' },
]

export const DEFAULT_SCOPE: SearchScope = 'title'

export function scopeLabel(scope: SearchScope): string {
  return SEARCH_SCOPES.find((s) => s.value === scope)?.label ?? 'Title'
}

function isKind(scope: SearchScope): scope is MusicKind {
  return (KINDS as SearchScope[]).includes(scope)
}

/** The text a scope looks at, already lowercased. */
function haystack(item: SearchableItem, scope: SearchScope): string {
  const people = [item.host, item.guest, item.preacher]
  const year = item.year !== undefined ? String(item.year) : ''

  const fields =
    scope === 'album'
      ? [item.album]
      : scope === 'year'
        ? [year]
        : scope === 'people'
          ? people
          : scope === 'all'
            ? [item.title, item.album, year, ...people]
            : // 'title', and every kind scope, which searches titles within it
              [item.title]

  return fields.filter(Boolean).join(' ').toLowerCase()
}

/**
 * Every word has to appear, though not in order and not in one field when the
 * scope covers several — "reece oneness" is how someone half-remembers an
 * episode whose guest is one and whose title is the other.
 */
export function matchesQuery(
  item: SearchableItem,
  query: string,
  scope: SearchScope = DEFAULT_SCOPE
): boolean {
  if (isKind(scope) && item.type !== scope) return false

  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return true

  const text = haystack(item, scope)
  return terms.every((term) => text.includes(term))
}

/**
 * The items matching `query` within `scope`, in the order they were given.
 *
 * A kind scope narrows the library even with nothing typed, which is what
 * makes "Podcasts only" useful on its own.
 */
export function searchMusic<T extends SearchableItem>(
  items: T[],
  query: string,
  scope: SearchScope = DEFAULT_SCOPE
): T[] {
  if (query.trim() === '' && !isKind(scope)) return items
  return items.filter((item) => matchesQuery(item, query, scope))
}
