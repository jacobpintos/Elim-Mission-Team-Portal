import { describe, it, expect } from 'vitest'
import {
  connectorExists,
  connectorsTouching,
  idsToDeleteWith,
  orphanConnectorIds,
} from './connectors'
import type { PlanningItem } from '@/types/operations'

const note = (id: string): PlanningItem => ({
  id,
  type: 'note',
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  content: '',
})

const link = (id: string, fromId: string, toId: string): PlanningItem => ({
  id,
  type: 'connector',
  x: 0,
  y: 0,
  width: 1,
  height: 1,
  content: '',
  fromId,
  toId,
})

const board = [note('a'), note('b'), note('c'), link('c1', 'a', 'b')]

describe('connectorExists', () => {
  it('finds a pair that is already joined', () => {
    expect(connectorExists(board, 'a', 'b')).toBe(true)
  })

  it('ignores which end was tapped first', () => {
    // The line has no arrowhead, so a→b and b→a are the same line. Without
    // this, joining the pair the other way round stacks a second identical
    // line on top of the first and only the top one can ever be removed.
    expect(connectorExists(board, 'b', 'a')).toBe(true)
  })

  it('says no for a pair that is not joined', () => {
    expect(connectorExists(board, 'a', 'c')).toBe(false)
    expect(connectorExists(board, 'b', 'c')).toBe(false)
  })

  it('does not mistake an object for a connector', () => {
    expect(connectorExists([note('a'), note('b')], 'a', 'b')).toBe(false)
  })
})

describe('connectorsTouching', () => {
  it('finds connectors on either end', () => {
    const items = [...board, link('c2', 'c', 'a')]

    expect(connectorsTouching(items, 'a').sort()).toEqual(['c1', 'c2'])
  })

  it('returns nothing for an unconnected object', () => {
    expect(connectorsTouching(board, 'c')).toEqual([])
  })
})

describe('idsToDeleteWith', () => {
  it('takes the connectors with the object', () => {
    // A connector left behind renders as nothing — invisible, unreachable,
    // and still counted in the board.
    expect(idsToDeleteWith(board, 'a').sort()).toEqual(['a', 'c1'])
  })

  it('deletes just the object when nothing is attached', () => {
    expect(idsToDeleteWith(board, 'c')).toEqual(['c'])
  })

  it('names the object first', () => {
    expect(idsToDeleteWith(board, 'a')[0]).toBe('a')
  })

  it('does not list anything twice when both ends are the same object', () => {
    // Not reachable through the UI, which refuses to join an object to
    // itself, but a board written by an older build could hold one.
    const items = [note('a'), link('self', 'a', 'a')]

    expect(idsToDeleteWith(items, 'a')).toEqual(['a', 'self'])
  })
})

describe('orphanConnectorIds', () => {
  it('finds a connector whose endpoint is gone', () => {
    const items = [note('a'), link('c1', 'a', 'gone')]

    expect(orphanConnectorIds(items)).toEqual(['c1'])
  })

  it('finds a connector missing an endpoint entirely', () => {
    const items = [note('a'), { ...link('c1', 'a', 'b'), toId: undefined }]

    expect(orphanConnectorIds(items)).toEqual(['c1'])
  })

  it('leaves intact connectors alone', () => {
    expect(orphanConnectorIds(board)).toEqual([])
  })

  it('does not report ordinary objects', () => {
    expect(orphanConnectorIds([note('a'), note('b')])).toEqual([])
  })
})
