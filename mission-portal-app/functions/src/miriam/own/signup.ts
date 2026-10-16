import { shiftDate, type EventInstance } from '../data'
import type { Lookups } from '../lookups'
import type { AppToolName } from '../plan'
import { said, type OwnResult } from './answers'
import type { Mention } from './events'
import { dishSaid, elsewhereIn, FOOD_AHEAD_DAYS, foodItemPicked, hasSheet, namesItem } from './food'
import { dayIn } from './when'

/**
 * A food sign-up she read (./skills: food_signup) and passed her guards
 * (./guards: an offer of their own, now), worked out as the phone would
 * work it out (src/features/miriam/localTalk: foodHere): which event's
 * sheet, and which item on it.
 *
 * Only when it is all plain: a dish said, and nothing after it but the
 * event and when ("to my son's game on Sunday" is somewhere else); one
 * event with a sheet — by its name, the day said, or (not acted on yet) the
 * one whose sheet has that dish; one item on its sheet named by the dish in
 * whole words ("ham" is not "Hamburgers"), and named there once. Then the same change Claude would offer (sign_up_food), for the app
 * to show and them to confirm; or, when the item is already theirs or
 * someone else's, said so. Anything else is Claude's: null.
 */

export interface SignupContext {
  text: string
  /** As she read it: each event's name as "the event" (./events). */
  masked: string
  today: string
  mentions: Mention[]
  lookups: Lookups
  viewer: { uid: string }
  appTools: readonly AppToolName[]
}

/** How the event was told: named, the day said, or the only one whose sheet has the dish. */
export type SignupRule = 'named' | 'day' | 'uniqueDish'

/** What she would do, without the words said: for the logs, beside what Claude does. */
export interface SignupWould {
  kind: 'confirm' | 'theirs' | 'taken'
  rule: SignupRule
  event_key: string
  item: string
}

export interface Signup {
  result: OwnResult | null
  would: SignupWould | null
  /** Why, for the logs: "confirm", "no dish", "2 events", … */
  why: string
}

const none = (why: string): Signup => ({ result: null, would: null, why })

/**
 * The item on a sheet the dish names, by its place there; -1 when none is
 * plainly it. Its name there once: the app finds an item by its name
 * (src/lib/miriamActions: foodItemFor).
 */
function itemNamed(items: string[], dish: string): number {
  const picked = foodItemPicked(items, dish)
  if (picked.kind !== 'sure') return -1
  const label = items[picked.item]
  if (!namesItem(label, dish)) return -1
  const first = items.findIndex((l) => l.trim().toLowerCase() === label.trim().toLowerCase())
  return first === picked.item ? picked.item : -1
}

/** The event meant, of those with a sheet ahead, and how it was told; or why not. */
function eventMeant(
  ctx: SignupContext,
  withSheet: EventInstance[],
  dish: string
): { ev: EventInstance; rule: SignupRule } | { why: string } {
  const day = dayIn(ctx.text, ctx.today)
  const titles = ctx.mentions.flatMap((m) => m.titles)
  // One event: a weekly one, its next (soonest first: Lookups.eventsBetween);
  // on a day said, that day's alone. Two of one name are two events.
  const one = (evs: EventInstance[], rule: SignupRule, onDay: boolean) => {
    const events = new Set(evs.map((ev) => String(ev.templateId)))
    if (events.size === 1 && (!onDay || evs.length === 1)) return { ev: evs[0], rule }
    return { why: evs.length === 0 ? `no sheet (${rule})` : `${evs.length} events (${rule})` }
  }
  if (titles.length > 0) {
    const named = withSheet.filter((ev) => titles.includes(ev.title))
    return day
      ? one(
          named.filter((ev) => ev.date === day),
          'named',
          true
        )
      : one(named, 'named', false)
  }
  if (day)
    return one(
      withSheet.filter((ev) => ev.date === day),
      'day',
      true
    )
  // Nothing said of which: the only event whose sheet names the dish.
  return one(
    withSheet.filter((ev) => itemNamed(ev.foodItems ?? [], dish) >= 0),
    'uniqueDish',
    false
  )
}

export async function foodSignup(ctx: SignupContext): Promise<Signup> {
  if (!ctx.appTools.includes('sign_up_food')) return none('no tool')
  const spoken = dishSaid(ctx.masked)
  if (!spoken) return none('no dish')
  const { dish, after } = spoken
  // "To my son's soccer game on Sunday", "for my family", "next week": not
  // only the event and when — somewhere, or some time, she can't place.
  if (elsewhereIn(after)) return none('more said than the event and when')
  // Ahead, with a sheet — and the first day of one over several, the key the app finds it by.
  const withSheet = (
    await ctx.lookups.eventsBetween(ctx.today, shiftDate(ctx.today, FOOD_AHEAD_DAYS))
  ).filter((ev) => hasSheet(ev) && !/_d\d+$/.test(ev.instanceKey))
  const meant = eventMeant(ctx, withSheet, dish)
  if ('why' in meant) return none(meant.why)
  const { ev, rule } = meant

  const { items, signups } = await ctx.lookups.foodSheet(ev)
  const at = itemNamed(items, dish)
  if (at < 0) return none('no item plainly named')
  const label = items[at]

  const would = (kind: SignupWould['kind']): SignupWould => ({
    kind,
    rule,
    event_key: ev.instanceKey,
    item: label,
  })
  const by = signups[String(at)]
  if (by && String(by.uid) === String(ctx.viewer.uid)) {
    return {
      result: said(`You’re already bringing ${label} for ${ev.title}.`, {
        kind: 'event',
        key: ev.instanceKey,
        section: 'food',
      }),
      would: would('theirs'),
      why: 'theirs',
    }
  }
  if (by) {
    const who = by.displayName || (await ctx.lookups.names()).get(String(by.uid)) || 'Someone'
    const open = items.filter((item, i) => item.trim() && !signups[String(i)])
    return {
      result: said(
        `${who} is already bringing ${label} for ${ev.title}. ${
          open.length ? `Still open: ${open.join(', ')}.` : 'Nothing else is open.'
        }`,
        { kind: 'event', key: ev.instanceKey, section: 'food' }
      ),
      would: would('taken'),
      why: 'taken',
    }
  }
  return {
    result: {
      kind: 'confirm',
      name: 'sign_up_food',
      input: { event_key: ev.instanceKey, item: label },
      more: false,
    },
    would: would('confirm'),
    why: 'confirm',
  }
}
