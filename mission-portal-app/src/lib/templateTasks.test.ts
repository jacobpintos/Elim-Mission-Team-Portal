import { describe, it, expect } from 'vitest'
import { tasksFromTemplate, type TemplateTasksFor } from './templateTasks'

const groups: Record<string, string[]> = { worship: ['tom', 'amy'], tech: ['sam'] }
const to = (over: Partial<TemplateTasksFor> = {}): TemplateTasksFor => ({
  eventId: 42,
  eventDate: '2026-12-05',
  by: 'boss',
  membersOf: (ids) => ids.flatMap((id) => groups[id] ?? []),
  existing: [],
  ...over,
})

describe('an event’s tasks from its template', () => {
  it('makes each, due as the template says, for the event', () => {
    const tasks = tasksFromTemplate(
      [
        { title: 'Book the venue', assignees: ['sarah'], daysBefore: 30 },
        { title: 'Send thank-yous', assignees: ['sarah'], daysAfterEvent: 2 },
        { title: 'Pray', assignees: [], daysBefore: 0 },
      ],
      to()
    )
    expect(tasks).toEqual([
      {
        title: 'Book the venue',
        assignees: ['sarah'],
        lead: 'sarah',
        by: 'boss',
        status: 'pending',
        evTemplateId: 42,
        evDate: '2026-12-05',
        dueDate: '2026-11-05',
      },
      {
        title: 'Send thank-yous',
        assignees: ['sarah'],
        lead: 'sarah',
        by: 'boss',
        status: 'pending',
        evTemplateId: 42,
        evDate: '2026-12-05',
        dueDate: '2026-12-07',
        isPostEvent: true,
      },
      expect.objectContaining({ title: 'Pray', assignees: [], lead: null, dueDate: null }),
    ])
  })

  it('gives a task given to a group to everyone in it, once each', () => {
    const [task] = tasksFromTemplate(
      [
        {
          title: 'Sound check',
          assignees: ['tom'],
          assigneeGroups: ['worship', 'tech'],
          daysBefore: 1,
        },
      ],
      to()
    )
    expect(task.assignees).toEqual(['tom', 'amy', 'sam'])
    expect(task.lead).toBe('tom')
  })

  it('leaves out those the event has already, by title, and empty ones', () => {
    const tasks = tasksFromTemplate(
      [
        { title: 'Book the venue', assignees: [], daysBefore: 30 },
        { title: '  book  the VENUE ', assignees: [], daysBefore: 30 },
        { title: 'Order food', assignees: [], daysBefore: 7 },
        { title: '   ', assignees: [], daysBefore: 1 },
      ],
      to({ existing: ['Book the venue'] })
    )
    expect(tasks.map((t) => t.title)).toEqual(['Order food'])
  })

  it('for a repeating event, no date and nothing due', () => {
    const [task] = tasksFromTemplate(
      [{ title: 'Set up chairs', assignees: [], daysBefore: 1 }],
      to({ eventDate: null })
    )
    expect(task).toMatchObject({ evDate: null, dueDate: null })
  })
})
