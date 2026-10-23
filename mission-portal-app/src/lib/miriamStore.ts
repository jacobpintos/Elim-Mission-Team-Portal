import type { StoreContent } from '@/features/store/storeContent'
import type { StoreSale } from '@/features/store/storeSale'

/**
 * Questions about the Elim Store, answered from the store itself.
 *
 * Asked of Claude, these came back unsure — "I can't see the store's items
 * from here" — and "what is the Elim Store?" went to the web and found
 * nothing, though the app holds the answer to all of them: the store's own
 * words, its shelves, and whether a sale is running (storeSales). So they are
 * answered here, from those, with nothing left to guess.
 *
 * - sale: "is anything on sale at the Elim Store?" — yes, with the sale and
 *   when it ends, or plainly no.
 * - browse: "what's for sale at the Elim Store?" — the store tab, opened, with
 *   what it carries and whether a sale is on.
 * - about: "what is the Elim Store?" — what it says it is, and the tab.
 */
export type StoreAsk = 'sale' | 'browse' | 'about'

/** The store, named: "the Elim Store", "the merch store", "theelimstore.com", "merch". */
const NAMED = /\b(?:the)?elim\s*store\b|\bmerch(?:andise)?\b/

/** A sale, as against things for sale: "on sale", "a sale", "any sales", "deals". */
const SALE =
  /\b(?:on\s+sale|(?:a|any|the|current)\s+sales?|sales?\s+(?:on|going\s+on|right\s+now|now|running)|deals?|discounts?|specials?|promo(?:tion)?s?|coupons?|marked\s+down)\b/

/** Its goods: "for sale", "sell", "buy", "what's in it". */
const BROWSE =
  /\b(?:for\s+sale|sells?|selling|buy|purchase|carry|carries|stock|items?|products?|things|stuff|clothes|clothing|shirts?|t-?shirts?|hats?|hoodies?|books?|have|has|got|in\s+(?:the\s+)?(?:elim|merch)\s*store)\b/

/** What it is: "what is the Elim Store", "tell me about the merch store". */
const ABOUT =
  /^(?:what(?:'|’)?s|what\s+is|what\s+exactly\s+is|tell\s+me\s+about|explain|describe)\b|\bwhat\s+(?:the\s+)?(?:elim|merch)\s*store\s+is\b|\babout\s+(?:the\s+)?(?:elim|merch)\s*store\b/

/** Opening it: the screen's to answer (lib/miriamQuick: screenAsked). */
const OPENING = /^(?:open|show|go|take|bring|pull)\b/

const tidy = (text: string) =>
  text
    .toLowerCase()
    .replace(/[?!.,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(
      /^(?:(?:hey|ok|okay)\s+)?(?:miriam\s+)?(?:please\s+)?(?:(?:can|could|would)\s+you\s+)?(?:tell\s+me\s+(?!about\b))?/,
      ''
    )

/** What is being asked about the Elim Store, when it is named; null for anything else. */
export function storeAsked(text: string): StoreAsk | null {
  const t = tidy(text)
  if (!NAMED.test(t)) return null
  if (SALE.test(t) && !/\bfor\s+sale\b/.test(t)) return 'sale'
  if (BROWSE.test(t)) return 'browse'
  if (OPENING.test(t)) return null
  if (ABOUT.test(t)) return 'about'
  return null
}

export interface StoreReply {
  text: string
  /** Whether the store tab is opened with it. */
  open: boolean
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/** A sale's last day, as said: "today", "tomorrow", "Sunday, November 1st". */
export function saleEndSaid(endsOn: string, now: Date): string {
  const [y, m, d] = endsOn.split('-').map(Number)
  const end = new Date(y, m - 1, d)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const days = Math.round((end.getTime() - today.getTime()) / 86_400_000)
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  const nth = d % 100 >= 11 && d % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][d % 10] ?? 'th')
  const year = y === now.getFullYear() ? '' : `, ${y}`
  return `${WEEKDAYS[end.getDay()]}, ${MONTHS[m - 1]} ${d}${nth}${year}`
}

const sentence = (s: string) => {
  const t = s.trim()
  return t && !/[.!?…]$/.test(t) ? `${t}.` : t
}

/** "a, b and c". */
const listed = (items: string[]) =>
  items.length <= 1
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`

/** A shelf's title as said mid-sentence: "Handmade clothing" → "handmade clothing". */
const midSentence = (title: string) =>
  /^[A-Z][a-z]/.test(title) ? title[0].toLowerCase() + title.slice(1) : title

/** The sale's own words, without the full stop it may end in, to say inside a sentence. */
const saleWords = (sale: StoreSale) => sale.message.trim().replace(/[.!]+$/, '')

/** The answer to a question about the store, from the store as it stands and its sale. */
export function storeReply(
  ask: StoreAsk,
  store: StoreContent,
  sale: StoreSale | null,
  now: Date = new Date()
): StoreReply {
  const ends = sale ? saleEndSaid(sale.endsOn, now) : ''

  if (ask === 'sale') {
    return sale
      ? { text: `Yes — ${saleWords(sale)}, until ${ends}. Here’s the store.`, open: true }
      : { text: 'There’s no sale at the Elim Store right now.', open: false }
  }

  if (ask === 'browse') {
    const shelves = store.shelves.filter((s) => s.items.length && s.title.trim())
    const carries = listed(shelves.map((s) => midSentence(s.title.trim())))
    const here = carries ? `Here’s the Elim Store, with ${carries}.` : 'Here’s the Elim Store.'
    const onSale = sale
      ? `There’s a sale on: ${saleWords(sale)}, until ${ends}.`
      : 'There’s no sale on right now.'
    return { text: `${here} ${onSale}`, open: true }
  }

  // What it is, in its own words.
  const own = [store.tagline, store.intro].map(sentence).filter(Boolean).join(' ')
  return {
    text: `The Elim Store is the mission’s merch store.${own ? ` ${own}` : ''} Here it is.`,
    open: true,
  }
}
