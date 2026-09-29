import { describe, it, expect } from 'vitest'
import { isoToDisplay, displayToIso, toExtraDayRows, fromExtraDayRows } from './eventDates'

describe('isoToDisplay', () => {
  it('shows a stored date the way the form asks for it', () => {
    expect(isoToDisplay('2026-10-01')).toBe('10/01/26')
  })

  it('leaves anything that is not a stored date alone', () => {
    expect(isoToDisplay('')).toBe('')
    expect(isoToDisplay('sometime')).toBe('sometime')
  })
})

describe('displayToIso', () => {
  it('accepts the format the field asks for', () => {
    expect(displayToIso('10/01/26')).toBe('2026-10-01')
  })

  it('accepts single digits and a four-digit year', () => {
    expect(displayToIso('1/5/26')).toBe('2026-01-05')
    expect(displayToIso('10/01/2026')).toBe('2026-10-01')
  })

  it('rejects a date that could not exist', () => {
    expect(displayToIso('13/01/26')).toBe('')
    expect(displayToIso('10/32/26')).toBe('')
  })

  it('rejects anything that is not a date at all', () => {
    expect(displayToIso('')).toBe('')
    expect(displayToIso('next Tuesday')).toBe('')
    expect(displayToIso('2026-10-01')).toBe('')
  })
})

describe('extra day rows', () => {
  it('loads stored days into the form', () => {
    const rows = toExtraDayRows([
      { date: '2026-10-02', startTime: '9 AM', location: 'Chapel' },
      { date: '2026-10-03' },
    ])
    expect(rows.map((r) => r.date)).toEqual(['10/02/26', '10/03/26'])
    expect(rows[0].startTime).toBe('9 AM')
    // Blank rather than undefined: these go straight into text inputs, and an
    // undefined value turns one into an uncontrolled field.
    expect(rows[1].startTime).toBe('')
    expect(rows[1].location).toBe('')
  })

  it('copes with an event that has no extra days', () => {
    expect(toExtraDayRows(undefined)).toEqual([])
    expect(toExtraDayRows([])).toEqual([])
  })

  it('saves what was typed, back in stored form', () => {
    expect(
      fromExtraDayRows([{ id: 'a', date: '10/02/26', startTime: ' 9 AM ', location: ' Chapel ' }])
    ).toEqual([{ date: '2026-10-02', startTime: '9 AM', location: 'Chapel' }])
  })

  it('leaves out a time and venue nobody filled in, so the day inherits Day 1', () => {
    expect(
      fromExtraDayRows([{ id: 'a', date: '10/02/26', startTime: '  ', location: '' }])
    ).toEqual([{ date: '2026-10-02' }])
  })

  it('drops a row with no usable date', () => {
    // Instances are expanded from these dates — a blank one would produce a
    // day nobody can reach or remove.
    const rows = [
      { id: 'a', date: '', startTime: '9 AM', location: '' },
      { id: 'b', date: 'whenever', startTime: '', location: '' },
      { id: 'c', date: '10/04/26', startTime: '', location: '' },
    ]
    expect(fromExtraDayRows(rows)).toEqual([{ date: '2026-10-04' }])
  })

  it('round-trips a day without losing anything', () => {
    const stored = [{ date: '2026-10-02', startTime: '9 AM', location: 'Chapel' }]
    expect(fromExtraDayRows(toExtraDayRows(stored))).toEqual(stored)
  })
})
