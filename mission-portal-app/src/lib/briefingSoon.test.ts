import { describe, it, expect } from 'vitest'
import { buildBriefing, type BriefingInput } from './briefing'

// Friday, November 13: nothing today; Sunday's service next; Monday's event
// in the week after — three days off.
const now = new Date(2026, 10, 13, 10, 5)
const input = (templates: unknown[], over: Partial<BriefingInput> = {}): BriefingInput => ({
  now,
  firstName: 'Jacob',
  viewer: { uid: 'me', roles: ['admin'] },
  groups: [],
  names: new Map([['me', 'Jacob']]),
  templates: templates as never,
  overrides: {},
  tasks: [],
  reminders: [],
  announcements: [],
  unread: [],
  attention: [],
  ...over,
})
const sunday = {
  id: 'svc',
  title: 'Sunday Service',
  isRec: true,
  recur: 'weekly',
  recDay: 0,
  users: ['me'],
}
const monday = { id: 'pte', title: 'Public Test Event', date: '2026-11-16', startTime: '7:00 PM' }

describe('the daily briefing: coming up', () => {
  it('shows the days ahead past the week’s end — Monday’s, on a Friday — besides what’s next', () => {
    const b = buildBriefing(input([sunday, monday]))
    expect(b.next?.title).toBe('Sunday Service')
    expect(b.soon.map((e) => [e.title, e.time, e.meridiem])).toEqual([
      ['Public Test Event', 'Mon', 'Nov 16'],
    ])
    expect(b.spoken).toContain('Coming up: Public Test Event on Monday.')
  })

  it('never a weekly event again that is already shown, nor anything a week off and more', () => {
    const later = { id: 'nye', title: 'New Years Eve', date: '2026-12-31' }
    const b = buildBriefing(input([sunday, monday, later]))
    expect(b.soon.map((e) => e.title)).toEqual(['Public Test Event'])
  })

  it('says “tomorrow”, and keeps their own first when there are more than four', () => {
    const day = (n: number) => `2026-11-${String(13 + n).padStart(2, '0')}`
    const others = [1, 2, 3, 4, 5].map((n) => ({ id: `o${n}`, title: `Other ${n}`, date: day(n) }))
    const mine = { id: 'mine', title: 'Mine', date: day(6), users: ['me'] }
    const b = buildBriefing(input([...others, mine]))
    // The next is the first of theirs; the rest, by date, theirs kept.
    expect(b.next?.title).toBe('Mine')
    expect(b.soon.map((e) => e.title)).toEqual(['Other 1', 'Other 2', 'Other 3', 'Other 4'])
    expect(b.spoken).toContain('Coming up: Other 1 tomorrow, Other 2 on Sunday')
  })

  it('with nothing ahead, has nothing coming up and says nothing of it', () => {
    const b = buildBriefing(input([]))
    expect(b.soon).toEqual([])
    expect(b.spoken).not.toContain('Coming up')
  })
})
