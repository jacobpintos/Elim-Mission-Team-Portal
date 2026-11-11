/**
 * Which events have fallen behind, or caught up, since the health check last
 * looked (./eventHealth): worked out from the tasks still open, and the
 * events it last found behind.
 *
 * It used to read every event and every task, done ones included, each day.
 * What decides it is only the tasks still to do, and the events marked
 * behind — so those, and the events they belong to, are all it reads.
 *
 * Kept free of Firebase, for tests (src/lib/eventHealthPlan.test.ts in the app).
 */

export interface HealthTask {
  status?: string
  dueDate?: string | null
  projectedDate?: string | null
  evId?: string | number | null
  evTemplateId?: string | number | null
}

export interface HealthEvent {
  id: string
  title?: string
  taskTemplateId?: string
  deleted?: boolean
  unpublished?: boolean
}

export interface HealthChange {
  id: string
  title: string
  behind: boolean
  /** Fell behind just now: the admins are told. */
  newlyBehind: boolean
}

const id = (v: unknown) => (v == null || v === '' ? '' : String(v))

/** The events a task can count towards: as the client counts it, by either id it carries. */
export function eventsOfTask(t: HealthTask): string[] {
  return [...new Set([id(t.evId), id(t.evTemplateId)].filter(Boolean))]
}

/** Mirrors the client's isOverdue(): past its effective date and not done. */
export function isOverdue(task: HealthTask, today: string): boolean {
  const effectiveDate = task.projectedDate || task.dueDate
  return !!(effectiveDate && task.status !== 'done' && effectiveDate < today)
}

/** The events to read: those an open task counts towards, and those marked behind. */
export function eventsToRead(openTasks: HealthTask[], behind: Set<string>): string[] {
  const ids = new Set(behind)
  for (const t of openTasks) eventsOfTask(t).forEach((e) => ids.add(e))
  return [...ids]
}

/**
 * Each event whose health changed: behind when one of its open tasks is
 * behind or overdue. A draft, a deleted event and one with no task template
 * are left as they are, as they always were.
 */
export function healthChanges(
  events: HealthEvent[],
  openTasks: HealthTask[],
  behind: Set<string>,
  today: string
): HealthChange[] {
  const tasksOf = new Map<string, HealthTask[]>()
  for (const t of openTasks) {
    if (t.status === 'done') continue
    for (const e of eventsOfTask(t)) tasksOf.set(e, [...(tasksOf.get(e) ?? []), t])
  }
  const out: HealthChange[] = []
  for (const ev of events) {
    if (ev.deleted || ev.unpublished === true || !ev.taskTemplateId) continue
    const isBehind = (tasksOf.get(ev.id) ?? []).some(
      (t) => t.status === 'behind' || isOverdue(t, today)
    )
    const wasBehind = behind.has(ev.id)
    if (isBehind === wasBehind) continue
    out.push({
      id: ev.id,
      title: ev.title ?? 'An event',
      behind: isBehind,
      newlyBehind: isBehind && !wasBehind,
    })
  }
  return out
}
