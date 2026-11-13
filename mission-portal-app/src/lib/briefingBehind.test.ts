import { describe, it, expect } from 'vitest'
import { behindAttention } from './briefing'
import type { ReportTask } from './eventReport'
import type { EventInstance } from '../../functions/src/miriam/data'

const today = '2026-11-13' // a Friday
const ev = (over: Partial<EventInstance> & { taskTemplateId?: string } = {}) =>
  ({
    id: 'e1',
    templateId: 'e1',
    instanceKey: `e1_${over.date ?? '2026-11-16'}`,
    title: 'Public Test Event',
    date: '2026-11-16',
    ...over,
  }) as EventInstance & { taskTemplateId?: string }
const task = (over: Partial<ReportTask> = {}): ReportTask => ({
  id: 't1',
  title: 'Book the room',
  status: 'pending',
  dueDate: '2026-11-20',
  assignees: ['sarah'],
  evTemplateId: 'e1',
  ...over,
})

describe('the briefing: events coming up that are behind', () => {
  it('names one with a task marked behind, and opens its Event Health card', () => {
    const [item, ...rest] = behindAttention(
      [ev({ taskTemplateId: 'tpl1' })],
      [task({ status: 'behind' })],
      today
    )
    expect(rest).toEqual([])
    expect(item).toEqual({
      kind: 'behind',
      title: 'Public Test Event is behind',
      sub: '1 task behind · Monday',
      href: '/assignments?healthEvent=e1',
      spoken: 'Public Test Event on Monday is behind, with 1 task behind',
    })
  })

  it('counts tasks past due and not done as overdue, as the Behind badge does', () => {
    const [item] = behindAttention(
      [ev({ date: '2026-11-14' })],
      [
        task({ id: 'a', status: 'behind' }),
        task({ id: 'b', dueDate: '2026-11-10' }),
        task({ id: 'c', status: 'in_progress', dueDate: '2026-11-12' }),
      ],
      today
    )
    expect(item.sub).toBe('1 task behind, 2 overdue · tomorrow')
    expect(item.spoken).toBe('Public Test Event tomorrow is behind, with 1 task behind, 2 overdue')
    // No task template: no Event Health card, so Assignments.
    expect(item.href).toBe('/assignments')
  })

  it('leaves out an event on track: done, or not yet due', () => {
    expect(
      behindAttention(
        [ev()],
        [
          task({ status: 'done', dueDate: '2026-11-01' }),
          task({ id: 't2', dueDate: '2026-11-15' }),
        ],
        today
      )
    ).toEqual([])
    expect(behindAttention([ev()], [], today)).toEqual([])
  })

  it('a repeating event once, on its next date; a date further off with its day', () => {
    const sunday = (date: string) =>
      ev({ id: 'svc', templateId: 'svc', title: 'Sunday Service', isRec: true, date })
    const items = behindAttention(
      [sunday('2026-11-15'), sunday('2026-11-22'), ev({ date: '2026-11-24' })],
      [
        task({ id: 's', evTemplateId: 'svc', status: 'behind' }),
        task({ id: 'r', status: 'behind' }),
      ],
      today
    )
    expect(items.map((i) => i.sub)).toEqual([
      '1 task behind · Sunday',
      '1 task behind · Tue, Nov 24',
    ])
  })

  it('names three at most, the soonest', () => {
    const evs = ['a', 'b', 'c', 'd'].map((id, i) =>
      ev({ id, templateId: id, title: id, date: `2026-11-1${4 + i}` })
    )
    const items = behindAttention(
      evs,
      evs.map((e) => task({ id: e.id, evTemplateId: e.templateId, status: 'behind' })),
      today
    )
    expect(items.map((i) => i.title)).toEqual(['a is behind', 'b is behind', 'c is behind'])
  })
})
