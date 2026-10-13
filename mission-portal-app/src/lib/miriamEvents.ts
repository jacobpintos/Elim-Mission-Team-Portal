import {
  assignedTo,
  findEvents,
  shiftDate,
  titleMatch,
  type EventInstance,
} from '../../functions/src/miriam/data'
import type { QuickData } from './miriamQuick'
import type { Picked } from './miriamReplies'

/**
 * Which upcoming event was meant, by a day ("Friday"), words naming it ("the
 * retreat"), or both — among those this person can see, the ones they are on
 * before the rest, and a weekly one by its next date. Plainly one (sure),
 * probably one (likely: asked about), several alike (which), or none.
 *
 * Nothing said at all is none: what is meant then is for the conversation to
 * decide (the next one they haven't answered for, say).
 */
export function eventPick(
  ask: { date: string | null; name: string },
  data: QuickData,
  opts: {
    /** How far ahead to look, in days. */
    ahead?: number
    /** Only events of this kind: with a carpool, say. */
    only?: (ev: EventInstance) => boolean
  } = {}
): Picked<EventInstance> {
  const { templates, overrides, groups, viewer, today } = data
  const name = ask.name.trim()
  if (!ask.date && !name) return { kind: 'none' }
  const found = findEvents(templates, overrides, groups, viewer, name, today, ask.date ?? '', 400)
    .filter((ev) => ev.date >= today && ev.date <= shiftDate(today, opts.ahead ?? 180))
    .filter((ev) => !opts.only || opts.only(ev))
  if (found.length === 0) return { kind: 'none' }
  const mine = found.filter((ev) => assignedTo(ev, groups).has(viewer.uid))
  // The nearest date of each event.
  const seen = new Set<string>()
  const nearest = [...(mine.length ? mine : found)]
    .sort((a, b) => a.date.localeCompare(b.date))
    .filter((ev) => {
      const id = String(ev.templateId)
      if (seen.has(id)) return false
      seen.add(id)
      return true
    })

  if (!name) {
    // A day alone: the one on it, or which of those that are.
    return nearest.length === 1
      ? { kind: 'sure', item: nearest[0] }
      : { kind: 'which', items: nearest.slice(0, 3) }
  }
  const named = (ev: EventInstance) => [ev.title, ev.city, ev.location].filter(Boolean).join(' ')
  const scored = nearest
    .map((ev) => ({ ev, score: titleMatch(named(ev), name) }))
    .sort((a, b) => b.score - a.score || a.ev.date.localeCompare(b.ev.date))
  const [best, second] = scored
  if (!second || best.score - second.score >= 0.2) {
    return best.score >= 0.8
      ? { kind: 'sure', item: best.ev }
      : { kind: 'likely', item: best.ev, others: scored.slice(1, 3).map((x) => x.ev) }
  }
  return {
    kind: 'which',
    items: scored
      .filter((x) => best.score - x.score < 0.2)
      .slice(0, 3)
      .map((x) => x.ev),
  }
}

/** When an event is, as said in a question: "Friday", "today", "Sunday, Oct 18". */
export function eventDay(ev: EventInstance, today: string): string {
  if (ev.date === today) return 'today'
  if (ev.date === shiftDate(today, 1)) return 'tomorrow'
  return new Date(`${ev.date}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'long',
    ...(ev.date > shiftDate(today, 6) ? { month: 'short', day: 'numeric' } : {}),
  })
}

/** "Youth Night on Friday", "Sunday Service today": an event, named for a question about it. */
export function eventCalled(ev: EventInstance, today: string): string {
  const day = eventDay(ev, today)
  return /^(?:today|tomorrow)$/.test(day) ? `${ev.title} ${day}` : `${ev.title} on ${day}`
}
