import type { EventInstance } from '../data'
import { pickBest, type Picked } from '../pick'

/**
 * A food sign-up — "I'll bring chips to the potluck" — as Miriam works one
 * out: which event's sheet, and which item on it. Shared with the app
 * (src/lib/miriamFood), so the phone and the server read a sheet alike.
 */

/** How far ahead a food sign-up is looked for. */
export const FOOD_AHEAD_DAYS = 90

/** An event with a food sheet to sign up on. */
export const hasSheet = (ev: Pick<EventInstance, 'food' | 'foodItems'>) =>
  ev.food === true && (ev.foodItems ?? []).some(Boolean)

/**
 * Which item on a sheet was meant, by its index, and how sure that is
 * (../pick: pickBest): the same name, or every word said found in one, is
 * sure; "pot rose" for "Pot roast" is likely, to be asked about; "roast" with
 * "Pot roast" and "Roast vegetables" both on the sheet is which.
 */
export function foodItemPicked(items: string[], asked: string): Picked<number> {
  const picked = pickBest(
    items.map((label, i) => ({ label, i })).filter((o) => o.label.trim()),
    (o) => o.label,
    asked
  )
  if (picked.kind === 'sure') return { kind: 'sure', item: picked.item.i }
  if (picked.kind === 'likely') {
    return { kind: 'likely', item: picked.item.i, others: picked.others.map((o) => o.i) }
  }
  if (picked.kind === 'which') return { kind: 'which', items: picked.items.map((o) => o.i) }
  return { kind: 'none' }
}

/** What comes before the dish: "I'll bring", "sign me up for", "count me in for", "I've got". */
const OFFERING =
  /\b(?:sign(?:ing)?\s+(?:me\s+|us\s+)?up\s+(?:to\s+(?:bring|make|cook|bake)\s+|for\s+)|put\s+(?:me|us)\s+(?:down|on\s+the\s+list)\s+(?:to\s+bring\s+|for\s+)|count\s+(?:me|us)\s+in\s+for\s+|(?:i'?m|i\s+am|we'?re|we\s+are)\s+in\s+for\s+|(?:bring|bringing|make|making|cook|cooking|bake|baking|grill|grilling|fry|frying|prepare|preparing|provide|providing|take\s+care\s+of|taking\s+care\s+of|take|taking|do|doing|handle|handling|cover|covering|grab|grabbing|got)\s+)(.*)$/
/** Where the dish ends and the event begins: "for Sunday", "to the event". */
const EVENT_START =
  /\s(?:for|to|on|at|this|next)\s|\s(?:today|tonight|tomorrow|sunday|monday|tuesday|wednesday|thursday|friday|saturday)(?:'s)?\b/
const LEAD = /^(?:the|a|an|some|my|our)\s+/
const TAIL = /\s+(?:covered|please|too|as\s+well|for\s+us|then)$/
/** Not a dish: "I'll make it to the event", "I'll take that", "bring the event". */
const NOT_A_DISH =
  /^(?:it|that|this|them|those|these|one|the\s+one|some|something|anything|everything|myself|me|what|event)$/

/**
 * The dish in a food sign-up, as said — "chips" in "I'll bring chips to the
 * event". `masked`: the request with each event's name read as "the event"
 * (./events), so no event's name is taken for a dish. Null when no dish was
 * said: "I'll make it to the event", "sign me up for the event".
 */
export function dishIn(masked: string): string | null {
  return dishSaid(masked)?.dish ?? null
}

/** The dish, and what was said after it: "to the event on Sunday". */
export function dishSaid(masked: string): { dish: string; after: string } | null {
  const said = masked
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[.?!,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const m = OFFERING.exec(`${said} `)
  if (!m) return null
  const rest = ` ${m[1]}`
  const cut = EVENT_START.exec(rest)
  let dish = (cut ? rest.slice(0, cut.index) : rest).trim()
  while (LEAD.test(dish)) dish = dish.replace(LEAD, '')
  while (TAIL.test(dish)) dish = dish.replace(TAIL, '')
  if (!dish || NOT_A_DISH.test(dish)) return null
  return { dish, after: cut ? rest.slice(cut.index).trim() : '' }
}

/** What may be said after the dish without naming anywhere else: the event, a day, a date. */
const ONLY_WHEN =
  /\b(?:the\s+event|to|for|on|at|this|next|the|of|sign[-\s]?up|sheet|list|please|too|as\s+well|today|tonight|tomorrow|morning|afternoon|evening|night|(?:sun|mon|tues|wednes|thurs|fri|satur)day(?:'s)?|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|\d{1,2}(?:st|nd|rd|th)?|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/g

/**
 * Somewhere else named after the dish — "to my son's soccer game on Sunday",
 * "for my family", "next week" — as the words the event and the day leave over.
 * Empty when only the event and when were said.
 */
export function elsewhereIn(after: string): string {
  return after.replace(ONLY_WHEN, ' ').replace(/\s+/g, ' ').trim()
}

/** A word's ending that doesn't change the dish: "drinks", "dishes", "mom's". */
const PLURAL = /^(?:s|es|'s)$/

/**
 * The dish plainly the item's name, by whole words — "pot roast", "potroast",
 * "drinks" for "Drinks", "vegetables" for "Roast vegetables" — and not the
 * start of a longer word: "ham" is not "Hamburgers", nor "cheese" "Cheesecake".
 */
export function namesItem(label: string, dish: string): boolean {
  const words = (s: string) =>
    s
      .toLowerCase()
      .split(/[^a-z0-9']+/)
      .filter((w) => w && w !== 'and')
  const item = words(label)
  const said = words(dish)
  if (said.join('') === item.join('')) return true
  return said.every((w) =>
    item.some(
      (i) =>
        w === i ||
        (w.startsWith(i) && PLURAL.test(w.slice(i.length))) ||
        (i.startsWith(w) && PLURAL.test(i.slice(w.length)))
    )
  )
}
