/**
 * Work out what to draw on a social or giving button.
 *
 * The icon field used to be printed verbatim beside the label, so an admin
 * who followed the editor's own hint and typed "Tithely" got a button reading
 * "Tithely Tithely". The field now means something: a pasted logo address,
 * one of the platforms the app has an icon for, or an emoji. A name that
 * matches none of those falls back to its first letter, because saying it
 * twice is the one thing it must not do.
 */

/** Icons pulled from the lucide set, named exactly as that package exports them. */
export type KnownIconName =
  | 'Facebook'
  | 'Instagram'
  | 'Twitter'
  | 'Youtube'
  | 'Linkedin'
  | 'Github'
  | 'Twitch'
  | 'Mail'
  | 'Phone'
  | 'Smartphone'
  | 'Globe'
  | 'Link'
  | 'Music'
  | 'MessageCircle'
  | 'DollarSign'
  | 'HandCoins'
  | 'CreditCard'
  | 'Banknote'
  | 'Gift'
  | 'Heart'
  | 'Send'

export type ResolvedIcon =
  | { kind: 'image'; uri: string }
  | { kind: 'named'; name: KnownIconName }
  | { kind: 'glyph'; text: string }
  | { kind: 'initial'; text: string }

/**
 * Names people actually type, mapped to what the app can draw.
 *
 * Venmo, Cash App and Tithe.ly have no brand icon in the lucide set, and
 * inventing one would misrepresent them, so they get the nearest honest
 * symbol. An admin who wants the real logo pastes its address instead.
 */
const KNOWN: Record<string, KnownIconName> = {
  facebook: 'Facebook',
  fb: 'Facebook',
  instagram: 'Instagram',
  ig: 'Instagram',
  twitter: 'Twitter',
  x: 'Twitter',
  youtube: 'Youtube',
  yt: 'Youtube',
  linkedin: 'Linkedin',
  github: 'Github',
  twitch: 'Twitch',
  email: 'Mail',
  mail: 'Mail',
  phone: 'Phone',
  call: 'Phone',
  text: 'Smartphone',
  sms: 'Smartphone',
  website: 'Globe',
  web: 'Globe',
  site: 'Globe',
  link: 'Link',
  music: 'Music',
  spotify: 'Music',
  applemusic: 'Music',
  message: 'MessageCircle',
  chat: 'MessageCircle',
  venmo: 'DollarSign',
  cashapp: 'DollarSign',
  paypal: 'DollarSign',
  zelle: 'DollarSign',
  give: 'HandCoins',
  giving: 'HandCoins',
  donate: 'HandCoins',
  tithe: 'HandCoins',
  tithely: 'HandCoins',
  offering: 'HandCoins',
  card: 'CreditCard',
  creditcard: 'CreditCard',
  bank: 'Banknote',
  cash: 'Banknote',
  check: 'Banknote',
  gift: 'Gift',
  heart: 'Heart',
  send: 'Send',
}

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

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** An emoji is a glyph or two; a word is not. */
function isGlyph(text: string): boolean {
  return Array.from(text).length <= 2 && !/[a-z0-9]/i.test(text)
}

/**
 * @param icon what the admin typed in the icon field
 * @param label the button's text, used when the icon field says nothing useful
 */
export function resolveSocialIcon(
  icon: string | undefined,
  label: string | undefined
): ResolvedIcon {
  const typed = (icon ?? '').trim()
  const name = (label ?? '').trim()

  if (isImageAddress(typed)) return { kind: 'image', uri: typed }
  if (isGlyph(typed) && typed !== '') return { kind: 'glyph', text: typed }

  // The label is worth trying too: a link labelled "Cash App" with the icon
  // left blank should still get an icon.
  const known = KNOWN[normalize(typed)] ?? KNOWN[normalize(name)]
  if (known) return { kind: 'named', name: known }

  const first = Array.from(name)[0]
  return { kind: 'initial', text: first ? first.toUpperCase() : '?' }
}
