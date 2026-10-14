import { describe, it, expect } from 'vitest'
import {
  cleanItems,
  cleanDecision,
  totalOf,
  formatCents,
  formatDate,
  isIsoDate,
  taskStatusFor,
  decisionMessage,
  payDateRequestMessage,
  canDecide,
  isAwaitingPayment,
  receiptsKeptUntil,
  receiptsDue,
} from '../../functions/src/reimbursements/logic'

const TODAY = '2026-10-14'
const named = {
  submitterName: 'Jane Doe',
  accountantName: 'Sunny Singh',
  eventTitle: 'Youth Retreat',
}

describe('cleanItems', () => {
  it('keeps described, positive, whole-cent items', () => {
    expect(
      cleanItems([
        { description: ' Gas ', amount: 4520 },
        { description: 'Snacks', amount: 1210 },
      ])
    ).toEqual([
      { description: 'Gas', amount: 4520 },
      { description: 'Snacks', amount: 1210 },
    ])
  })

  it('refuses an empty request, a missing description and a bad amount', () => {
    expect(cleanItems([])).toBeTypeOf('string')
    expect(cleanItems([{ description: '', amount: 100 }])).toBeTypeOf('string')
    expect(cleanItems([{ description: 'Gas', amount: 0 }])).toBeTypeOf('string')
    expect(cleanItems([{ description: 'Gas', amount: -5 }])).toBeTypeOf('string')
    expect(cleanItems([{ description: 'Gas', amount: 12.5 }])).toBeTypeOf('string')
    expect(cleanItems('nope')).toBeTypeOf('string')
  })
})

describe('totalOf and formatCents', () => {
  it('adds in cents, so dollars come out exact', () => {
    const total = totalOf([
      { description: 'a', amount: 1210 },
      { description: 'b', amount: 330 },
    ])
    expect(total).toBe(1540)
    expect(formatCents(total)).toBe('$15.40')
    expect(formatCents(123456)).toBe('$1,234.56')
    expect(formatCents(5)).toBe('$0.05')
  })
})

describe('isIsoDate and formatDate', () => {
  it('accepts real dates only', () => {
    expect(isIsoDate('2026-10-30')).toBe(true)
    expect(isIsoDate('2026-02-30')).toBe(false)
    expect(isIsoDate('10/30/26')).toBe(false)
  })

  it('reads a date the way a person does', () => {
    expect(formatDate('2026-10-30')).toBe('Oct 30, 2026')
  })
})

describe('cleanDecision', () => {
  it('approves the whole amount with a pay-by date', () => {
    expect(cleanDecision({ decision: 'approve', payBy: '2026-10-30' }, 5000, TODAY)).toEqual({
      status: 'approved',
      approvedAmount: 5000,
      reason: '',
      payBy: '2026-10-30',
    })
  })

  it('needs a pay-by date that has not passed', () => {
    expect(cleanDecision({ decision: 'approve' }, 5000, TODAY)).toBeTypeOf('string')
    expect(cleanDecision({ decision: 'approve', payBy: '2026-10-01' }, 5000, TODAY)).toBeTypeOf(
      'string'
    )
  })

  it('partially approves less than the whole, with a reason', () => {
    expect(
      cleanDecision(
        {
          decision: 'partial',
          approvedAmount: 3000,
          reason: 'Snacks are not covered',
          payBy: '2026-10-30',
        },
        5000,
        TODAY
      )
    ).toEqual({
      status: 'partial',
      approvedAmount: 3000,
      reason: 'Snacks are not covered',
      payBy: '2026-10-30',
    })
  })

  it('refuses a partial approval with no reason, or for the whole amount or more', () => {
    const base = { decision: 'partial' as const, payBy: '2026-10-30' }
    expect(cleanDecision({ ...base, approvedAmount: 3000 }, 5000, TODAY)).toBeTypeOf('string')
    expect(cleanDecision({ ...base, approvedAmount: 5000, reason: 'x' }, 5000, TODAY)).toBeTypeOf(
      'string'
    )
    expect(cleanDecision({ ...base, approvedAmount: 0, reason: 'x' }, 5000, TODAY)).toBeTypeOf(
      'string'
    )
  })

  it('denies only with a reason, and with no date to pay by', () => {
    expect(cleanDecision({ decision: 'deny' }, 5000, TODAY)).toBeTypeOf('string')
    expect(cleanDecision({ decision: 'deny', reason: 'Personal purchase' }, 5000, TODAY)).toEqual({
      status: 'denied',
      approvedAmount: 0,
      reason: 'Personal purchase',
      payBy: null,
    })
  })
})

describe('where a request stands', () => {
  it('is decided once, and awaits payment only once approved', () => {
    expect(canDecide('submitted')).toBe(true)
    expect(canDecide('approved')).toBe(false)
    expect(isAwaitingPayment('approved')).toBe(true)
    expect(isAwaitingPayment('partial')).toBe(true)
    expect(isAwaitingPayment('denied')).toBe(false)
    expect(isAwaitingPayment('paid')).toBe(false)
  })

  it('moves the task along with it', () => {
    expect(taskStatusFor('submitted')).toBe('pending')
    expect(taskStatusFor('partial')).toBe('in_progress')
    expect(taskStatusFor('denied')).toBe('done')
    expect(taskStatusFor('paid')).toBe('done')
  })
})

describe('messages', () => {
  it('says how much of a partial approval, by when, and why not the rest', () => {
    const msg = decisionMessage(
      { ...named, total: 5000 },
      {
        status: 'partial',
        approvedAmount: 3000,
        reason: 'Snacks are not covered.',
        payBy: '2026-10-30',
      }
    )
    expect(msg).toContain('$30.00 of your $50.00')
    expect(msg).toContain('Oct 30, 2026')
    expect(msg).toContain('Snacks are not covered.')
  })

  it('names both dates when asking to move one', () => {
    const msg = payDateRequestMessage(
      { ...named, payBy: '2026-10-30' },
      { proposed: '2026-11-06', reason: 'Waiting on the bank.' }
    )
    expect(msg).toContain('Sunny Singh')
    expect(msg).toContain('Oct 30, 2026')
    expect(msg).toContain('Nov 6, 2026')
  })
})

describe('keeping receipts for two years', () => {
  const made = Date.UTC(2026, 9, 14, 12)

  it('keeps them until two calendar years after the request', () => {
    expect(new Date(receiptsKeptUntil(made)).toISOString().slice(0, 10)).toBe('2028-10-14')
  })

  it('removes a closed request’s files once that has passed, and not before', () => {
    const r = { createdAt: made, status: 'paid' as const, receipts: ['a.jpg'] }
    expect(receiptsDue(r, Date.UTC(2028, 9, 13))).toBe(false)
    expect(receiptsDue(r, Date.UTC(2028, 9, 15))).toBe(true)
    expect(receiptsDue({ ...r, status: 'denied' }, Date.UTC(2028, 9, 15))).toBe(true)
  })

  it('keeps an open request’s files, and has nothing to do with none left', () => {
    const later = Date.UTC(2029, 0, 1)
    expect(receiptsDue({ createdAt: made, status: 'approved', receipts: ['a.jpg'] }, later)).toBe(
      false
    )
    expect(receiptsDue({ createdAt: made, status: 'paid', receipts: [] }, later)).toBe(false)
  })
})
