/**
 * Who may read a task, or a set list — kept on each as `seenBy`, for the
 * database's rules (firestore.rules tasks, setLists), as an event's is
 * (./eventPrivate eventSeenBy). Kept up by the server (./recordAccessSync).
 *
 * Kept free of Firebase: the app imports it too.
 */
import { ADMINS, EVERYONE } from './eventPrivate'

interface TaskLike {
  assignees?: unknown
  lead?: unknown
  owner?: unknown
  taskType?: unknown
}

const people = (...lists: unknown[][]) => {
  const out = new Set<string>()
  for (const u of lists.flat()) if (u != null && u !== '') out.add(String(u))
  return [...out].sort()
}

/**
 * A task: those it is assigned to, its lead, and whoever it is done for
 * (`owner`: who asked to be reimbursed) — and every admin, but for a
 * reimbursement's: what someone spent is theirs and the Accountant's alone.
 */
export function taskSeenBy(t: TaskLike): string[] {
  const named = people(Array.isArray(t.assignees) ? t.assignees : [], [t.lead, t.owner])
  return t.taskType === 'reimbursement' ? named : [...named, ADMINS]
}

/** Whether this person may read a task: named on it, or an admin and it isn't a reimbursement's. */
export function seesTask(t: TaskLike, viewer: { uid: string; admin: boolean }): boolean {
  const seenBy = taskSeenBy(t)
  return seenBy.includes(viewer.uid) || (viewer.admin && seenBy.includes(ADMINS))
}

/**
 * A set list: for an event, whoever may see the event (its `seenBy`, as
 * kept) and whoever made it; for none, everyone — each still only if they
 * read set lists at all (the worship team, guests, admins). An event not
 * found: its maker, and the admins.
 */
export function setListSeenBy(
  sl: { eventTemplateId?: unknown; createdBy?: unknown },
  eventSeenBy: unknown[] | null
): string[] {
  const linked = sl.eventTemplateId != null && sl.eventTemplateId !== ''
  if (!linked) return [EVERYONE]
  const seen = eventSeenBy ?? [ADMINS]
  if (seen.includes(EVERYONE)) return [EVERYONE]
  const markers = seen.filter((x) => x === ADMINS)
  return [
    ...people(
      seen.filter((x) => x !== ADMINS),
      [sl.createdBy]
    ),
    ...markers,
  ]
}
