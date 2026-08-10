import type { PlanningItem } from '@/types/operations'

/**
 * Rules about the lines joining two objects on a planning board.
 *
 * A connector is stored as nothing but its two endpoint ids — no geometry —
 * and is drawn from wherever those two objects happen to be. That makes it
 * follow them around, and it also means a connector whose endpoint has been
 * deleted renders as nothing at all: invisible, unreachable, still in the
 * board data.
 */

/** Is this pair already joined? Direction does not matter — the line has no arrow. */
export function connectorExists(items: PlanningItem[], a: string, b: string): boolean {
  return items.some(
    (i) =>
      i.type === 'connector' &&
      ((i.fromId === a && i.toId === b) || (i.fromId === b && i.toId === a))
  )
}

/** The connectors attached to an object, by id. */
export function connectorsTouching(items: PlanningItem[], itemId: string): string[] {
  return items
    .filter((i) => i.type === 'connector' && (i.fromId === itemId || i.toId === itemId))
    .map((i) => i.id)
}

/**
 * Everything that has to go when one object is deleted.
 *
 * The object itself plus any connector hanging off it, so none is left behind
 * pointing at something that no longer exists.
 */
export function idsToDeleteWith(items: PlanningItem[], itemId: string): string[] {
  return [itemId, ...connectorsTouching(items, itemId)]
}

/** Just enough of an object to work out where its edge is. */
export interface ConnectableBox {
  x: number
  y: number
  width: number
  height: number
  /** Circles are drawn as ellipses filling the box, so their edge is curved. */
  shapeType?: string
}

export interface Point {
  x: number
  y: number
}

export interface Segment {
  x1: number
  y1: number
  x2: number
  y2: number
}

export function centreOf(box: ConnectableBox): Point {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

/**
 * Where a line leaving the centre of a box crosses its edge.
 *
 * Rectangles are the common case: scale the direction until it meets whichever
 * side it reaches first. A circle is drawn as an ellipse filling its box, so
 * its edge is found by scaling the direction until it satisfies the ellipse
 * equation instead — a line stopping at the corner of a circle's bounding box
 * would leave an obvious gap.
 */
export function edgePoint(box: ConnectableBox, toward: Point): Point {
  const c = centreOf(box)
  const dx = toward.x - c.x
  const dy = toward.y - c.y

  // Concentric objects have no direction to travel in.
  if (dx === 0 && dy === 0) return c

  const hw = Math.max(box.width, 0) / 2
  const hh = Math.max(box.height, 0) / 2
  if (hw === 0 || hh === 0) return c

  const t =
    box.shapeType === 'circle'
      ? // Ellipse: solve (t·dx/hw)² + (t·dy/hh)² = 1
        1 / Math.hypot(dx / hw, dy / hh)
      : // Rectangle: the nearer of the vertical and horizontal sides.
        Math.min(
          dx === 0 ? Infinity : hw / Math.abs(dx),
          dy === 0 ? Infinity : hh / Math.abs(dy)
        )

  return { x: c.x + dx * t, y: c.y + dy * t }
}

/**
 * The visible part of a connector: edge of one object to edge of the other.
 *
 * Drawn centre to centre, the line ran straight through both objects and out
 * the far side, which read as a line crossing them rather than joining them.
 *
 * When the two overlap there is no gap to span — the two edge points cross
 * over each other and the segment would be drawn backwards — so it falls back
 * to centre to centre. That is the old behaviour, and it keeps the connector
 * visible rather than having it vanish exactly when two objects are stacked.
 */
export function connectorSegment(from: ConnectableBox, to: ConnectableBox): Segment {
  const c1 = centreOf(from)
  const c2 = centreOf(to)
  const p1 = edgePoint(from, c2)
  const p2 = edgePoint(to, c1)

  // Did the edge points pass each other? Compare against the centre line.
  const spanX = c2.x - c1.x
  const spanY = c2.y - c1.y
  const edgeX = p2.x - p1.x
  const edgeY = p2.y - p1.y
  const overlapping = spanX * edgeX + spanY * edgeY <= 0

  if (overlapping) return { x1: c1.x, y1: c1.y, x2: c2.x, y2: c2.y }
  return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y }
}

/** Midpoint of a connector's drawn line — where its delete handle sits. */
export function segmentMidpoint(seg: Segment): Point {
  return { x: (seg.x1 + seg.x2) / 2, y: (seg.y1 + seg.y2) / 2 }
}

/**
 * Connectors whose endpoints are already gone.
 *
 * Boards edited before deletion cleaned up after itself still carry these.
 * They cost a little space and nothing else, but they are why a board can
 * report more items than it appears to have.
 */
export function orphanConnectorIds(items: PlanningItem[]): string[] {
  const present = new Set(items.map((i) => i.id))
  return items
    .filter(
      (i) =>
        i.type === 'connector' &&
        (!i.fromId || !i.toId || !present.has(i.fromId) || !present.has(i.toId))
    )
    .map((i) => i.id)
}
