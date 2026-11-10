/**
 * Who is told what when a record changes: worked out here, on the server,
 * from the record as it was and as it is (./recordNotifications).
 *
 * The app used to ask for these itself, through a `sendNotification`
 * function that sent whatever it was handed to whoever it named. Anyone
 * signed in could call it, so anyone could send any notification, in any
 * words, to anyone. Now nothing a notification says, and nobody it goes to,
 * comes from the app: only from what was written, which the rules have
 * already checked.
 *
 * Kept free of Firebase, for tests (src/lib/recordTellings.test.ts in the app).
 */
import type { NotificationType } from './notifyCore'
import { ADMINS, SETTLED_QUIETLY } from '../eventPrivate'

type Doc = Record<string, unknown>

/** One notification: to a person, or to every admin. */
export interface Telling {
  to: string | typeof ADMINS
  type: NotificationType
  data: Record<string, unknown>
}

const str = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '')
const list = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.map(str).filter(Boolean))] : []

// --- Tasks ------------------------------------------------------------------

/**
 * Tasks whose own steps tell people: a reimbursement's (its callables), a
 * meeting request's (sendMeetingRequest), and a set list to acknowledge (the
 * set list's own announcement).
 */
const TOLD_ELSEWHERE = new Set(['reimbursement', 'meeting_request', 'worship_setlist_ack'])

/** Completed by a step of its own, which says so itself, or to nobody. */
const QUIET_WHEN_DONE = new Set(['reimbursement', 'kaizen_verification', 'worship_setlist_ack'])

