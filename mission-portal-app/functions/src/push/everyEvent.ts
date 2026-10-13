/**
 * A reminder before every one of their events — "remind me to pray an hour
 * before every event" — one reminder, set by asking Miriam, that comes round
 * before each event they are on, those added later too. It is kept as one
 * reminder (shown as one in their tasks), its time always the next of them:
 * sendDueReminders moves it on as each is sent, and refreshEveryEventReminders
 * keeps it right as events are added, moved or called off.
 *
 * Kept free of Firebase, for tests (src/lib/everyEvent.test.ts in the app).
 */
import { assignedTo, instancesOf, shiftDate, type EventTemplate, type Group } from '../miriam/data'
import { clockOf, zonedParts, zonedTime } from './reminderTime'

/** As it is kept: before each event by so many minutes, or so many days before at an hour. */
export interface EveryEventRule {
  uid: string
  tz?: string
  /** "An hour before": 60. Counted from the start, so an event without a time has none. */
  minutesBefore?: number
  /** "The day before": 1; "the morning of": 0 — at `atHour`. */
  daysBefore?: number
  atHour?: number
  /** The events it has been sent for lately, never sent again. */
  sentKeys?: string[]
}

export interface NextBeforeEvent {
  remindAt: number
  eventKey: string
  eventTemplateId: string
  eventTitle: string
}

/** How far ahead the next of their events is looked for. */
const AHEAD_DAYS = 120

/** An event as it is kept: the template, with its dates' own changes. */
export type StoredEvent = EventTemplate & { overrides?: Record<string, Partial<EventTemplate>> }

const validZone = (tz: string | undefined): string => {
  if (!tz) return 'UTC'
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return tz
  } catch {
    return 'UTC'
  }
}

/** When it comes before this event, in ms; null when it can't (no start time, for one by minutes). */
export function beforeEventAt(
  rule: EveryEventRule,
  date: string,
  startTime?: string
): number | null {
  const tz = validZone(rule.tz)
  const [y, m, d] = date.split('-').map(Number)
  if (typeof rule.minutesBefore === 'number') {
    const clock = clockOf(startTime)
    if (!clock) return null
    return zonedTime(y, m, d, clock.h, clock.min, tz) - rule.minutesBefore * 60_000
  }
  return zonedTime(y, m, d - (rule.daysBefore ?? 0), rule.atHour ?? 9, 0, tz)
}

/**
 * The next of their events it comes before, after `after`: the events they
 * are on, published, by their start (a later day of a multi-day event is
 * the same event) — and not one it has been sent for already.
 */
export function nextBeforeEvent(
  rule: EveryEventRule,
  events: StoredEvent[],
  groups: Group[],
  after: number
): NextBeforeEvent | null {
  const p = zonedParts(after, validZone(rule.tz))
  const today = `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`
  // From yesterday, for a time zone behind the server's day; far enough on for days before.
  const from = shiftDate(today, -1)
  const to = shiftDate(today, AHEAD_DAYS)
  const sent = new Set(rule.sentKeys ?? [])
  let best: NextBeforeEvent | null = null
  for (const { overrides, ...tmpl } of events) {
    for (const ev of instancesOf(tmpl as EventTemplate, from, to, overrides ?? {})) {
      if (ev.unpublished === true || /_d\d+$/.test(ev.instanceKey) || sent.has(ev.instanceKey)) {
        continue
      }
      if (!assignedTo(ev, groups).has(String(rule.uid))) continue
      const at = beforeEventAt(rule, ev.date, ev.startTime)
      if (at === null || at <= after) continue
      if (!best || at < best.remindAt) {
        best = {
          remindAt: at,
          eventKey: ev.instanceKey,
          eventTemplateId: String(ev.templateId),
          eventTitle: ev.title,
        }
      }
    }
  }
  return best
}

/** "1 hour", "30 minutes", "2 days". */
function span(minutes: number): string {
  if (minutes >= 1440 && minutes % 1440 === 0) {
    const d = minutes / 1440
    return `${d} ${d === 1 ? 'day' : 'days'}`
  }
  if (minutes >= 60 && minutes % 60 === 0) {
    const h = minutes / 60
    return `${h} ${h === 1 ? 'hour' : 'hours'}`
  }
  return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`
}

/** What its push says: "Pray — Youth Night starts in 1 hour", "Youth Retreat is tomorrow". */
export function beforeEventSaid(
  rule: EveryEventRule & { text?: string },
  eventTitle: string
): string {
  const when =
    typeof rule.minutesBefore === 'number'
      ? rule.minutesBefore > 0
        ? `starts in ${span(rule.minutesBefore)}`
        : 'is starting'
      : (rule.daysBefore ?? 0) === 0
        ? 'is today'
        : rule.daysBefore === 1
          ? 'is tomorrow'
          : `is in ${rule.daysBefore} days`
  const text = (rule.text ?? '').trim()
  return `${text ? `${text} — ` : ''}${eventTitle} ${when}`
}

/** The events it was sent for, with this one: the latest few kept. */
export function sentWith(sentKeys: string[] | undefined, key: string | undefined): string[] {
  return [...(sentKeys ?? []).filter((k) => k !== key), ...(key ? [key] : [])].slice(-20)
}
