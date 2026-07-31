import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  availKey,
  seriesAvailKey,
  getAvail,
  getSeriesAvail,
  effectiveAvail,
  isOverdue,
} from './availability'
import type { EventInstance, AvailResponse } from '@/types/events'

const ev = (over: Partial<EventInstance> = {}) =>
  ({ id: 'e1', date: '2026-03-02', instanceKey: 'e1_2026-03-02', ...over }) as EventInstance

/** Build a stored response; only `status` matters to the logic under test. */
const resp = (status: AvailResponse['status'], uid = 'u1'): AvailResponse => ({
  status,
  note: '',
  uid,
  ts: 0,
})

const table = (
  entries: Record<string, Record<string, AvailResponse>>
): Record<string, Record<string, AvailResponse>> => entries

describe('availKey', () => {
  it('uses the instance key when present', () => {
    expect(availKey(ev())).toBe('e1_2026-03-02')
  })

  it('falls back to id and date when there is no instance key', () => {
    expect(availKey(ev({ instanceKey: undefined }))).toBe('e1_2026-03-02')
  })

  it('strips slashes, which would split a Firestore path', () => {
    // An id containing "/" would otherwise address a different document.
    expect(availKey(ev({ instanceKey: 'a/b/c' }))).toBe('a_b_c')
    expect(seriesAvailKey('a/b')).toBe('a_b_series')
  })
})

describe('getAvail / getSeriesAvail', () => {
  it('returns null when the user has not responded', () => {
    expect(getAvail(table({}), ev(), 'u1')).toBeNull()
    expect(getSeriesAvail(table({}), 'e1', 'u1')).toBeNull()
  })

  it('returns the stored response', () => {
    const avail = table({ 'e1_2026-03-02': { u1: resp('yes') } })

    expect(getAvail(avail, ev(), 'u1')).toEqual(resp('yes'))
    // Another user's answer must not leak across.
    expect(getAvail(avail, ev(), 'u2')).toBeNull()
  })
})

describe('effectiveAvail', () => {
  it('prefers an instance answer over the series answer', () => {
    const avail = table({
      'e1_2026-03-02': { u1: resp('no') },
      e1_series: { u1: resp('yes') },
    })

    expect(effectiveAvail(avail, ev({ isRec: true, templateId: 'e1' }), 'u1')).toEqual(resp('no'))
  })

  it('falls back to the series answer for a recurring event', () => {
    const avail = table({ e1_series: { u1: resp('yes') } })

    expect(effectiveAvail(avail, ev({ isRec: true, templateId: 'e1' }), 'u1')).toEqual(resp('yes'))
  })

  it('ignores a series answer for a one-off event', () => {
    // A non-recurring event has no series to inherit from, so a stray series
    // entry must not decide its answer.
    const avail = table({ e1_series: { u1: resp('yes') } })

    expect(effectiveAvail(avail, ev({ isRec: false }), 'u1')).toBeNull()
  })

  it('reads the series off templateId rather than the instance id', () => {
    const avail = table({ tmpl1_series: { u1: resp('partial') } })

    expect(effectiveAvail(avail, ev({ isRec: true, templateId: 'tmpl1' }), 'u1')).toEqual(
      resp('partial')
    )
  })
})

describe('isOverdue', () => {
  afterEach(() => vi.useRealTimers())

  const at = (today: string) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(`${today}T12:00:00Z`))
  }

  it('flags a task whose due date has passed', () => {
    at('2026-03-10')
    expect(isOverdue({ dueDate: '2026-03-09', status: 'todo' })).toBe(true)
  })

  it('does not flag a task due today', () => {
    // Due today is still on time; the comparison is strictly "before today".
    at('2026-03-10')
    expect(isOverdue({ dueDate: '2026-03-10', status: 'todo' })).toBe(false)
  })

  it('does not flag a task due later', () => {
    at('2026-03-10')
    expect(isOverdue({ dueDate: '2026-03-11', status: 'todo' })).toBe(false)
  })

  it('never flags a completed task, however old', () => {
    at('2026-03-10')
    expect(isOverdue({ dueDate: '2020-01-01', status: 'done' })).toBe(false)
  })

  it('never flags a task with no due date', () => {
    at('2026-03-10')
    expect(isOverdue({ status: 'todo' })).toBe(false)
    expect(isOverdue({ dueDate: null, status: 'todo' })).toBe(false)
  })
})
