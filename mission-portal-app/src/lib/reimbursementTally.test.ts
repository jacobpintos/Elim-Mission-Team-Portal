import { describe, it, expect } from 'vitest'
import {
  tally,
  tallyByEvent,
  accountantAttention,
  kindOf,
  filterForFinance,
  moneyBriefing,
} from './reimbursementTally'
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

describe('filterForFinance', () => {
  const rs = [
    req({ eventTitle: 'Youth Retreat', eventDate: '2026-03-10' }),
    req({ eventTitle: 'Mission Trip Haiti', eventDate: '2026-07-01' }),
    req({ eventTitle: 'Youth Lock-in', eventDate: '2026-11-20' }),
    req({ eventTitle: 'Supplies', eventDate: null, createdAt: Date.UTC(2026, 6, 4) }),
  ]
  const titles = (f: Parameters<typeof filterForFinance>[1]) =>
    filterForFinance(rs, f).map((r) => r.eventTitle)

  it('matches every word of the search in the event name, in any case', () => {
    expect(titles({ query: 'youth', from: '', to: '' })).toEqual(['Youth Retreat', 'Youth Lock-in'])
    expect(titles({ query: 'TRIP haiti', from: '', to: '' })).toEqual(['Mission Trip Haiti'])
  })

  it('keeps what falls in the range, inclusive, dating an undated cost by when it was asked', () => {
    expect(titles({ query: '', from: '2026-07-01', to: '2026-07-31' })).toEqual([
      'Mission Trip Haiti',
      'Supplies',
    ])
    expect(titles({ query: 'youth', from: '2026-06-01', to: '' })).toEqual(['Youth Lock-in'])
  })
})

describe('moneyBriefing', () => {
  const SINCE = 1_000
  const titles = (b: ReturnType<typeof moneyBriefing>) => ({
    attention: b.attention.map((l) => l.title),
    news: b.news.map((l) => l.title),
  })

  it('tells the one who asked of a decision since yesterday, and opens its task', () => {
    const b = moneyBriefing(
      [
        req({
          status: 'approved',
          approvedAmount: 4250,
          total: 4250,
          payBy: '2026-11-30',
          decidedAt: 2_000,
          taskId: 7,
        }),
        req({
          status: 'partial',
          approvedAmount: 3000,
          total: 5000,
          reason: 'No receipt for the gas',
          payBy: '2026-12-01',
          decidedAt: 2_000,
        }),
        req({ status: 'denied', total: 1200, reason: 'Not for an event', decidedAt: 2_000 }),
        // Decided before yesterday: old news.
        req({ status: 'approved', approvedAmount: 900, payBy: '2026-11-30', decidedAt: 10 }),
      ],
      'u1',
      SINCE
    )
    expect(titles(b)).toEqual({
      attention: [],
      news: [
        'Reimbursement approved: $42.50',
        'Reimbursement partly approved: $30.00 of $50.00',
        'Reimbursement denied: $12.00',
      ],
    })
    expect(b.news[0]).toMatchObject({
      sub: 'Retreat · to be paid by Nov 30',
      spoken: 'your $42.50 reimbursement for Retreat was approved, to be paid by Nov 30',
      taskId: 7,
    })
    expect(b.news[1].sub).toBe('Retreat · No receipt for the gas')
  })

  it('tells them it was paid — once paid, not that it was approved', () => {
    const b = moneyBriefing(
      [
        req({
          status: 'paid',
          approvedAmount: 4250,
          payBy: '2026-11-30',
          decidedAt: 2_000,
          paidAt: 3_000,
        }),
      ],
      'u1',
      SINCE
    )
    expect(titles(b).news).toEqual(['Reimbursement paid: $42.50'])
    expect(b.news[0].sub).toBe('Retreat · from Sunny')
  })

  it('asks them to answer a change of pay date, until they do', () => {
    const asked = req({
      status: 'approved',
      approvedAmount: 1000,
      payBy: '2026-11-30',
      decidedAt: 10,
      dateChange: { proposed: '2026-12-05', reason: 'Deposit', requestedAt: 10 },
    })
    const b = moneyBriefing([asked], 'u1', SINCE)
    expect(b.attention).toEqual([
      {
        title: 'New pay date to answer: Retreat',
        sub: 'Sunny asked to move it from Nov 30 to Dec 5',
        spoken: 'Sunny asked to move your Retreat reimbursement to Dec 5',
        taskId: 1,
      },
    ])
    // The Accountant who asked is waiting, not asked anything.
    expect(moneyBriefing([asked], 'acc', SINCE)).toEqual({ attention: [], news: [] })
  })

  it('tells the Accountant how a date change they asked for was answered', () => {
    const b = moneyBriefing(
      [
        req({
          status: 'approved',
          payBy: '2026-12-05',
          dateAnswer: { accepted: true, proposed: '2026-12-05', at: 2_000 },
        }),
        req({
          status: 'approved',
          payBy: '2026-11-30',
          dateAnswer: { accepted: false, proposed: '2026-12-05', at: 2_000 },
        }),
        req({
          status: 'approved',
          payBy: '2026-11-30',
          dateAnswer: { accepted: false, proposed: '2026-12-05', at: 10 },
        }),
      ],
      'acc',
      SINCE
    )
    expect(b.news.map((l) => [l.title, l.sub])).toEqual([
      ['New pay date accepted: Jane', 'Retreat · now due Dec 5'],
      ['Pay date kept: Jane', 'Retreat · asked Dec 5, still due Nov 30'],
    ])
    // Nor is the one who answered told of their own answer.
    expect(
      moneyBriefing(
        [req({ dateAnswer: { accepted: true, proposed: '2026-12-05', at: 2_000 } })],
        'u1',
        SINCE
      ).news
    ).toEqual([])
  })

  it('tells no one of anyone else’s, and nothing of an outside bill', () => {
    const r = req({ status: 'approved', payBy: '2026-11-30', decidedAt: 2_000 })
    expect(moneyBriefing([r], 'someone', SINCE)).toEqual({ attention: [], news: [] })
    const bill = req({ kind: 'external', submitterUid: '', status: 'paid', paidAt: 2_000 })
    expect(moneyBriefing([bill], '', SINCE)).toEqual({ attention: [], news: [] })
  })
})
