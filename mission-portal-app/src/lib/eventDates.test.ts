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

  it('saves what was typed, back in stored form — its time tidied as the schedule’s are', () => {
    expect(
      fromExtraDayRows([{ id: 'a', date: '10/02/26', startTime: ' 9 am ', location: ' Chapel ' }])
    ).toEqual([{ date: '2026-10-02', startTime: '9:00 AM', location: 'Chapel' }])
    // Not a time a clock reads: kept as typed.
    expect(
      fromExtraDayRows([{ id: 'a', date: '10/02/26', startTime: 'After lunch', location: '' }])
    ).toEqual([{ date: '2026-10-02', startTime: 'After lunch' }])
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
    const stored = [{ date: '2026-10-02', startTime: '9:00 AM', location: 'Chapel' }]
    expect(fromExtraDayRows(toExtraDayRows(stored))).toEqual(stored)
  })
})

describe('a date as typed into a date field', () => {
  it('takes it however it comes', async () => {
    const { typedDateToIso } = await import('./eventDates')
    expect(typedDateToIso('11/20/26')).toBe('2026-11-20')
    expect(typedDateToIso('1/5/26')).toBe('2026-01-05')
    expect(typedDateToIso('11/5/26')).toBe('2026-11-05')
    expect(typedDateToIso('01/5/2026')).toBe('2026-01-05')
    expect(typedDateToIso(' 2026-11-20 ')).toBe('2026-11-20')
    expect(typedDateToIso('')).toBe('')
  })

  it('not a day that does not exist, nor anything else', async () => {
    const { typedDateToIso } = await import('./eventDates')
    expect(typedDateToIso('2/30/26')).toBeNull()
    expect(typedDateToIso('13/1/26')).toBeNull()
    expect(typedDateToIso('next friday')).toBeNull()
    expect(typedDateToIso('2026-02-30')).toBeNull()
  })
})

describe('a date with no year', () => {
  it('is the next one to come: this year, unless it has passed', async () => {
    const { typedDateToIso, displayToIso } = await import('./eventDates')
    expect(typedDateToIso('11/20', '2026-11-03')).toBe('2026-11-20')
    expect(typedDateToIso('11/3', '2026-11-03')).toBe('2026-11-03')
    expect(typedDateToIso('11/2', '2026-11-03')).toBe('2027-11-02')
    expect(typedDateToIso('1/5', '2026-11-03')).toBe('2027-01-05')
    expect(typedDateToIso('12/31', '2026-12-31')).toBe('2026-12-31')
    expect(displayToIso('3/1', { upcomingFrom: '2026-11-03' })).toBe('2027-03-01')
    // A day that is not one in the year it comes: not a date.
    expect(typedDateToIso('2/29', '2026-11-03')).toBeNull()
    expect(typedDateToIso('2/29', '2027-11-03')).toBe('2028-02-29')
  })

  it('but needs its year where a date has been, not to come', async () => {
    const { displayToIso } = await import('./eventDates')
    expect(displayToIso('11/20')).toBe('')
    expect(displayToIso('11/20/26')).toBe('2026-11-20')
  })
})
