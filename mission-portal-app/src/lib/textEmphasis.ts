/**
 * Emphasis a page editor can type into an ordinary text box.
 *
 * The block editors are plain inputs and there is no rich-text control to put
 * in them, so the marks live in the text itself and are read back out here.
 * Three of them, chosen to be things nobody types by accident in a sentence:
 *
 *   *word*   heavier
 *   _word_   underlined
 *   ^word^   set in capitals
 *
 * They nest, in any order: `*^rest^*` is bold capitals. A backslash before a
 * mark makes it an ordinary character — `\*` is an asterisk.
 *
 * A mark that is never closed applies to the end of the line rather than being
 * dropped. That is deliberate: a visible run of bold text is how an editor
 * notices the missing one, where silently ignoring it would leave them
 * wondering why nothing happened.
 */

export interface EmphasisSegment {
  text: string
  bold?: boolean
  underline?: boolean
  caps?: boolean
}

const MARKS = { '*': 'bold', _: 'underline', '^': 'caps' } as const
type MarkChar = keyof typeof MARKS

/** Split a line into runs of text, each carrying the marks in force over it. */
export function parseEmphasis(input: string): EmphasisSegment[] {
  const segments: EmphasisSegment[] = []
  const active = new Set<MarkChar>()
  let buffer = ''

  const flush = () => {
    if (!buffer) return
    const segment: EmphasisSegment = { text: buffer }
    for (const m of active) segment[MARKS[m]] = true
    segments.push(segment)
    buffer = ''
  }

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]

    // An escape carries the next character through untouched, and drops itself
    // only when it is actually shielding a mark — a backslash in ordinary prose
    // should still print.
    if (ch === '\\' && i + 1 < input.length && input[i + 1] in MARKS) {
      buffer += input[i + 1]
      i++
      continue
    }

    if (ch in MARKS) {
      flush()
      const mark = ch as MarkChar
      if (active.has(mark)) active.delete(mark)
      else active.add(mark)
      continue
    }

    buffer += ch
  }

  flush()
  return segments
}

/** True when the text carries no marks at all, so callers can skip the work. */
export function hasEmphasis(input: string): boolean {
  return /(?<!\\)[*_^]/.test(input)
}
