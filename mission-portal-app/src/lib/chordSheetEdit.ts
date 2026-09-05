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
