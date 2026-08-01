/**
 * Make a hand-typed address openable.
 *
 * Linking.openURL needs a scheme: given "google.com" it has no idea what
 * protocol to use and simply fails, which looks to the person who typed it
 * like the link is broken. People do not type "https://" — so assume it when
 * nothing else is given.
 *
 * Anything that already carries a scheme is left exactly as it is, including
 * mailto:, tel: and app deep links, so this only ever fills in a blank.
 */

/**
 * Matches a leading scheme like `https:`, `mailto:` or `zoomus:`.
 *
 * The trailing lookahead keeps a port out of it: "localhost:3000" looks like
 * the scheme "localhost" until you notice what follows is a number, and
 * treating it as one would leave it unopenable.
 */
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:(?!\d)/i

export function toExternalUrl(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return null

  if (HAS_SCHEME.test(trimmed)) return trimmed

  // "//example.com" is protocol-relative, which has no meaning outside a
  // browser tab that already has one.
  if (trimmed.startsWith('//')) return `https:${trimmed}`

  return `https://${trimmed}`
}

/**
 * Open a hand-typed address, doing nothing if it is empty.
 *
 * Callers pass the raw stored value; normalising happens here so a link saved
 * before this existed still works, rather than only newly entered ones.
 */
export async function openExternalUrl(raw: string | null | undefined): Promise<void> {
  const url = toExternalUrl(raw)
  if (!url) return
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Linking } = require('react-native')
  await Linking.openURL(url).catch(() => {})
}
