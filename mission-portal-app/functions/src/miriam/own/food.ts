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
