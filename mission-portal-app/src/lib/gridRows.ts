/**
 * Split a run of items into rows that come out even.
 *
 * A plain wrapping row fills to the limit and leaves the remainder stranded:
 * five people across four columns is four and then one, alone at the left
 * edge. Sharing them out instead gives three and two, which reads as a group
 * rather than a row with an offcut under it.
 *
 * Rows are the fewest that will hold everything — ceil(count / maxPerRow) — and
 * the items are dealt across them as evenly as possible, earlier rows taking
 * the extra when it does not divide. Five over four columns is [3, 2]; seven is
 * [4, 3]; nine is [3, 3, 3].
 *
 * Cells keep the width they would have had at the full column count, so the
 * short row is a centred pair under three rather than two wide ones — the eye
 * still reads a grid.
 */
export function balancedRows(count: number, maxPerRow: number): number[] {
  if (count <= 0 || maxPerRow <= 0) return []
  if (count <= maxPerRow) return [count]

  const rows = Math.ceil(count / maxPerRow)
  const base = Math.floor(count / rows)
  // The remainder is spread one per row from the top rather than piled onto
  // the first, so no row is ever more than one item taller than another.
  let extra = count % rows

  return Array.from({ length: rows }, () => {
    const size = base + (extra > 0 ? 1 : 0)
    if (extra > 0) extra--
    return size
  })
}

/** The same split, applied to the items themselves. */
export function chunkIntoRows<T>(items: T[], maxPerRow: number): T[][] {
  const sizes = balancedRows(items.length, maxPerRow)
  const rows: T[][] = []
  let i = 0
  for (const size of sizes) {
    rows.push(items.slice(i, i + size))
    i += size
  }
  return rows
}
