import { describe, it, expect } from 'vitest'
import {
  connectorExists,
  connectorsTouching,
  idsToDeleteWith,
  orphanConnectorIds,
  centreOf,
  edgePoint,
  connectorSegment,
  segmentMidpoint,
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

/** A 100×100 box whose centre sits at (cx, cy). */
const box = (cx: number, cy: number, shapeType?: string) => ({
  x: cx - 50,
  y: cy - 50,
  width: 100,
  height: 100,
  ...(shapeType ? { shapeType } : {}),
})

describe('edgePoint', () => {
  it('leaves a rectangle through the side it faces', () => {
    const b = box(0, 0)

    expect(edgePoint(b, { x: 500, y: 0 })).toEqual({ x: 50, y: 0 })
    expect(edgePoint(b, { x: -500, y: 0 })).toEqual({ x: -50, y: 0 })
    expect(edgePoint(b, { x: 0, y: 500 })).toEqual({ x: 0, y: 50 })
    expect(edgePoint(b, { x: 0, y: -500 })).toEqual({ x: 0, y: -50 })
  })

  it('leaves a square through its corner on the diagonal', () => {
    const at = edgePoint(box(0, 0), { x: 500, y: 500 })

    expect(at.x).toBeCloseTo(50, 6)
    expect(at.y).toBeCloseTo(50, 6)
  })

  it('respects a non-square box', () => {
    // Wide and short: a 45° direction meets the top or bottom first.
    const wide = { x: -100, y: -25, width: 200, height: 50 }

    expect(edgePoint(wide, { x: 500, y: 500 })).toEqual({ x: 25, y: 25 })
  })

  it('follows the curve of a circle rather than its bounding box', () => {
    // The corner of the box is at (50,50); the circle's edge is nearer.
    const at = edgePoint(box(0, 0, 'circle'), { x: 500, y: 500 })

    expect(Math.hypot(at.x, at.y)).toBeCloseTo(50, 6)
    expect(at.x).toBeCloseTo(50 / Math.SQRT2, 6)
  })

  it('meets a circle at the same place as a rectangle straight on', () => {
    // Only the diagonals differ; the axes touch the same points.
    expect(edgePoint(box(0, 0, 'circle'), { x: 500, y: 0 }).x).toBeCloseTo(50, 6)
  })

  it('gives up gracefully on degenerate input', () => {
    // Concentric objects have no direction, and a zero-sized one has no edge.
    expect(edgePoint(box(0, 0), { x: 0, y: 0 })).toEqual({ x: 0, y: 0 })
    expect(edgePoint({ x: 0, y: 0, width: 0, height: 0 }, { x: 5, y: 5 })).toEqual({ x: 0, y: 0 })
  })
})

describe('connectorSegment', () => {
  it('starts and ends on the edges, not the centres', () => {
    // The complaint this fixes: the line ran through both objects.
    const seg = connectorSegment(box(0, 0), box(300, 0))

    expect(seg).toEqual({ x1: 50, y1: 0, x2: 250, y2: 0 })
  })

  it('spans the gap and no more', () => {
    const seg = connectorSegment(box(0, 0), box(300, 0))
    const drawn = Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1)

    // 300 apart, less 50 of each box.
    expect(drawn).toBeCloseTo(200, 6)
  })

  it('works in both directions', () => {
    const a = connectorSegment(box(0, 0), box(300, 0))
    const b = connectorSegment(box(300, 0), box(0, 0))

    expect({ x: b.x2, y: b.y2 }).toEqual({ x: a.x1, y: a.y1 })
    expect({ x: b.x1, y: b.y1 }).toEqual({ x: a.x2, y: a.y2 })
  })

  it('falls back to centres when the objects overlap', () => {
    // The edge points would cross over and draw the line backwards. Centre to
    // centre is the old behaviour and keeps the connector visible.
    const seg = connectorSegment(box(0, 0), box(20, 0))

    expect(seg).toEqual({ x1: 0, y1: 0, x2: 20, y2: 0 })
  })

  it('falls back when one object sits inside the other', () => {
    const outer = { x: 0, y: 0, width: 400, height: 400 }
    const inner = { x: 150, y: 150, width: 100, height: 100 }
    const seg = connectorSegment(outer, inner)

    expect(seg).toEqual({ x1: 200, y1: 200, x2: 200, y2: 200 })
  })

  it('handles two objects at the same place', () => {
    const seg = connectorSegment(box(0, 0), box(0, 0))

    expect(seg).toEqual({ x1: 0, y1: 0, x2: 0, y2: 0 })
  })
})

describe('segmentMidpoint', () => {
  it('sits halfway along the drawn line', () => {
    // The delete handle follows the visible line, so on the gap between the
    // objects rather than buried inside one of them.
    const seg = connectorSegment(box(0, 0), box(300, 0))

    expect(segmentMidpoint(seg)).toEqual({ x: 150, y: 0 })
  })

  it('is not the midpoint of the centres when the boxes differ in size', () => {
    const small = { x: -10, y: -10, width: 20, height: 20 }
    const big = { x: 200, y: -100, width: 200, height: 200 }
    const mid = segmentMidpoint(connectorSegment(small, big))

    // Centres are at 0 and 300, so the centre midpoint would be 150.
    expect(mid.x).toBeCloseTo((10 + 200) / 2, 6)
  })
})

describe('centreOf', () => {
  it('is the middle of the box', () => {
    expect(centreOf({ x: 10, y: 20, width: 100, height: 50 })).toEqual({ x: 60, y: 45 })
  })
})
