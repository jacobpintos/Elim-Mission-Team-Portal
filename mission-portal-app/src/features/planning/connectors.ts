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
