import { describe, it, expect } from 'vitest'
import { alertCoversDate, alertsForDate } from './weather'

const alert = (effective: string, expires: string) => ({ effective, expires })

describe('alertCoversDate', () => {
  it('covers an event inside the window', () => {
    const a = alert('2026-03-10T12:00:00Z', '2026-03-12T12:00:00Z')

    expect(alertCoversDate(a, '2026-03-11')).toBe(true)
  })

  it('covers the first and last day of the window', () => {
    // A warning that expires at noon still matters to an event that morning.
    const a = alert('2026-03-10T18:00:00Z', '2026-03-12T06:00:00Z')

    expect(alertCoversDate(a, '2026-03-10')).toBe(true)
    expect(alertCoversDate(a, '2026-03-12')).toBe(true)
  })

  it('does not cover an event before it starts', () => {
    const a = alert('2026-03-10T12:00:00Z', '2026-03-12T12:00:00Z')

    expect(alertCoversDate(a, '2026-03-09')).toBe(false)
  })

  it('does not cover an event after it expires', () => {
    // The reported bug: an alert active today showing on every future event.
    const a = alert('2026-03-10T12:00:00Z', '2026-03-12T12:00:00Z')

    expect(alertCoversDate(a, '2026-06-01')).toBe(false)
  })

  it('shows an alert with no window rather than hiding it', () => {
    // A warning missed is worse than one shown early.
    expect(alertCoversDate(alert('', ''), '2026-03-11')).toBe(true)
  })

  it('handles a window open at one end', () => {
    expect(alertCoversDate(alert('2026-03-10T12:00:00Z', ''), '2026-03-11')).toBe(true)
    expect(alertCoversDate(alert('2026-03-10T12:00:00Z', ''), '2026-03-09')).toBe(false)
    expect(alertCoversDate(alert('', '2026-03-12T12:00:00Z'), '2026-03-11')).toBe(true)
    expect(alertCoversDate(alert('', '2026-03-12T12:00:00Z'), '2026-03-13')).toBe(false)
  })

  it('shows an alert whose dates are unparseable', () => {
    expect(alertCoversDate(alert('not a date', 'nonsense'), '2026-03-11')).toBe(true)
  })

  it('covers nothing when the event has no date', () => {
    expect(alertCoversDate(alert('2026-03-10T12:00:00Z', '2026-03-12T12:00:00Z'), '')).toBe(false)
  })
})

describe('alertsForDate', () => {
  it('keeps only the alerts covering that day', () => {
    const alerts = [
      { id: 'a', effective: '2026-03-10T00:00:00Z', expires: '2026-03-12T00:00:00Z' },
      { id: 'b', effective: '2026-06-01T00:00:00Z', expires: '2026-06-02T00:00:00Z' },
    ]

    expect(alertsForDate(alerts, '2026-03-11').map((a) => a.id)).toEqual(['a'])
  })

  it('returns nothing when none apply, so no badge shows', () => {
    const alerts = [{ id: 'a', effective: '2026-03-10T00:00:00Z', expires: '2026-03-12T00:00:00Z' }]

    expect(alertsForDate(alerts, '2026-09-01')).toEqual([])
  })
})
