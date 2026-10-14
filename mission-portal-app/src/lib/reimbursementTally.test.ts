import { describe, it, expect } from 'vitest'
import { tally, tallyByEvent, accountantAttention, kindOf } from './reimbursementTally'
import type { Reimbursement } from '@/types/reimbursement'

let n = 0
const req = (over: Partial<Reimbursement>): Reimbursement =>
  ({
    id: `r${++n}`,
    submitterUid: 'u1',
    submitterName: 'Jane',
    accountantUid: 'acc',
    accountantName: 'Sunny',
    eventId: 'e1',
    eventTitle: 'Retreat',
    eventDate: '2026-11-20',
    items: [],
    total: 1000,
    receipts: [],
    note: '',
    status: 'submitted',
    approvedAmount: null,
    reason: '',
    payBy: null,
    dateChange: null,
    taskId: 1,
    createdAt: 0,
    ...over,
  }) as Reimbursement

describe('tally', () => {
  it('splits what is awaiting a decision, owed, paid and denied', () => {
    const t = tally([
      req({ status: 'submitted', total: 1000 }),
      req({ status: 'partial', total: 5000, approvedAmount: 3000 }),
      req({ status: 'paid', total: 2000, approvedAmount: 2000 }),
      req({ status: 'denied', total: 700 }),
      req({ kind: 'external', status: 'approved', total: 40000, approvedAmount: 40000 }),
    ])
    expect(t.awaitingDecision).toBe(1000)
    expect(t.owed).toBe(3000 + 40000)
    expect(t.paid).toBe(2000)
    expect(t.approved).toBe(3000 + 2000 + 40000)
    expect(t.denied).toBe(700)
    // What the costs are, by kind: asked where undecided, approved where decided.
    expect(t.internal).toBe(1000 + 3000 + 2000)
    expect(t.external).toBe(40000)
    expect(t.count).toBe(5)
  })
})

describe('tallyByEvent', () => {
  it('groups by event, the most recent first', () => {
    const rows = tallyByEvent([
      req({ eventId: 'old', eventTitle: 'Spring', eventDate: '2026-03-01', total: 100 }),
      req({ eventId: 'new', eventTitle: 'Fall', eventDate: '2026-10-01', total: 200 }),
      req({ eventId: 'new', eventTitle: 'Fall', eventDate: '2026-10-01', total: 300 }),
    ])
    expect(rows.map((r) => r.eventTitle)).toEqual(['Fall', 'Spring'])
    expect(rows[0].awaitingDecision).toBe(500)
    expect(rows[0].requests).toHaveLength(2)
  })
})

describe('kindOf', () => {
  it('reads requests made before there were two kinds as internal', () => {
    expect(kindOf({})).toBe('internal')
    expect(kindOf({ kind: 'external' })).toBe('external')
  })
})

describe('accountantAttention', () => {
  it('names what to decide, what is overdue and what is due this week', () => {
    const items = accountantAttention(
      [
        req({ status: 'submitted', total: 1200, submitterName: 'Jane' }),
        req({
          status: 'approved',
          approvedAmount: 5000,
          payBy: '2026-10-10',
          submitterName: 'Bob',
        }),
        req({
          kind: 'external',
          payee: 'Hertz',
          status: 'approved',
          approvedAmount: 40000,
          payBy: '2026-10-16',
        }),
        req({ status: 'approved', approvedAmount: 900, payBy: '2026-12-01' }),
        req({ status: 'paid', approvedAmount: 900, payBy: '2026-10-01' }),
      ],
      '2026-10-14',
      '2026-10-21'
    )
    expect(items.map((i) => i.kind)).toEqual(['decide', 'overdue', 'week'])
    expect(items[0].sub).toBe('$12.00 asked · Jane')
    expect(items[1].title).toBe('Payment overdue: Bob')
    expect(items[2].sub).toBe('$400.00 · Hertz')
  })

  it('says nothing when nothing needs them', () => {
    expect(accountantAttention([req({ status: 'paid' })], '2026-10-14', '2026-10-21')).toEqual([])
  })
})
