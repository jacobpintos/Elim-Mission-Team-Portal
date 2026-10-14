import { describe, it, expect } from 'vitest'
import { csvCell, toCsv, parseAvailKey, availabilityCsv, eventsCsv } from './dataExport'
import type { EventTemplate, AvailResponse } from '@/types/events'

describe('csvCell', () => {
  it('quotes commas, quotes and line breaks', () => {
    expect(csvCell('plain')).toBe('plain')
    expect(csvCell('a, b')).toBe('"a, b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('two\nlines')).toBe('"two\nlines"')
    expect(csvCell(null)).toBe('')
    expect(csvCell(12)).toBe('12')
  })

  it('keeps typed text from running as a spreadsheet formula', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`)
    expect(csvCell('+1 555')).toBe("'+1 555")
    expect(csvCell('@here')).toBe("'@here")
  })

  it('writes a header and rows with Excel line endings', () => {
    expect(toCsv(['A', 'B'], [[1, 'x']])).toBe('A,B\r\n1,x\r\n')
  })
})

describe('parseAvailKey', () => {
  const ids = ['12', '12_b', '7']

  it('reads a date, a later day, and a whole series', () => {
    expect(parseAvailKey('7_2026-06-05', ids)).toEqual({
      eventId: '7',
      date: '2026-06-05',
      day: '',
    })
    expect(parseAvailKey('7_2026-06-06_d2', ids)).toEqual({
      eventId: '7',
      date: '2026-06-06',
      day: 'Day 2',
    })
    expect(parseAvailKey('12_series', ids)).toEqual({ eventId: '12', date: '', day: 'Every date' })
  })

  it('matches the longest event id, so an underscore in one is not cut short', () => {
    expect(parseAvailKey('12_b_2026-01-01', ids)?.eventId).toBe('12_b')
  })

  it('skips keys for events that no longer exist', () => {
    expect(parseAvailKey('99_2026-01-01', ids)).toBeNull()
  })
})

describe('availabilityCsv', () => {
  it('lists each answer with the event, date, person and note', () => {
    const events = [{ id: '7', title: 'Retreat', isRec: false }] as EventTemplate[]
    const r = (status: AvailResponse['status'], note = ''): AvailResponse => ({
      status,
      note,
      uid: '',
      ts: 0,
    })
    const csv = availabilityCsv(
      { '7_2026-06-05': { u1: r('yes'), u2: r('no', 'Work, sorry') } },
      events,
      (uid) => (uid === 'u1' ? 'Ann' : 'Ben')
    )
    expect(csv).toBe(
      'Event,Date,Day,Person,Answer,Note\r\n' +
        'Retreat,2026-06-05,,Ann,Available,\r\n' +
        'Retreat,2026-06-05,,Ben,Not available,"Work, sorry"\r\n'
    )
  })
})

describe('eventsCsv', () => {
  it('leaves deleted events out', () => {
    const csv = eventsCsv([
      { id: '1', title: 'Kept', isRec: false, date: '2026-01-01' },
      { id: '2', title: 'Gone', isRec: false, deleted: true },
    ] as EventTemplate[])
    expect(csv).toContain('Kept')
    expect(csv).not.toContain('Gone')
  })
})
