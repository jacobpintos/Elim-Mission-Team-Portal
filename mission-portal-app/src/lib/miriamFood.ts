import {
  canSeeEvent,
  findEvents,
  shiftDate,
  type EventInstance,
} from '../../functions/src/miriam/data'
import { eventRef, type QuickData } from './miriamQuick'

/**
 * "I'll make pot roast for Sunday", "sign me up to bring drinks to the
 * potluck": a food sign-up, worked out on the device rather than by Claude.
 *
 * Only what can be read plainly is taken: the dish, and the day or event's
 * name if one was given. Which event and which item on its sheet are settled
 * in the conversation (features/miriam/MiriamButton) — asked back when not
 * clear — and the sign-up itself is the same confirmed `sign_up_food` change
 * Claude would offer. Anything not read here is left to Claude: null.
 */

export interface FoodAsk {
  /** The dish as said: "pot roast". Empty when none was ("sign me up for food Sunday"). */
  item: string
  /** The day said (YYYY-MM-DD), if one was. */
  date: string | null
  /** The words naming the event, if any: "potluck". */
  name: string
  /**
   * Plainly about food, whatever the dish: cooked, baked, or a food word
   * said. "I'll bring my guitar" is not, and needs an event with a sheet named
   * before it is taken for one.
   */
  surelyFood: boolean
}

const COOKING = /\b(?:make|makes|making|cook|bake|grill|fry|fix|prepare|provide)\b/
const FOODISH =
  /\b(?:food|dish|dishes|snacks?|desserts?|drinks?|potluck|meal|side|sides|main|appetizers?|casserole|salad|plates?|cups?|napkins?|utensils?|ice)\b/

