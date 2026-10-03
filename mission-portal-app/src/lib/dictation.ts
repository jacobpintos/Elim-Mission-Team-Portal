/**
 * Joining dictated words onto what a field already holds.
 *
 * Pure, so the rules are tested rather than tried: a space between the two
 * where one is needed, a capital where a sentence starts, and — in fields
 * that take more than one line — "new line" and "new paragraph" said out
 * loud become line breaks, as they do in the phone's own dictation.
 */
export function joinDictation(before: string, spoken: string, multiline: boolean): string {
  let words = spoken.trim()
  if (!words) return before
  if (multiline) {
    words = words
      .replace(/\s*\bnew paragraph\b[.,]?\s*/gi, '\n\n')
      .replace(/\s*\bnew line\b[.,]?\s*/gi, '\n')
  }
  const startsSentence = before.trim() === '' || /[.!?]\s*$|\n\s*$/.test(before)
  if (startsSentence) words = words.replace(/^\s*([a-z])/, (_, c: string) => c.toUpperCase())
  if (!before) return words
  const gap = /\s$/.test(before) || /^\s/.test(words) ? '' : ' '
  return before + gap + words
}
