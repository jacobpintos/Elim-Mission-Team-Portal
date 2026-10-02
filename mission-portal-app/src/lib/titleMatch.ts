/**
 * Which chord sheet a recording's title is.
 *
 * Shazam names the recording as it was released — "Goodness of God (Live)",
 * "Build My Life - Radio Version", "What A Beautiful Name" — and the library
 * names its sheets however they were typed. Both are reduced to their words:
 * case, punctuation and apostrophes go, and so do the bracketed or dashed
 * tags a release adds ("Live", "Acoustic", "feat. …").
 */
export function titleWords(title: string): string {
  return title
    .toLowerCase()
    .replace(/\s*[([].*?[)\]]/g, ' ')
    .replace(/\s+[-–—]\s+.*$/, '')
    .replace(/['’]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * The sheet with that title: the same words exactly, or failing that the one
 * sheet whose title holds the recording's (or is held in it) — "Holy Forever"
 * for "Holy Forever (feat. …)". None if that leaves more than one.
 */
export function findByTitle<T extends { title: string }>(sheets: T[], title: string): T | null {
  const want = titleWords(title)
  if (!want) return null
  const exact = sheets.filter((s) => titleWords(s.title) === want)
  if (exact.length > 0) return exact[0]
  const near = sheets.filter((s) => {
    const have = titleWords(s.title)
    if (!have) return false
    return ` ${have} `.includes(` ${want} `) || ` ${want} `.includes(` ${have} `)
  })
  return near.length === 1 ? near[0] : null
}
