import { describe, expect, it } from 'vitest'
import { expirySaid, postedWhen } from './postedWhen'

const at = (s: string) => new Date(s).getTime()
const NOW = at('2026-11-02T19:30:00')

describe('when an announcement went up', () => {
  it('close by, the time; further off, the day', () => {
    expect(postedWhen(NOW - 20_000, NOW)).toBe('Just now')
    expect(postedWhen(NOW - 12 * 60_000, NOW)).toBe('12 min ago')
    expect(postedWhen(at('2026-11-02T09:05:00'), NOW)).toBe('Today at 9:05 AM')
    expect(postedWhen(at('2026-11-01T21:15:00'), NOW)).toBe('Yesterday at 9:15 PM')
    expect(postedWhen(at('2026-10-29T10:00:00'), NOW)).toBe('Thursday')
    expect(postedWhen(at('2026-10-20T10:00:00'), NOW)).toBe('Oct 20')
    expect(postedWhen(at('2025-12-24T10:00:00'), NOW)).toBe('Dec 24, 2025')
  })

  it('when it goes, for an admin', () => {
    expect(expirySaid('2026-11-20', '2026-11-02')).toEqual({
      text: 'Deletes after Nov 20',
      past: false,
    })
    expect(expirySaid('2026-11-01', '2026-11-02')).toEqual({
      text: 'Expired Nov 1 — deletes overnight',
      past: true,
    })
    expect(expirySaid('2027-01-05', '2026-11-02').text).toBe('Deletes after Jan 5, 2027')
  })
})
