import { describe, it, expect } from 'vitest'
import { sameId } from './ids'

/**
 * Mirror of the rule onEventDeleted uses to decide which tasks belong to a
 * deleted event. functions/ builds separately and is not compiled by this
 * runner, so the rule is pinned here.
 *
 * The subtlety worth guarding: events are numbered by a counter and stored
 * with a numeric `id`, while the Firestore document is named with the string
 * of that number. A task created through the app holds the number, so
 * matching only the document id finds nothing.
 */
function idValuesFor(documentId: string): (string | number)[] {
  const numeric = Number(documentId)
  return Number.isFinite(numeric) ? [documentId, numeric] : [documentId]
}

interface TaskLike {
  id: string
  evId?: string | number | null
  evTemplateId?: string | number | null
}

/** Which tasks the queries would collectively return. */
function tasksForEvent(tasks: TaskLike[], documentId: string): string[] {
  const values = idValuesFor(documentId)
  const matches = (field: string | number | null | undefined) =>
    field !== undefined && field !== null && values.some((v) => v === field)
  return tasks.filter((t) => matches(t.evId) || matches(t.evTemplateId)).map((t) => t.id)
}

describe('idValuesFor', () => {
  it('asks for both the string and the number', () => {
    expect(idValuesFor('42')).toEqual(['42', 42])
  })

  it('asks only for the string when the id is not numeric', () => {
    expect(idValuesFor('abc')).toEqual(['abc'])
  })
})

describe('tasksForEvent', () => {
  it('finds a task holding the numeric id, which is what the app writes', () => {
    // The case that would silently delete nothing if only the string matched.
    expect(tasksForEvent([{ id: 't1', evTemplateId: 42 }], '42')).toEqual(['t1'])
  })

  it('finds a task holding the string id', () => {
    expect(tasksForEvent([{ id: 't1', evTemplateId: '42' }], '42')).toEqual(['t1'])
  })

  it('finds tasks linked by either field', () => {
    const tasks = [
      { id: 't1', evTemplateId: 42 },
      { id: 't2', evId: 42 },
    ]

    expect(tasksForEvent(tasks, '42')).toEqual(['t1', 't2'])
  })

  it('returns a task carrying both fields once', () => {
    expect(tasksForEvent([{ id: 't1', evId: 42, evTemplateId: 42 }], '42')).toEqual(['t1'])
  })

  it('leaves other events tasks alone', () => {
    const tasks = [
      { id: 't1', evTemplateId: 42 },
      { id: 't2', evTemplateId: 43 },
    ]

    expect(tasksForEvent(tasks, '42')).toEqual(['t1'])
  })

  it('leaves standalone tasks alone', () => {
    // A task with no event must survive its unrelated neighbours being deleted.
    const tasks = [{ id: 't1', evTemplateId: null }, { id: 't2' }]

    expect(tasksForEvent(tasks, '42')).toEqual([])
  })

  it('agrees with how the app itself matches ids', () => {
    // eventTasks() uses sameId, which compares stringified values.
    expect(sameId(42, '42')).toBe(true)
  })
})