/** Before the dish: "I'll make", "I can bring", "sign me up to bring". */
const OFFER =
  /^(?:(?:i'?ll|i\s+will|i\s+can|i\s+could|i'?d\s+like\s+to|i\s+want\s+to|let\s+me|i'?m\s+going\s+to|im\s+going\s+to|i'?m\s+gonna|i\s+am\s+going\s+to|i\s+am\s+gonna)\s+(?:sign\s+up\s+to\s+)?(make|bring|cook|bake|grill|fry|fix|prepare|provide)|(?:sign|put)\s+me\s+(?:up|down)\s+(?:to\s+(?:bring|make|cook|bake)|for)|i'?ll\s+sign\s+up\s+(?:to\s+(?:bring|make)|for))\b\s*(.*)$/

/** Where the dish ends and the event begins: "for Sunday", "to the potluck". */
const EVENT_START =
  /\s(?:for|to|on|at|this|next)\s|\s(?:today|tonight|tomorrow|sunday|monday|tuesday|wednesday|thursday|friday|saturday)(?:'s)?\b/

const LEAD = /^(?:the|a|an|some|my|our)\s+/

export function foodAsked(text: string, today: string): FoodAsk | null {
  const said = text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[.?!,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const m = OFFER.exec(said)
  if (!m) return null
  const verb = m[1] ?? ''
  const rest = ` ${m[2] ?? ''}`
  const cut = EVENT_START.exec(rest)
  let item = (cut ? rest.slice(0, cut.index) : rest).trim()
  while (LEAD.test(item)) item = item.replace(LEAD, '')
  const about = cut ? rest.slice(cut.index).replace(/'s\b/g, '') : ''
  // A date said as one ("October 25", "10/25", "the 25th"), else a day or name.
  const date = dateSaid(about, today)
  const ref = about.trim() ? eventRef(about.trim(), today) : null
  return {
    item,
    date: date ?? ref?.date ?? null,
    name: date ? '' : (ref?.name ?? '').replace(/\b(?:food|sign\s*up|sheet)\b/g, '').trim(),
    surelyFood: COOKING.test(verb) || COOKING.test(said) || FOODISH.test(said),
  }
}

/** Squashed for comparing: "Pot-roast" and "potroast" alike. */
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
const wordsOf = (s: string) =>
  s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !['the', 'and', 'of', 'a', 'an', 'some'].includes(w))

/**
 * Which item on a sheet was meant, by its index; -1 when none, or more than
 * one, fits. The same name first; then one with the same letters
 * ("potroast" for "Pot roast"); then the one item every word said fits.
 * Never a near miss: "pot roast" is not "Roast vegetables".
 */
export function foodItemMatch(items: string[], asked: string): number {
  const said = squash(asked)
  if (!said) return -1
  const same = items.findIndex((i) => squash(i) === said)
  if (same >= 0) return same
  const one = (hits: number[]) => (hits.length === 1 ? hits[0] : -1)
  const inside = items
    .map((item, i) => ({ s: squash(item), i }))
    .filter(({ s }) => s.length > 2 && (s.includes(said) || said.includes(s)))
    .map(({ i }) => i)
  if (inside.length) return one(inside)
  const want = wordsOf(asked)
  if (!want.length) return -1
  return one(
    items
      .map((item, i) => ({ have: wordsOf(item), i }))
      .filter(({ have }) =>
        want.every((w) => have.some((h) => h === w || h === `${w}s` || w === `${h}s`))
      )
      .map(({ i }) => i)
  )
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/**
 * A date said as one: "October 25", "Oct 25th", "10/25", "the 25th". The next
 * one from today: "the 3rd" said on the 20th is next month's. Null for none.
 */
export function dateSaid(text: string, today: string): string | null {
  const said = text.toLowerCase()
  const [y, mo, d] = today.split('-').map(Number)
  const at = (year: number, month: number, day: number) => {
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    // Not a real day (Feb 30): none.
    return new Date(`${iso}T12:00:00Z`).toISOString().slice(0, 10) === iso ? iso : null
  }
  const ahead = (month: number, day: number) => {
    const thisYear = at(y, month, day)
    return thisYear && thisYear >= today ? thisYear : at(y + 1, month, day)
  }

  const named =
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/.exec(
      said
    )
  if (named) return ahead(MONTHS.indexOf(named[1]) + 1, Number(named[2]))
  const slashed = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(said)
  if (slashed) {
    const [month, day] = [Number(slashed[1]), Number(slashed[2])]
    if (slashed[3]) {
      const year = Number(slashed[3]) < 100 ? 2000 + Number(slashed[3]) : Number(slashed[3])
      return at(year, month, day)
    }
    return ahead(month, day)
  }
  const nth = /\bthe\s+(\d{1,2})(?:st|nd|rd|th)\b/.exec(said)
  if (nth) {
    const day = Number(nth[1])
    const thisMonth = at(y, mo, day)
    if (thisMonth && day >= d) return thisMonth
    return mo === 12 ? at(y + 1, 1, day) : at(y, mo + 1, day)
  }
  return null
}

/** How far ahead a food sign-up is looked for. */
export const FOOD_AHEAD_DAYS = 90

const hasSheet = (ev: EventInstance) => ev.food === true && (ev.foodItems ?? []).some(Boolean)

/**
 * Upcoming events with a food sheet that fit what was said: those on that
 * day, or by that name (nearest first). Only events this person can see.
 */
export function foodEventsFor(
  ask: { date: string | null; name: string },
  data: QuickData
): EventInstance[] {
  const { templates, overrides, groups, viewer, today } = data
  const found = findEvents(
    templates,
    overrides,
    groups,
    viewer,
    ask.name,
    today,
    ask.date ?? '',
    // Wide: nothing said finds every upcoming event, and those with a sheet are taken from them.
    200
  ).filter(
    (ev) =>
      hasSheet(ev) &&
      ev.date >= today &&
      ev.date <= shiftDate(today, FOOD_AHEAD_DAYS) &&
      canSeeEvent(ev, viewer, groups)
  )
  return found.sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * Which of the events offered a reply names: by its title, or by the day it
 * is on. Null when it isn't plainly one of them.
 */
export function eventPicked(
  reply: string,
  events: EventInstance[],
  today: string
): EventInstance | null {
  const said = reply.toLowerCase()
  const date = dateSaid(said, today) ?? eventRef(said, today)?.date ?? null
  const onDay = date ? events.filter((ev) => ev.date === date) : []
  if (onDay.length === 1) return onDay[0]
  const byName = events.filter((ev) => {
    const title = wordsOf(ev.title)
    return title.length > 0 && wordsOf(said).some((w) => title.includes(w))
  })
  const pool = onDay.length ? byName.filter((ev) => onDay.includes(ev)) : byName
  return pool.length === 1 ? pool[0] : null
}

/** "Pot roast, Drinks and Dessert". */
export function listed(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}
