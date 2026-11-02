import {
  assignedTo,
  availKey,
  instancesOf,
  shiftDate,
  type EventTemplate,
  type Group,
} from './miriam/data'

/**
 * Dates someone has blocked off — a vacation, a work trip, a family thing,
 * whatever it is — and what they mean for their availability.
 *
 * A block is a record of its own (blockedDates/{id}: uid, from, to, reason),
 * not a set of answers: so it answers "Not available" for every event of
 * theirs in those days — the ones there now, and any made, moved or put them
 * on later (./blockedDatesSync). Lifted, the answers it gave are taken back,
 * and any it replaced put back.
 *
 * An answer it gives says so — `source: 'blocked'`, and which block — so the
 * app can show it for what it is, and a block's own answers are all a lifted
 * block takes back: one changed since, by hand, is theirs.
 *
 * Kept free of Firebase: the app's tests and screens import it.
 */
export interface Block {
  id: string
  uid: string
  /** YYYY-MM-DD, the first day off. */
  from: string
  /** YYYY-MM-DD, the last day off. */
  to: string
  /** Why, in their words: "Vacation". May be "". */
  reason: string
}

/** The longest a block may run: a year. Longer than that is a mistake, or leaving. */
export const MAX_BLOCK_DAYS = 366

/** The reason the answers a block gives carry, when none was given. */
export const BLOCKED_NOTE = 'Blocked off'

/** The note on each answer a block gives. */
export const blockNote = (b: Pick<Block, 'reason'>) => b.reason.trim() || BLOCKED_NOTE

export const isDay = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)

/** Days from one date to another, counting both: Nov 17 – Nov 21 is 5. */
export function daysIn(from: string, to: string): number {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10))
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10))
  return Math.round((b - a) / 86400000) + 1
}

/** What's wrong with a block as asked for, or null: the app's form and Miriam say it. */
export function blockProblem(from: unknown, to: unknown, today: string): string | null {
  if (!isDay(from) || !isDay(to)) return 'Pick the first and last day.'
  if (to < from) return 'The last day is before the first.'
  if (to < today) return 'Those days have already gone.'
  if (daysIn(from, to) > MAX_BLOCK_DAYS)
    return 'That’s more than a year — block off a year at most.'
  return null
}

/** A record as read, if it is one: anything else is passed over. */
export function blockOf(id: string, data: unknown): Block | null {
  const d = (data ?? {}) as Record<string, unknown>
  if (typeof d.uid !== 'string' || !d.uid || !isDay(d.from) || !isDay(d.to) || d.to < d.from) {
    return null
  }
  return { id, uid: d.uid, from: d.from, to: d.to, reason: String(d.reason ?? '') }
}

/** Whether a day falls in a block. */
export const blockCovers = (b: Pick<Block, 'from' | 'to'>, day: string) =>
  day >= b.from && day <= b.to

/** The days of a block still to come: from today (or its first day, if later) to its last. */
export function daysAhead(b: Pick<Block, 'from' | 'to'>, today: string) {
  const from = b.from > today ? b.from : today
  const to = b.to < shiftDate(from, MAX_BLOCK_DAYS) ? b.to : shiftDate(from, MAX_BLOCK_DAYS)
  return from <= to ? { from, to } : null
}

/**
 * The availability records (avail/{key}) a block answers for on one event:
 * each of its dates in the block, from today on, that the person is on.
 * Not a draft's — nobody answers for one until it is published, and then
 * it is written, and this is asked again.
 *
 * `ev` is the event as the app reads it — its private record over its own
 * (../eventPrivate mergeEvent) — with `overrides`, its dates' changes.
 */
export function blockedKeys(
  ev: EventTemplate & { overrides?: Record<string, Partial<EventTemplate>> },
  block: Block,
  groups: Group[],
  today: string
): string[] {
  if (ev.unpublished === true || ev.deleted) return []
  const days = daysAhead(block, today)
  if (!days) return []
  return instancesOf(ev, days.from, days.to, ev.overrides ?? {})
    .filter((inst) =>
      // Groups by their id as text: an old event may hold one as a number.
      assignedTo({ ...inst, groups: (inst.groups ?? []).map(String) }, groups).has(block.uid)
    )
    .map(availKey)
}

/** The date an availability record is for: `<eventId>_<date>[_dN]`; null for `_series`. */
export function dateOfKey(key: string): string | null {
  const m = /_(\d{4}-\d{2}-\d{2})(?:_d\d+)?$/.exec(key)
  return m ? m[1] : null
}

/** An answer as the availability record keeps it (lib/availability AvailResponse). */
export interface Answer {
  status: 'yes' | 'no' | 'partial' | 'tbd'
  note: string
  uid: string
  ts: number
  source?: 'instance' | 'series' | 'blocked'
  /** The block that gave it. */
  block?: string
  /** What they had said before the block answered for them: put back when it is lifted. */
  was?: Omit<Answer, 'was'>
}

/**
 * The answer a block gives on one date, given what is there now — or null
 * to leave that be:
 *
 * - its own answer already there: left;
 * - nothing there: "Not available", with the block's reason;
 * - another answer, when the block is new (`replace`): replaced, and kept
 *   to put back — they blocked these days off, whatever they had said; but
 *   not another block's, which says the same;
 * - another answer, for an event made or changed since (not `replace`):
 *   left — they answered it after blocking the days off, and that stands.
 */
export function blockAnswer(
  block: Block,
  existing: Answer | null | undefined,
  replace: boolean,
  now: number
): Answer | null {
  if (existing?.block === block.id) return null
  if (existing && (!replace || existing.source === 'blocked')) return null
  const answer: Answer = {
    status: 'no',
    note: blockNote(block),
    uid: block.uid,
    ts: now,
    source: 'blocked',
    block: block.id,
  }
  if (existing) {
    const { was: _was, ...before } = existing
    answer.was = before
  }
  return answer
}

/**
 * What lifting a block does to one answer: puts back what it replaced, or
 * clears it — 'clear' — or, when it is no longer the block's (changed by
 * hand since), leaves it: null.
 */
export function liftAnswer(blockId: string, existing: Answer | null | undefined) {
  if (!existing || existing.block !== blockId) return null
  return existing.was ?? ('clear' as const)
}

/** "Nov 17 – 21", "Nov 30 – Dec 2", "Nov 17": a block's days, short. */
export function blockSpan(b: Pick<Block, 'from' | 'to'>): string {
  const f = new Date(`${b.from}T12:00:00Z`)
  const t = new Date(`${b.to}T12:00:00Z`)
  const month = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
  const year = (d: Date) => d.getUTCFullYear()
  if (b.from === b.to) return `${month(f)} ${f.getUTCDate()}`
  if (year(f) !== year(t)) {
    return `${month(f)} ${f.getUTCDate()}, ${year(f)} – ${month(t)} ${t.getUTCDate()}, ${year(t)}`
  }
  if (month(f) === month(t)) return `${month(f)} ${f.getUTCDate()} – ${t.getUTCDate()}`
  return `${month(f)} ${f.getUTCDate()} – ${month(t)} ${t.getUTCDate()}`
}
