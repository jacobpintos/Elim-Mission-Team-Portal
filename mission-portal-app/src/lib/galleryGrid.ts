/**
 * Grid arithmetic for the gallery block.
 *
 * Kept apart from the component so it can be tested without loading React
 * Native, which vitest cannot parse.
 */

/** Two suits book covers; three suits snapshots. */
export const DEFAULT_COLUMNS = 2
export const MIN_COLUMNS = 1
export const MAX_COLUMNS = 4

export function clampColumns(columns: number | undefined): number {
  if (!columns || Number.isNaN(columns)) return DEFAULT_COLUMNS
  return Math.min(MAX_COLUMNS, Math.max(MIN_COLUMNS, Math.round(columns)))
}

/**
 * Split a flat list into rows.
 *
 * A short final row is left short rather than padded: an empty cell is still
 * something a reader can tap at.
 */
export function toRows<T>(items: T[], columns: number): T[][] {
  const rows: T[][] = []
  const size = Math.max(1, columns)
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size))
  return rows
}

/** Drop the empty tail, so an untouched gallery stores no links at all. */
function trimTail(links: string[]): string[] {
  let end = links.length
  while (end > 0 && !links[end - 1]) end -= 1
  return links.slice(0, end)
}

/** Set one picture's link, filling any gap before it. */
export function setLinkAt(links: string[], index: number, value: string): string[] {
  const next = links.slice()
  while (next.length <= index) next.push('')
  next[index] = value.trim()
  return trimTail(next)
}

/**
 * Carry links across an edit of the image list.
 *
 * Links are matched to pictures by position, so reordering or deleting a line
 * in the editor would otherwise slide every link below it onto the wrong
 * picture. Following the address instead of the index survives all of that.
 * Editing an address in place is the one case that cannot be followed — the
 * link is dropped rather than left on a picture nobody meant it for.
 */
export function remapLinks(oldImages: string[], oldLinks: string[], newImages: string[]): string[] {
  return trimTail(
    newImages.map((src) => {
      const was = oldImages.indexOf(src)
      return was === -1 ? '' : (oldLinks[was] ?? '')
    })
  )
}
