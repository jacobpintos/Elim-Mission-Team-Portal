import { describe, it, expect } from 'vitest'
import { alertCoversDate } from './weather'

/**
 * Mirror of upcomingDates() in functions/src/weatherAlerts.ts.
 *
 * functions/ is a separate TypeScript project with its own build and the app
 * test runner does not compile it, so this copy exists to pin the rule that
 * decides which days an event occupies — which is what an alert is now
 * matched against. If the function changes, this must change with it.
 *
 * alertCoversDate is imported from the app rather than copied: the function
 * holds a hand-kept mirror of it, and these tests assert the two agree.
 */
interface TemplateRaw {
  isRec?: boolean
  date?: string
  extraDays?: { date?: string }[]
  recDay?: number
  recur?: string
  recEnd?: string | null
  isVirtual?: boolean
  _geocodeLat?: number
  _geocodeLng?: number
}

function upcomingDates(t: TemplateRaw, todayStr: string, limitStr: string): string[] {
  if (t.isVirtual) return []
  if (!t._geocodeLat || !t._geocodeLng) return []
  if (t.recEnd && t.recEnd < todayStr) return []

  const inWindow = (d?: string): boolean => !!d && d >= todayStr && d <= limitStr

  if (!t.isRec) {
    const days = [t.date, ...(t.extraDays ?? []).map((e) => e.date)].filter(inWindow) as string[]
    return [...new Set(days)].sort()
  }

  const limit = t.recEnd && t.recEnd < limitStr ? t.recEnd : limitStr
  if (limit < todayStr) return []

  const step = t.recur === 'biweekly' ? 14 : t.recur === 'monthly' ? 30 : 7
  const d = new Date(todayStr + 'T00:00:00Z')
  const end = new Date(limit + 'T00:00:00Z')

  if (t.recDay === undefined) return []
  while (d.getUTCDay() !== t.recDay) d.setUTCDate(d.getUTCDate() + 1)

  const dates: string[] = []
  let n = 0
  while (d <= end && n < 60) {
    dates.push(d.toISOString().split('T')[0])
    d.setUTCDate(d.getUTCDate() + step)
    n++
  }
  return dates
}

/** A physical event with coordinates, which is all the check requires. */
const placed = (extra: TemplateRaw = {}): TemplateRaw => ({
  _geocodeLat: 41.7,
  _geocodeLng: -91.6,
  ...extra,
})

// 2026-03-02 is a Monday.
const TODAY = '2026-03-02'
const LIMIT = '2026-03-09'

