import { shiftDate, type EventInstance } from '../data'
import type { Lookups } from '../lookups'
import type { AppToolName } from '../plan'
import { said, type OwnResult } from './answers'
import type { Mention } from './events'
import { dishIn, FOOD_AHEAD_DAYS, foodItemPicked, hasSheet } from './food'
import { dayIn } from './when'

/**
 * A food sign-up she read (./skills: food_signup) and passed her guards
 * (./guards: an offer of their own, now), worked out as the phone would
 * work it out (src/features/miriam/localTalk: foodHere): which event's
 * sheet, and which item on it.
 *
 * Only when it is all plain: a dish said, one event with a sheet — by its
 * name, the day said, or (not acted on yet) the one whose sheet has that
 * dish — one item on its sheet that is plainly the dish, its name there
 * once. Then the same change Claude would offer (sign_up_food), for the app
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

/** The event meant, of those with a sheet ahead, and how it was told; or why not. */
function eventMeant(
  ctx: SignupContext,
  withSheet: EventInstance[],
  dish: string
): { ev: EventInstance; rule: SignupRule } | { why: string } {
  const day = dayIn(ctx.text, ctx.today)
  const titles = ctx.mentions.flatMap((m) => m.titles)
  // Soonest first (Lookups: eventsBetween): a weekly one named is its next.
  const one = (evs: EventInstance[], rule: SignupRule) => {
    const distinct = new Set(evs.map((ev) => ev.title))
    if (distinct.size === 1) return { ev: evs[0], rule }
    return { why: distinct.size === 0 ? `no sheet (${rule})` : `${distinct.size} events (${rule})` }
  }
  if (titles.length > 0) {
    const named = withSheet.filter((ev) => titles.includes(ev.title))
    return one(day ? named.filter((ev) => ev.date === day) : named, 'named')
  }
  if (day)
    return one(
      withSheet.filter((ev) => ev.date === day),
      'day'
    )
  // Nothing said of which: the only event whose sheet plainly has the dish.
  return one(
    withSheet.filter((ev) => foodItemPicked(ev.foodItems ?? [], dish).kind === 'sure'),
    'uniqueDish'
  )
}

export async function foodSignup(ctx: SignupContext): Promise<Signup> {
  if (!ctx.appTools.includes('sign_up_food')) return none('no tool')
  const dish = dishIn(ctx.masked)
  if (!dish) return none('no dish')
  // Ahead, with a sheet — and the first day of one over several, the key the app finds it by.
  const withSheet = (
    await ctx.lookups.eventsBetween(ctx.today, shiftDate(ctx.today, FOOD_AHEAD_DAYS))
  ).filter((ev) => hasSheet(ev) && !/_d\d+$/.test(ev.instanceKey))
  const meant = eventMeant(ctx, withSheet, dish)
  if ('why' in meant) return none(meant.why)
  const { ev, rule } = meant

  const { items, signups } = await ctx.lookups.foodSheet(ev)
  const picked = foodItemPicked(items, dish)
  if (picked.kind !== 'sure') return none(`item ${picked.kind}`)
  const label = items[picked.item]
  // Its name there once: the app finds an item by its name (src/lib/miriamActions: foodItemFor).
  const at = items.findIndex((l) => l.trim().toLowerCase() === label.trim().toLowerCase())
  if (at !== picked.item) return none('item named twice')

  const would = (kind: SignupWould['kind']): SignupWould => ({
    kind,
    rule,
    event_key: ev.instanceKey,
    item: label,
  })
  const by = signups[String(picked.item)]
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
