import { allInstances } from './events'
import type { EventInstance, EventTemplate } from '@/types/events'

/**
 * The event a notification's words name — "You've been added to Revive Me",
 * "Reminder: Youth Night is coming up" — among those this person has:
 * the longest title said in it, so "Revive Me Again" isn't taken for "Revive
 * Me". Its next date, from today; else its last. Null when no title is said.
 */
export function eventNamed(
  said: string,
  templates: EventTemplate[],
  overrides: Record<string, Partial<EventTemplate>>,
  today: string
): EventInstance | null {
  const text = ` ${plain(said)} `
  const named = templates
    .filter((t) => {
      const title = plain(t.title ?? '')
      return title.length >= 2 && text.includes(` ${title} `)
    })
    .sort((a, b) => plain(b.title ?? '').length - plain(a.title ?? '').length)
  if (!named.length) return null
  const longest = plain(named[0].title ?? '').length
  const these = named.filter((t) => plain(t.title ?? '').length === longest)
  const next = allInstances(these, overrides, today, '9999-12-31')[0]
  if (next) return next
  // Its last date: looked for over the two years before, not from the dawn of time —
  // a weekly one's dates are counted forward from where they start, a hundred or so.
  const past = allInstances(these, overrides, yearsBefore(today, 2), today)
  return past[past.length - 1] ?? null
}

/** Lowercase words, apostrophes and punctuation aside: "Revive Me!" — "revive me". */
const plain = (s: string) =>
  s
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** The day `n` years before this one, YYYY-MM-DD. */
const yearsBefore = (day: string, n: number) => `${Number(day.slice(0, 4)) - n}${day.slice(4)}`
