import { describe, expect, it } from 'vitest'
import {
  blockAnswer,
  blockOf,
  blockProblem,
  blockSpan,
  blockedKeys,
  dateOfKey,
  daysIn,
  liftAnswer,
  type Answer,
  type Block,
} from '../../functions/src/blockedDates'
import type { EventTemplate, Group } from '../../functions/src/miriam/data'

const TODAY = '2026-11-02'
const block: Block = {
  id: 'b1',
  uid: 'u1',
  from: '2026-11-17',
  to: '2026-11-21',
  reason: 'Vacation',
}
const groups: Group[] = [{ id: 'g1', name: 'Band', members: ['u1', 'u2'] }]
const ev = (over: Partial<EventTemplate> & Record<string, unknown> = {}) =>
  ({ id: 'e1', title: 'Revival', date: '2026-11-18', users: ['u1'], ...over }) as EventTemplate

describe('a block, asked for', () => {
  it('takes a first and last day, today or later, a year at most', () => {
    expect(blockProblem('2026-11-17', '2026-11-21', TODAY)).toBeNull()
    expect(blockProblem('2026-11-02', '2026-11-02', TODAY)).toBeNull()
    expect(blockProblem('2026-10-30', '2026-11-03', TODAY)).toBeNull()
    expect(blockProblem('', '2026-11-21', TODAY)).toMatch(/first and last/)
    expect(blockProblem('2026-11-21', '2026-11-17', TODAY)).toMatch(/before the first/)
    expect(blockProblem('2026-10-01', '2026-10-05', TODAY)).toMatch(/already gone/)
    expect(blockProblem('2026-11-17', '2027-11-18', TODAY)).toMatch(/more than a year/)
    expect(daysIn('2026-11-17', '2026-11-21')).toBe(5)
    expect(daysIn('2026-12-31', '2027-01-01')).toBe(2)
  })

  it('is read from its record, or passed over', () => {
    expect(blockOf('b1', { uid: 'u1', from: '2026-11-17', to: '2026-11-21' })).toEqual({
      ...block,
      reason: '',
    })
    expect(blockOf('b1', { uid: 'u1', from: '2026-11-21', to: '2026-11-17' })).toBeNull()
    expect(blockOf('b1', { from: '2026-11-17', to: '2026-11-21' })).toBeNull()
    expect(blockOf('b1', null)).toBeNull()
  })

  it('is said short', () => {
    expect(blockSpan(block)).toBe('Nov 17 – 21')
    expect(blockSpan({ from: '2026-11-30', to: '2026-12-02' })).toBe('Nov 30 – Dec 2')
    expect(blockSpan({ from: '2026-11-17', to: '2026-11-17' })).toBe('Nov 17')
    expect(blockSpan({ from: '2026-12-30', to: '2027-01-02' })).toBe('Dec 30, 2026 – Jan 2, 2027')
  })
})

describe('the events a block answers for', () => {
  it('each date of theirs in it — by name, by group, by team — from today on', () => {
    expect(blockedKeys(ev(), block, groups, TODAY)).toEqual(['e1_2026-11-18'])
    expect(blockedKeys(ev({ users: [], groups: ['g1'] }), block, groups, TODAY)).toEqual([
      'e1_2026-11-18',
    ])
    // An old event holds its group's id as a number.
    expect(
      blockedKeys(
        ev({ users: [], groups: [7 as never] }),
        block,
        [{ ...groups[0], id: '7' }],
        TODAY
      )
    ).toEqual(['e1_2026-11-18'])
    const team = { name: 'Audio', leaders: [], members: ['u1'] }
    expect(blockedKeys(ev({ users: [], teams: [team] as never }), block, groups, TODAY)).toEqual([
      'e1_2026-11-18',
    ])
    // Today, in the middle of a block: what's gone is left.
    expect(
      blockedKeys(ev({ date: '2026-11-01' }), { ...block, from: '2026-10-30' }, groups, TODAY)
    ).toEqual([])
  })

  it('every day of a trip in it, and every week of a series', () => {
    const trip = ev({
      date: '2026-11-16',
      extraDays: [{ date: '2026-11-17' }, { date: '2026-11-22' }],
    })
    expect(blockedKeys(trip, block, groups, TODAY)).toEqual(['e1_2026-11-17_d2'])
    const weekly = ev({ date: '2026-11-01', isRec: true, recur: 'weekly', recDay: 3 })
    expect(blockedKeys(weekly, { ...block, to: '2026-11-30' }, groups, TODAY)).toEqual([
      'e1_2026-11-18',
      'e1_2026-11-25',
    ])
  })

  it('not someone else’s, a date taken off them, a draft, or one outside it', () => {
    expect(blockedKeys(ev({ users: ['u9'] }), block, groups, TODAY)).toEqual([])
    expect(blockedKeys(ev({ unpublished: true }), block, groups, TODAY)).toEqual([])
    expect(blockedKeys(ev({ date: '2026-11-22' }), block, groups, TODAY)).toEqual([])
    const weekly = ev({
      date: '2026-11-01',
      isRec: true,
      recur: 'weekly',
      recDay: 3,
      overrides: { 'e1_2026-11-18': { users: ['u2'] } },
    })
    expect(blockedKeys(weekly, block, groups, TODAY)).toEqual([])
  })

  it('reads its date back off a record', () => {
    expect(dateOfKey('e1_2026-11-18')).toBe('2026-11-18')
    expect(dateOfKey('e1_2026-11-17_d2')).toBe('2026-11-17')
    expect(dateOfKey('e1_series')).toBeNull()
  })
})

describe('the answer a block gives', () => {
  const said = (over: Partial<Answer> = {}): Answer => ({
    status: 'yes',
    note: '',
    uid: 'u1',
    ts: 1,
    source: 'instance',
    ...over,
  })

  it('"Not available", with the reason — or "Blocked off" without one', () => {
    expect(blockAnswer(block, null, true, 5)).toEqual({
      status: 'no',
      note: 'Vacation',
      uid: 'u1',
      ts: 5,
      source: 'blocked',
      block: 'b1',
    })
    expect(blockAnswer({ ...block, reason: ' ' }, null, false, 5)?.note).toBe('Blocked off')
  })

  it('over what they said, when new — kept to put back', () => {
    const before = said({ note: 'can do evening' })
    expect(blockAnswer(block, before, true, 5)).toMatchObject({ status: 'no', was: before })
  })

  it('leaves what they said on a date since, its own answer, and another block’s', () => {
    expect(blockAnswer(block, said(), false, 5)).toBeNull()
    expect(blockAnswer(block, said({ source: 'blocked', block: 'b1' }), true, 5)).toBeNull()
    expect(
      blockAnswer(block, said({ status: 'no', source: 'blocked', block: 'b0' }), true, 5)
    ).toBeNull()
  })

  it('lifted: what it replaced put back, or cleared — but not one changed since', () => {
    const before = said({ note: 'can do evening' })
    const given = blockAnswer(block, before, true, 5)!
    expect(liftAnswer('b1', given)).toEqual(before)
    expect(liftAnswer('b1', blockAnswer(block, null, true, 5))).toBe('clear')
    expect(liftAnswer('b1', said())).toBeNull()
    expect(liftAnswer('b1', null)).toBeNull()
  })
})
