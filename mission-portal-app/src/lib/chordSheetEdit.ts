/**
 * Edits that apply across a whole chord sheet.
 *
 * Kept apart from the editor screen so the rules can be tested — the screen
 * itself needs React Native, which the unit tests deliberately do without.
 */

/** The marker a break row and an instrumental break are both written with. */
const PROGRESSION_END = '||'

function isBreakRow(row: string[]): boolean {
  return row.length === 1 && row[0] === PROGRESSION_END
}

/**
 * Empty every chord, leaving the shape of the sheet alone.
 *
 * Structure survives on purpose. The rows still line up with the lyric lines
 * they belong to, an instrumental keeps the same number of boxes, and the
 * breaks that mark where a progression ends stay where they were put — those
 * are arrangement, not chords, and rebuilding them is the tedious part. What
 * goes is only what was typed into the boxes.
 */
export function clearChordTokens(rows: string[][]): string[][] {
  return rows.map((row) => {
    if (isBreakRow(row)) return row
    return row.map((token) => (token === PROGRESSION_END ? token : ''))
  })
}

/** Does this sheet have a chord in it anywhere? */
export function hasAnyChord(rows: string[][][]): boolean {
  return rows.some((section) =>
    section.some((row) =>
      isBreakRow(row) ? false : row.some((token) => token !== '' && token !== PROGRESSION_END)
    )
  )
}

/**
 * Move the item at `from` to sit at `to`, leaving the rest in order.
 *
 * A song is written in the order it is played, and the order is discovered
 * while writing it — an intro remembered after the last chorus belongs at the
 * front, and rebuilding six sections to put it there is not a reasonable
 * price for remembering late.
 *
 * Out-of-range moves return the list unchanged rather than clamping, so a
 * button pressed at the end of the list does nothing instead of something
 * surprising.
 */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to) return items
  if (from < 0 || from >= items.length) return items
  if (to < 0 || to >= items.length) return items

  const next = items.slice()
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

/** Where a section should end up when nudged one place in `direction`. */
export function neighbourIndex(index: number, direction: 'up' | 'down'): number {
  return direction === 'up' ? index - 1 : index + 1
}

/** The parts of a section that ordering affects. */
export interface OrderedSection {
  type: string
  sameAsPrevious?: boolean
}

/**
 * Drop "same as previous" from any section that no longer has a previous.
 *
 * The flag means "this chorus is the one above", so it only makes sense with
 * an earlier section of the same type. Moving the first chorus to the front
 * of the song, or above the one it was copying, leaves it pointing at nothing
 * — and the viewer would show a label with no chords under it.
 */
export function normalizeSameAsPrevious<T extends OrderedSection>(sections: T[]): T[] {
  return sections.map((section, index) => {
    if (!section.sameAsPrevious) return section
    const hasEarlier = sections.slice(0, index).some((s) => s.type === section.type)
    return hasEarlier ? section : { ...section, sameAsPrevious: false }
  })
}
