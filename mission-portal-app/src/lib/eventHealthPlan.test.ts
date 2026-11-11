import { describe, it, expect } from 'vitest'
import {
  eventsOfTask,
  eventsToRead,
  healthChanges,
  type HealthEvent,
  type HealthTask,
} from '../../functions/src/push/eventHealthPlan'

/**
 * The daily event health check, from the tasks still open and the events last
 * found behind — not every event and task kept.
 */
describe('event health', () => {
  const today = '2026-11-20'
  const ev = (id: string, over: Partial<HealthEvent> = {}): HealthEvent => ({
    id,
    title: `Event ${id}`,
    taskTemplateId: 't1',
    ...over,
  })
  const task = (over: Partial<HealthTask>): HealthTask => ({ status: 'pending', ...over })

  it('counts a task towards either event it names, as the app does', () => {
    expect(eventsOfTask({ evId: 5, evTemplateId: '5' })).toEqual(['5'])
    expect(eventsOfTask({ evId: 'a', evTemplateId: 'b' })).toEqual(['a', 'b'])
    expect(eventsOfTask({ evId: null, evTemplateId: '' })).toEqual([])
  })

  it('reads the events an open task belongs to, and those marked behind', () => {
    const ids = eventsToRead([task({ evTemplateId: 'e1' }), task({ evId: 'e2' })], new Set(['e9']))
    expect(ids.sort()).toEqual(['e1', 'e2', 'e9'])
  })

  it('finds an event newly behind, by a task behind or overdue', () => {
    const changes = healthChanges(
      [ev('e1'), ev('e2'), ev('e3')],
      [
        task({ evTemplateId: 'e1', status: 'behind' }),
        task({ evTemplateId: 'e2', dueDate: '2026-11-19' }),
        task({ evTemplateId: 'e3', dueDate: '2026-11-21' }),
      ],
      new Set(),
      today
    )
    expect(changes).toEqual([
      { id: 'e1', title: 'Event e1', behind: true, newlyBehind: true },
      { id: 'e2', title: 'Event e2', behind: true, newlyBehind: true },
    ])
  })

  it('goes by the date someone expects to finish, when they gave one', () => {
    const changes = healthChanges(
      [ev('e1')],
      [task({ evTemplateId: 'e1', dueDate: '2026-11-01', projectedDate: '2026-11-25' })],
      new Set(),
      today
    )
    expect(changes).toEqual([])
  })

  it('says nothing again of one still behind', () => {
    const changes = healthChanges(
      [ev('e1')],
      [task({ evTemplateId: 'e1', status: 'behind' })],
      new Set(['e1']),
      today
    )
    expect(changes).toEqual([])
  })

  it('marks one caught up once nothing of it is open and late — every task done, or none left', () => {
    const changes = healthChanges([ev('e1'), ev('e2')], [], new Set(['e1', 'e2']), today)
    expect(changes).toEqual([
      { id: 'e1', title: 'Event e1', behind: false, newlyBehind: false },
      { id: 'e2', title: 'Event e2', behind: false, newlyBehind: false },
    ])
  })

  it('leaves a draft, a deleted event and one with no template as they are', () => {
    const late = (id: string) => task({ evTemplateId: id, status: 'behind' })
    const changes = healthChanges(
      [
        ev('d', { unpublished: true }),
        ev('x', { deleted: true }),
        ev('n', { taskTemplateId: undefined }),
      ],
      [late('d'), late('x'), late('n')],
      new Set(),
      today
    )
    expect(changes).toEqual([])
  })

  it('never counts a done task, should one be handed in', () => {
    const changes = healthChanges(
      [ev('e1')],
      [task({ evTemplateId: 'e1', status: 'done', dueDate: '2026-01-01' })],
      new Set(),
      today
    )
    expect(changes).toEqual([])
  })
})
