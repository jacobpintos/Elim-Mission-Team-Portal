import { describe, it, expect } from 'vitest'
import { getInstances, allInstances, taskDueDate } from './events'
import type { EventTemplate } from '@/types/events'

const tmpl = (over: Partial<EventTemplate> = {}) =>
  ({ id: 'e1', title: 'Practice', date: '2026-03-02', ...over }) as EventTemplate

describe('getInstances — one-off events', () => {
  it('returns the event when it falls inside the window', () => {
    const out = getInstances(tmpl(), '2026-03-01', '2026-03-31')

    expect(out).toHaveLength(1)
    expect(out[0].date).toBe('2026-03-02')
    expect(out[0].instanceKey).toBe('e1_2026-03-02')
  })

  it('leaves out an event outside the window', () => {
    expect(getInstances(tmpl(), '2026-04-01', '2026-04-30')).toEqual([])
  })

  it('includes events on the window boundaries', () => {
    expect(getInstances(tmpl({ date: '2026-03-01' }), '2026-03-01', '2026-03-31')).toHaveLength(1)
    expect(getInstances(tmpl({ date: '2026-03-31' }), '2026-03-01', '2026-03-31')).toHaveLength(1)
  })

  it('drops an instance the override marked deleted', () => {
    const out = getInstances(tmpl(), '2026-03-01', '2026-03-31', {
      'e1_2026-03-02': { deleted: true } as Partial<EventTemplate>,
    })

    expect(out).toEqual([])
  })

  it('applies override fields onto the instance', () => {
    const out = getInstances(tmpl(), '2026-03-01', '2026-03-31', {
      'e1_2026-03-02': { title: 'Moved' } as Partial<EventTemplate>,
    })

    expect(out[0].title).toBe('Moved')
  })

  it('emits extra days as their own instances', () => {
    const out = getInstances(
      tmpl({
        extraDays: [{ date: '2026-03-03' }, { date: '2026-03-04' }],
      } as Partial<EventTemplate>),
      '2026-03-01',
      '2026-03-31'
    )

    expect(out.map((i) => i.date)).toEqual(['2026-03-02', '2026-03-03', '2026-03-04'])
    expect(out.map((i) => i._dayLabel)).toEqual(['Day 1', 'Day 2', 'Day 3'])
  })
})

describe('getInstances — recurring events', () => {
  const weekly = tmpl({ isRec: true, recur: 'weekly', recDay: 1 } as Partial<EventTemplate>)

  it('emits one instance per week on the chosen weekday', () => {
    const out = getInstances(weekly, '2026-03-01', '2026-03-31')

    // Mondays in March 2026.
    expect(out.map((i) => i.date)).toEqual([
      '2026-03-02',
      '2026-03-09',
      '2026-03-16',
      '2026-03-23',
      '2026-03-30',
    ])
  })

  it('lands every instance on the requested weekday', () => {
    for (const i of getInstances(weekly, '2026-03-01', '2026-05-31')) {
      expect(new Date(`${i.date}T12:00:00`).getDay()).toBe(1)
    }
  })

  it('stops at recEnd when that comes before the window end', () => {
    const out = getInstances(
      { ...weekly, recEnd: '2026-03-16' } as EventTemplate,
      '2026-03-01',
      '2026-03-31'
    )

    expect(out.map((i) => i.date)).toEqual(['2026-03-02', '2026-03-09', '2026-03-16'])
  })

  it('steps a fortnight apart when biweekly', () => {
    const out = getInstances(
      { ...weekly, recur: 'biweekly' } as EventTemplate,
      '2026-03-01',
      '2026-03-31'
    )

    expect(out.map((i) => i.date)).toEqual(['2026-03-02', '2026-03-16', '2026-03-30'])
  })

  it('skips occurrences deleted by override', () => {
    const out = getInstances(weekly, '2026-03-01', '2026-03-31', {
      'e1_2026-03-09': { deleted: true } as Partial<EventTemplate>,
    })

    expect(out.map((i) => i.date)).not.toContain('2026-03-09')
    expect(out).toHaveLength(4)
  })

  it('caps runaway expansion rather than looping forever', () => {
    // No recEnd over a decade would otherwise emit ~520 instances.
    const out = getInstances(weekly, '2026-01-01', '2036-01-01')

    expect(out.length).toBeLessThanOrEqual(104)
  })

  it('gives every instance a distinct key', () => {
    const keys = getInstances(weekly, '2026-03-01', '2026-06-30').map((i) => i.instanceKey)

    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('allInstances', () => {
  it('merges templates and returns them in date order', () => {
    const out = allInstances(
      [tmpl({ id: 'b', date: '2026-03-20' }), tmpl({ id: 'a', date: '2026-03-05' })],
      {},
      '2026-03-01',
      '2026-03-31'
    )

    expect(out.map((i) => i.date)).toEqual(['2026-03-05', '2026-03-20'])
  })

  it('returns nothing when no template falls in the window', () => {
    expect(allInstances([tmpl()], {}, '2027-01-01', '2027-01-31')).toEqual([])
  })
})

describe('taskDueDate', () => {
  it('counts back from the event for a pre-event task', () => {
    expect(taskDueDate('2026-03-10', { daysBefore: 3 })).toBe('2026-03-07')
  })

  it('counts forward for a post-event task', () => {
    expect(taskDueDate('2026-03-10', { daysBefore: 0, daysAfterEvent: 2 })).toBe('2026-03-12')
  })

  it('lets daysAfterEvent win over daysBefore', () => {
    // A template carrying both should follow the post-event branch, matching
    // the isPostEvent flag stored alongside the task.
    expect(taskDueDate('2026-03-10', { daysBefore: 5, daysAfterEvent: 1 })).toBe('2026-03-11')
  })

  it('has no due date for a recurring event, which has no single date', () => {
    expect(taskDueDate(null, { daysBefore: 3 })).toBeNull()
  })

  it('has no due date when the task carries no offset', () => {
    expect(taskDueDate('2026-03-10', { daysBefore: 0 })).toBeNull()
    expect(taskDueDate('2026-03-10', {})).toBeNull()
  })

  it('crosses month and year boundaries', () => {
    expect(taskDueDate('2026-03-02', { daysBefore: 5 })).toBe('2026-02-25')
    expect(taskDueDate('2026-01-02', { daysBefore: 7 })).toBe('2025-12-26')
    expect(taskDueDate('2026-12-30', { daysBefore: 0, daysAfterEvent: 5 })).toBe('2027-01-04')
  })

  it('handles a leap day', () => {
    expect(taskDueDate('2028-03-01', { daysBefore: 1 })).toBe('2028-02-29')
  })
})
