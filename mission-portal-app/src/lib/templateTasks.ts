import type { Task } from '@/types/events'
import { taskDueDate } from './events'

/**
 * An event's tasks from its task template — made as the template is given to
 * it (the event form: made, published, or given a template), or by Spawn
 * Tasks in Event Health. One way for both, so each task is made the same:
 * given to its people and to everyone in its groups, due as the template
 * says, and marked post-event when it comes after.
 *
 * Pure, for tests: who is in each group is handed in.
 */

/** A task as a template keeps it (features/admin/TaskTemplateCard TaskItem). */
export interface TemplateTaskItem {
  title: string
  assignees?: (string | number)[]
  assigneeGroups?: string[]
  daysBefore?: number
  daysAfterEvent?: number
}

export interface TemplateTasksFor {
  /** The event they are for: tasks keep it as evTemplateId. */
  eventId: string | number
  /** Its date, for due dates; none for a repeating event. */
  eventDate: string | null
  /** Who is adding them. */
  by: string | number
  /** Everyone in these groups, for a task given to a group. */
  membersOf: (groupIds: string[]) => string[]
  /** The titles of the tasks the event has already: not made again. */
  existing: Iterable<string>
}

const titleKey = (title: string) => title.trim().toLowerCase().replace(/\s+/g, ' ')

/** The template's tasks the event doesn't have yet, ready to be made. */
export function tasksFromTemplate(
  items: readonly TemplateTaskItem[],
  to: TemplateTasksFor
): Omit<Task, 'id'>[] {
  const has = new Set([...to.existing].map(titleKey))
  const tasks: Omit<Task, 'id'>[] = []
  for (const item of items) {
    const title = item.title?.trim()
    if (!title || has.has(titleKey(title))) continue
    const assignees = [
      ...new Set([
        ...(item.assignees ?? []).map(String),
        ...to.membersOf(item.assigneeGroups ?? []),
      ]),
    ]
    tasks.push({
      title,
      assignees,
      lead: assignees[0] ?? null,
      by: to.by,
      status: 'pending',
      evTemplateId: to.eventId,
      evDate: to.eventDate,
      dueDate: taskDueDate(to.eventDate, item),
      ...((item.daysAfterEvent ?? 0) > 0 ? { isPostEvent: true } : {}),
    })
  }
  return tasks
}
