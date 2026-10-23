import { displayToIso } from '@/lib/eventDates'
import type { NotificationPrefs } from '@/types/user'

/**
 * A sale at the Elim Store, announced at the top of the store tab.
 *
 * One document per sale in `storeSales`, rather than a field on the store's
 * content, for the same reason livestream cards are documents: a new sale is
 * a document being created, which is what the notification to subscribers
 * fires on (functions/src/push/storeSaleNotifications.ts). Correcting a sale's
 * wording is an update, and wakes nobody a second time.
 */
export interface StoreSale {
  id: string
  message: string
  /** The last day of the sale, as YYYY-MM-DD — what people are told. */
  endsOn: string
  /** The end of that day where it was set, in ms — when the sale disappears. */
  endsAt: number
  createdAt: number
  createdBy?: string
}

/** A sale as stored, read defensively: a field missing reads as empty, not as a crash. */
export function saleFrom(id: string, x: Record<string, unknown>): StoreSale {
  return {
    id,
    message: String(x.message ?? ''),
    endsOn: String(x.endsOn ?? ''),
    endsAt: Number(x.endsAt ?? 0),
    createdAt: Number(x.createdAt ?? 0),
    createdBy: x.createdBy ? String(x.createdBy) : undefined,
  }
}

/** The end of a calendar day in this device's time zone, in ms. */
export function endOfDay(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime()
}

/** The sale to show now: the newest one that has not ended, or null. */
export function activeSale(sales: StoreSale[], now: number = Date.now()): StoreSale | null {
  return (
    sales
      .filter((s) => s.message.trim() && s.endsAt > now)
      .sort((a, b) => b.createdAt - a.createdAt)[0] ?? null
  )
}

function localDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/**
 * When the sale ends, as it is said to people.
 *
 * "today" and "tomorrow" when it is that close, because a date read on the day
 * it falls is a sum to work out; otherwise the weekday and date, which is
 * what someone deciding whether to buy now needs.
 */
export function saleEndsLabel(endsOn: string, now: Date = new Date()): string {
  const end = localDate(endsOn)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const days = Math.round((end.getTime() - today.getTime()) / 86_400_000)
  if (days === 0) return 'Ends today'
  if (days === 1) return 'Ends tomorrow'
  const sameYear = end.getFullYear() === now.getFullYear()
  return `Ends ${end.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  })}`
}

/**
 * Check a sale as an admin typed it, returning its end date or what is wrong.
 *
 * The date is typed MM/DD/YY, as the event form takes dates, and has to be
 * today or later: a sale ending yesterday would be posted, notify everyone
 * who asked, and never be seen.
 */
export function readSale(
  message: string,
  endDate: string,
  now: Date = new Date()
): { endsOn: string; endsAt: number } | { error: string } {
  if (!message.trim()) return { error: 'Write the sale message.' }
  const endsOn = displayToIso(endDate.trim())
  // displayToIso lets 02/31 through; a day that rolls into the next month is
  // not the day that was meant.
  if (!endsOn || localDate(endsOn).getDate() !== Number(endsOn.slice(8))) {
    return { error: 'Enter the last day of the sale as MM/DD/YY.' }
  }
  const endsAt = endOfDay(endsOn)
  if (endsAt <= now.getTime()) return { error: 'The last day of the sale has already passed.' }
  return { endsOn, endsAt }
}

/**
 * Has this person asked to hear about new sales?
 *
 * Opt-in, like stream alerts: the preference is absent until someone says
 * yes, and absent means no. Nobody is sent a push about a sale they never
 * asked to be told about.
 */
export function wantsSaleNotifications(
  prefs: Partial<NotificationPrefs> | null | undefined
): boolean {
  return prefs?.storeSale?.push === true
}
