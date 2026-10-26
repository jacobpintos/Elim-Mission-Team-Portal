/**
 * Work out what to draw on a social or giving button.
 *
 * The icon field used to be printed verbatim beside the label, so an admin
 * who followed the editor's own hint and typed "Tithely" got a button reading
 * "Tithely Tithely". The field now means something: a pasted logo address, or
 * an emoji. A Venmo or Cash App link gets that platform's own logo, drawn by
 * BrandMark. Anything else falls back to its first letter, because saying the
 * label twice is the one thing it must not do.
 *
 * There is deliberately no icon set behind this. @tamagui/lucide-icons is in
 * the project, but its newest release is a major version behind the app's
 * tamagui and it carries its own copy of @tamagui/core, so its components
 * read a theme context the app never provides and throw on render. Anything
 * drawn here has to come from the platform's own logo or from text.
 */

/** A platform whose logo the app draws itself. */
export type Brand = 'venmo' | 'cashapp'

export type ResolvedIcon =
  | { kind: 'image'; uri: string }
  | { kind: 'glyph'; text: string }
  | { kind: 'brand'; brand: Brand }
  | { kind: 'initial'; text: string }

/**
 * An address, not a name.
 *
 * Deliberately stricter than the app's usual link handling, which assumes
 * https:// when a scheme is missing — that would turn the word "Tithely" into
 * a broken image rather than a letter.
 */
function isImageAddress(text: string): boolean {
  return /^(https?:)?\/\//i.test(text) || text.startsWith('data:')
}

/** An emoji is a glyph or two; a word is not. */
function isGlyph(text: string): boolean {
  return text !== '' && Array.from(text).length <= 2 && !/[a-z0-9]/i.test(text)
}

/** "venmo.com" from "https://www.venmo.com/u/elim", "cash.app/$elim" or "//cash.me/x". */
function hostOf(url: string): string {
  const m = /^(?:[a-z][a-z0-9+.-]*:)?(?:\/\/)?([^/?#@\s]+)/i.exec(url.trim())
  return (m?.[1] ?? '')
    .replace(/:\d+$/, '')
    .replace(/^www\./i, '')
    .toLowerCase()
}

const onSite = (host: string, site: string) => host === site || host.endsWith(`.${site}`)

/** Which platform a link is: by where it goes, or failing that by what it is called. */
function brandOf(url: string, ...names: string[]): Brand | null {
  const host = hostOf(url)
  if (onSite(host, 'venmo.com')) return 'venmo'
  if (onSite(host, 'cash.app') || onSite(host, 'cash.me')) return 'cashapp'
  for (const name of names) {
    if (/\bvenmo\b/i.test(name)) return 'venmo'
    if (/\bcash\s?app\b|\bsquare\s?cash\b/i.test(name)) return 'cashapp'
  }
  return null
}

/**
 * @param icon what the admin typed in the icon field
 * @param label the button's text, used when the icon field says nothing useful
 * @param url where the button goes, which says what platform it is
 */
export function resolveSocialIcon(
  icon: string | undefined,
  label: string | undefined,
  url?: string
): ResolvedIcon {
  const typed = (icon ?? '').trim()
  const name = (label ?? '').trim()

  if (isImageAddress(typed)) return { kind: 'image', uri: typed }
  if (isGlyph(typed)) return { kind: 'glyph', text: typed }

  const brand = brandOf(url ?? '', typed, name)
  if (brand) return { kind: 'brand', brand }

  const first = Array.from(name)[0]
  return { kind: 'initial', text: first ? first.toUpperCase() : '?' }
}
