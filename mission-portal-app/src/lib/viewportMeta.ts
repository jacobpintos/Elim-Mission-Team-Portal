/**
 * The viewport tag's content with viewport-fit=cover in it.
 *
 * Kept apart from the hook that applies it so the string handling can be
 * tested without a DOM. Any viewport-fit already present is replaced rather
 * than duplicated, and everything else in the tag is left exactly as it was.
 */
export function withViewportFitCover(content: string): string {
  const parts = content
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p && !/^viewport-fit\s*=/i.test(p))
  return [...parts, 'viewport-fit=cover'].join(', ')
}
