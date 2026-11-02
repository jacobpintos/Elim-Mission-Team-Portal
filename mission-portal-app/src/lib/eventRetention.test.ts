import { describe, it, expect } from 'vitest'
import {
  coverUrlsOf,
  daysBefore,
  lastDayOf,
  monthsBefore,
  pastKeeping,
  storagePathOf,
  travelFoldersOf,
} from '../../functions/src/eventRetention'

describe('event retention', () => {
  it('counts back months and days', () => {
    expect(monthsBefore('2026-11-02', 12)).toBe('2025-11-02')
    expect(monthsBefore('2026-03-31', 1)).toBe('2026-02-28')
    expect(monthsBefore('2026-01-15', 1)).toBe('2025-12-15')
    expect(daysBefore('2026-11-02', 90)).toBe('2026-08-04')
  })

  it('an event’s last day: a one-off’s last date, a series’ end, else none', () => {
    expect(lastDayOf({ date: '2025-06-01' })).toBe('2025-06-01')
    expect(
      lastDayOf({ date: '2025-06-01', extraDays: [{ date: '2025-06-03' }, { date: '2025-06-02' }] })
    ).toBe('2025-06-03')
    expect(lastDayOf({ isRec: true, date: '2024-01-07', recEnd: '2025-05-25' })).toBe('2025-05-25')
    expect(lastDayOf({ isRec: true, date: '2024-01-07' })).toBeNull()
    expect(lastDayOf({ date: '' })).toBeNull()
  })

  it('past keeping: over 12 months gone — not a series still going, nor a draft with no date', () => {
    const cutoff = monthsBefore('2026-11-02', 12)
    expect(pastKeeping({ date: '2025-11-01' }, cutoff)).toBe(true)
    expect(pastKeeping({ date: '2025-11-02' }, cutoff)).toBe(false)
    expect(pastKeeping({ date: '2025-10-01', extraDays: [{ date: '2025-12-01' }] }, cutoff)).toBe(
      false
    )
    expect(pastKeeping({ isRec: true, date: '2020-01-05' }, cutoff)).toBe(false)
    expect(pastKeeping({ isRec: true, date: '2020-01-05', recEnd: '2025-01-01' }, cutoff)).toBe(
      true
    )
    expect(pastKeeping({}, cutoff)).toBe(false)
  })

  it('finds an event’s pictures', () => {
    const url =
      'https://firebasestorage.googleapis.com/v0/b/demo.appspot.com/o/pages%2Fevent-covers%2F123_a.jpg?alt=media&token=x'
    expect(storagePathOf(url)).toBe('pages/event-covers/123_a.jpg')
    expect(storagePathOf('https://example.com/a.jpg')).toBeNull()
    expect(
      coverUrlsOf({ coverImage: url, overrides: { 'e_2026-01-01': { coverImage: url }, x: {} } })
    ).toEqual([url])
    expect(
      travelFoldersOf({
        flightEntries: [{ id: 'f1' }],
        lodgingEntries: [{ id: 'h 2' }],
        overrides: { 'e_2026-01-01': { flightEntries: [{ id: 'f9' }] } },
      })
    ).toEqual(['eventFlights/f1/', 'eventLodging/h_2/', 'eventFlights/f9/'])
  })
})