/** "[Issue #12] Replace the cable" → "Replace the cable": what the issue's notification names. */
const withoutIssueTag = (title: string) => title.replace(/^\[Issue #[^\]]*\]\s*/, '')

/** A task given to someone: an issue's corrective action says it is one. */
function assigned(task: Doc, taskId: string, uid: string): Telling {
  const title = str(task.title) || 'New task'
  if (task.taskType === 'issue_corrective') {
    return {
      to: uid,
      type: 'issueAssigned',
      data: { title: withoutIssueTag(title), issueId: str(task.issueId), taskId },
    }
  }
  return { to: uid, type: 'newAssignment', data: { taskId, taskTitle: title } }
}

/**
 * A task made, handed to more people, finished, or fallen behind.
 *
 * - Made, or given to someone new: each of them is told.
 * - Finished: whoever made it is told, unless they finished it themselves
 *   (`doneBy`, which the app writes with 'done'; an app from before doesn't,
 *   and then they are told unless the task was theirs alone).
 * - Fallen behind: every admin.
 */
export function taskTellings(before: Doc | undefined, after: Doc, taskId: string): Telling[] {
  const out: Telling[] = []
  const type = str(after.taskType)
  const title = str(after.title) || 'A task'

  if (!TOLD_ELSEWHERE.has(type)) {
    const had = new Set(before ? list(before.assignees) : [])
    for (const uid of list(after.assignees)) {
      if (!had.has(uid)) out.push(assigned(after, taskId, uid))
    }
  }
  if (!before) return out

  if (after.status === 'done' && before.status !== 'done' && !QUIET_WHEN_DONE.has(type)) {
    const by = str(after.by)
    const doneBy = str(after.doneBy)
    const assignees = list(after.assignees)
    const theirsAlone = assignees.length === 1 && assignees[0] === by
    if (by && (doneBy ? doneBy !== by : !theirsAlone)) {
      out.push({ to: by, type: 'taskComplete', data: { taskId, taskTitle: title } })
    }
  }
  if (after.status === 'behind' && before.status !== 'behind') {
    out.push({ to: ADMINS, type: 'eventHealthBehind', data: { taskId, taskTitle: title } })
  }
  return out
}

// --- Events: who is on them, and what they are given --------------------------

/** The people in a private record's `access`: not the marker for every admin. */
export const peopleIn = (access: unknown): string[] => list(access).filter((a) => a !== ADMINS)

/**
 * Whether an `access` is a draft's: its maker alone, or — its maker not
 * known — the admins alone (../eventPrivate draftReaders). A published
 * event's always names the admins beside those on it; one with nobody on it
 * reads the same as a draft here, and has nobody to tell either way.
 */
export function draftAccess(access: unknown): boolean {
  const all = list(access)
  return !all.includes(ADMINS) || all.length === 1
}

interface Car {
  label?: unknown
  driver?: unknown
  riders?: unknown
}
interface Lodging {
  name?: unknown
  room?: unknown
  assignees?: unknown
}
interface Flight {
  uid?: unknown
  outAirline?: unknown
  outFlight?: unknown
}

const LOGISTICS = ['lodgingEntries', 'flightEntries', 'carpoolCars'] as const

/**
 * Everything a person can be handed on an event, as "uid|label": the same
 * person given two things is two entries, the same thing twice is one.
 * (As the app's own, src/lib/guestItinerary logisticsFor.)
 */
function logisticsOf(part: Doc): Map<string, { uid: string; label: string }> {
  const out = new Map<string, { uid: string; label: string }>()
  const add = (uid: unknown, label: string) => {
    const u = str(uid)
    if (u) out.set(`${u}|${label}`, { uid: u, label })
  }
  for (const l of (Array.isArray(part.lodgingEntries) ? part.lodgingEntries : []) as Lodging[]) {
    const name = str(l?.name)
    const label = str(l?.room) ? `${name}, room ${str(l.room)}` : name
    list(l?.assignees).forEach((a) => add(a, label))
  }
  for (const f of (Array.isArray(part.flightEntries) ? part.flightEntries : []) as Flight[]) {
    add(f?.uid, [str(f?.outAirline), str(f?.outFlight)].filter(Boolean).join(' ') || 'A flight')
  }
  for (const c of (Array.isArray(part.carpoolCars) ? part.carpoolCars : []) as Car[]) {
    const label = str(c?.label) ? `Carpool: ${str(c.label)}` : 'A carpool seat'
    add(c?.driver, label)
    list(c?.riders).forEach((r) => add(r, label))
  }
  return out
}

const overridesOf = (d: Doc | undefined): Record<string, Doc> =>
  d?.overrides && typeof d.overrides === 'object' ? (d.overrides as Record<string, Doc>) : {}

/** One date's travel details: its own where it has them, else the event's. */
function dateLogistics(event: Doc, own: Doc | undefined): Doc {
  const out: Doc = {}
  for (const k of LOGISTICS) out[k] = own?.[k] ?? event[k]
  return out
}

/** A flight, room or carpool seat newly given: to whom, what, and on which date ('' for every date). */
export interface Given {
  uid: string
  itemLabel: string
  dateKey: string
}

/**
 * What people were newly given on an event: on the event itself, and on any
 * date changed apart from it. A date's own are compared with what that date
 * had before, which is the event's until the date is changed: so a date
 * first changed for some other reason, which copies the event's across,
 * gives nobody anything new.
 *
 * `before` null: all of it is new (an event just made, or just published).
 */
export function newlyGiven(before: Doc | null, after: Doc): Given[] {
  const out: Given[] = []
  const seen = new Set<string>()
  const diff = (was: Doc | null, now: Doc, dateKey: string) => {
    const had = was ? logisticsOf(was) : new Map()
    for (const [key, { uid, label }] of logisticsOf(now)) {
      if (had.has(key) || seen.has(key)) continue
      seen.add(key)
      out.push({ uid, itemLabel: label, dateKey })
    }
  }
  diff(before, after, '')
  const wasDates = overridesOf(before ?? undefined)
  for (const [dateKey, own] of Object.entries(overridesOf(after))) {
    if (!own || typeof own !== 'object') continue
    if (!LOGISTICS.some((k) => own[k] !== undefined)) continue
    diff(
      before ? dateLogistics(before, wasDates[dateKey]) : null,
      dateLogistics(after, own),
      dateKey
    )
  }
  return out
}

/** What an event's private record changing tells people. */
export interface EventTellings {
  joined: string[]
  removed: string[]
  given: Given[]
}

/**
 * An event's private record written (eventPrivate/{id}): who was put on the
 * event, who was taken off, and what anyone was given.
 *
 * - A draft tells no one.
 * - Just made, already published: those given something are told of it; nobody
 *   is told they were added (the app never has).
 * - Just published: everyone on it is told, as newly added, and of all they
 *   were given.
 * - Who is on it put right without the event having been changed (a group's
 *   members changed: ../eventPrivate SETTLED_QUIETLY): nobody is told they
 *   were added or taken off.
 * - Deleted: nobody (`after` undefined).
 */
export function eventTellings(before: Doc | undefined, after: Doc | undefined): EventTellings {
  const none: EventTellings = { joined: [], removed: [], given: [] }
  if (!after || draftAccess(after.access)) return none
  const on = peopleIn(after.access)
  if (!before) return { ...none, given: newlyGiven(null, after) }
  if (draftAccess(before.access)) return { joined: on, removed: [], given: newlyGiven(null, after) }
  const given = newlyGiven(before, after)
  if (before[SETTLED_QUIETLY] !== after[SETTLED_QUIETLY]) return { ...none, given }
  const was = peopleIn(before.access)
  return {
    joined: on.filter((u) => !was.includes(u)),
    removed: was.filter((u) => !on.includes(u)),
    given,
  }
}

// --- Availability ------------------------------------------------------------

const AVAIL_SAID: Record<string, string> = {
  no: 'not available',
  partial: 'partial',
  tbd: 'tbd',
}

/** An answer still fresh enough to be news: one put back when a block is lifted is as old as it was. */
export const FRESH_ANSWER_MS = 10 * 60 * 1000

/**
 * Whose answers, in an availability record, are news for the admins on the
 * event: anything but "Available", given for the first time or changed,
 * just now.
 */
export function answersToTell(
  before: Doc | undefined,
  after: Doc | undefined,
  now: number
): { uid: string; statusLabel: string }[] {
  const was = (before?.responses ?? {}) as Record<string, { status?: unknown } | null>
  const is = (after?.responses ?? {}) as Record<string, { status?: unknown; ts?: unknown } | null>
  const out: { uid: string; statusLabel: string }[] = []
  for (const [uid, answer] of Object.entries(is)) {
    const status = str(answer?.status)
    const label = AVAIL_SAID[status]
    if (!label || str(was[uid]?.status) === status) continue
    if (typeof answer?.ts === 'number' && now - answer.ts > FRESH_ANSWER_MS) continue
    out.push({ uid, statusLabel: label })
  }
  return out
}

/** An availability record's name, apart: the event, and its date ('' for the whole series). */
export function availKeyParts(key: string): { eventId: string; date: string } | null {
  const series = /^(.+)_series$/.exec(key)
  if (series) return { eventId: series[1], date: '' }
  const dated = /^(.+?)_(\d{4}-\d{2}-\d{2})(?:_d\d+)?$/.exec(key)
  return dated ? { eventId: dated[1], date: dated[2] } : null
}

// --- Security, conversations, reports ----------------------------------------

/** What a new security report's notification says. */
export function newIncidentSaid(report: Doc): string {
  const what = str(report.description).trim()
  const short = what.length > 80 ? `${what.slice(0, 80)}…` : what
  return `🚨 New incident at ${str(report.location).trim() || 'an unknown location'}: ${short}`
}

/** Whether a conversation was just reported: told to the admins who didn't report it. */
export function justReported(before: Doc | undefined, after: Doc | undefined): boolean {
  return !!after && after.reported === true && before?.reported !== true
}

/** Whether a report on a message was just dealt with: its reporter is told it was. */
export function justResolved(before: Doc | undefined, after: Doc | undefined): boolean {
  const done = (s: unknown) => s === 'actioned' || s === 'dismissed'
  return !!after && done(after.status) && !done(before?.status)
}