describe('upcomingDates', () => {
  it('gives a one-off event its own day', () => {
    expect(upcomingDates(placed({ date: '2026-03-05' }), TODAY, LIMIT)).toEqual(['2026-03-05'])
  })

  it('includes the further days of a multi-day event', () => {
    // Only the first day counted before, so an alert covering day three was
    // never matched and the rest of a trip went unchecked.
    const trip = placed({
      date: '2026-03-03',
      extraDays: [{ date: '2026-03-04' }, { date: '2026-03-05' }],
    })

    expect(upcomingDates(trip, TODAY, LIMIT)).toEqual(['2026-03-03', '2026-03-04', '2026-03-05'])
  })

  it('keeps only the extra days that fall inside the window', () => {
    const trip = placed({ date: '2026-03-03', extraDays: [{ date: '2026-06-01' }] })

    expect(upcomingDates(trip, TODAY, LIMIT)).toEqual(['2026-03-03'])
  })

  it('still covers a trip whose first day has passed', () => {
    // The event started before today but is still running, so its remaining
    // days need watching.
    const trip = placed({ date: '2026-02-28', extraDays: [{ date: '2026-03-04' }] })

    expect(upcomingDates(trip, TODAY, LIMIT)).toEqual(['2026-03-04'])
  })

  it('does not list the same day twice', () => {
    const trip = placed({ date: '2026-03-03', extraDays: [{ date: '2026-03-03' }] })

    expect(upcomingDates(trip, TODAY, LIMIT)).toEqual(['2026-03-03'])
  })

  it('ignores a one-off outside the window', () => {
    expect(upcomingDates(placed({ date: '2026-04-20' }), TODAY, LIMIT)).toEqual([])
    expect(upcomingDates(placed({ date: '2026-01-01' }), TODAY, LIMIT)).toEqual([])
  })

  it('skips virtual events, which have no weather', () => {
    expect(upcomingDates(placed({ date: '2026-03-05', isVirtual: true }), TODAY, LIMIT)).toEqual([])
  })

  it('skips an event with no coordinates', () => {
    const nowhere = { date: '2026-03-05' }

    expect(upcomingDates(nowhere, TODAY, LIMIT)).toEqual([])
  })

  it('lists each weekly occurrence in the window', () => {
    // recDay 3 is Wednesday.
    const out = upcomingDates(placed({ isRec: true, recur: 'weekly', recDay: 3 }), TODAY, LIMIT)

    expect(out).toEqual(['2026-03-04'])
  })

  it('lists several when the window holds several', () => {
    const out = upcomingDates(
      placed({ isRec: true, recur: 'weekly', recDay: 1 }),
      TODAY,
      '2026-03-23'
    )

    expect(out).toEqual(['2026-03-02', '2026-03-09', '2026-03-16', '2026-03-23'])
  })

  it('steps a fortnight for biweekly', () => {
    const out = upcomingDates(
      placed({ isRec: true, recur: 'biweekly', recDay: 1 }),
      TODAY,
      '2026-03-30'
    )

    expect(out).toEqual(['2026-03-02', '2026-03-16', '2026-03-30'])
  })

  it('stops at the recurrence end', () => {
    const out = upcomingDates(
      placed({ isRec: true, recur: 'weekly', recDay: 1, recEnd: '2026-03-10' }),
      TODAY,
      '2026-03-23'
    )

    expect(out).toEqual(['2026-03-02', '2026-03-09'])
  })

  it('drops a recurrence that has already ended', () => {
    const out = upcomingDates(
      placed({ isRec: true, recur: 'weekly', recDay: 1, recEnd: '2026-01-01' }),
      TODAY,
      LIMIT
    )

    expect(out).toEqual([])
  })

  it('claims no days for a recurring event with no weekday set', () => {
    // It used to claim every day by answering "yes, upcoming" with no date to
    // check against, which is how an alert for any day at all got through.
    const out = upcomingDates(placed({ isRec: true, recur: 'weekly' }), TODAY, LIMIT)

    expect(out).toEqual([])
  })
})

describe('an alert is only sent for a day the event is on', () => {
  // The reported bug: a notification about a day with no event on it.
  const alert = (effective: string, expires: string) => ({ effective, expires })

  it('drops an alert whose window ends before the event', () => {
    const dates = upcomingDates(placed({ date: '2026-03-07' }), TODAY, LIMIT)
    const today = alert('2026-03-02T06:00:00Z', '2026-03-02T18:00:00Z')

    expect(dates.some((d) => alertCoversDate(today, d))).toBe(false)
  })

  it('drops an alert whose window starts after the event', () => {
    const dates = upcomingDates(placed({ date: '2026-03-03' }), TODAY, LIMIT)
    const later = alert('2026-03-08T06:00:00Z', '2026-03-09T18:00:00Z')

    expect(dates.some((d) => alertCoversDate(later, d))).toBe(false)
  })

  it('sends one that covers the day', () => {
    const dates = upcomingDates(placed({ date: '2026-03-07' }), TODAY, LIMIT)
    const spanning = alert('2026-03-06T12:00:00Z', '2026-03-08T12:00:00Z')

    expect(dates.some((d) => alertCoversDate(spanning, d))).toBe(true)
  })

  it('sends when any one occurrence of a recurring event is covered', () => {
    const dates = upcomingDates(
      placed({ isRec: true, recur: 'weekly', recDay: 1 }),
      TODAY,
      '2026-03-23'
    )
    const third = alert('2026-03-16T00:00:00Z', '2026-03-16T23:00:00Z')

    expect(dates.some((d) => alertCoversDate(third, d))).toBe(true)
  })

  it('still sends an alert with no window at all', () => {
    // Unplaceable in time, so sent rather than dropped — a warning missed is
    // worse than one sent early. Matches what the event card shows.
    const dates = upcomingDates(placed({ date: '2026-03-07' }), TODAY, LIMIT)

    expect(dates.some((d) => alertCoversDate({ effective: '', expires: '' }, d))).toBe(true)
  })

  it('sends nothing at all for an event with no upcoming days', () => {
    const dates = upcomingDates(placed({ date: '2026-09-01' }), TODAY, LIMIT)
    const anything = alert('2026-03-02T00:00:00Z', '2026-03-09T00:00:00Z')

    expect(dates.some((d) => alertCoversDate(anything, d))).toBe(false)
  })
})
