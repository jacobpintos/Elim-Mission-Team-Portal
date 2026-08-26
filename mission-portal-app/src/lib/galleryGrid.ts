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
