import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import * as admin from 'firebase-admin'
import { logger } from 'firebase-functions'
import { eventAccess, mergeEvent, sameAccess, strays, withMoved } from './eventPrivate'

if (!admin.apps.length) admin.initializeApp()

type Group = { id: string; members?: unknown[] }

async function readGroups(db: admin.firestore.Firestore): Promise<Group[]> {
  const snap = await db.collection('groups').get()
  return snap.docs.map((d) => ({ ...(d.data() as Omit<Group, 'id'>), id: d.id }))
}

/**
 * One event's two records put right (./eventPrivate): any private details
 * left in the event moved to its private record, and who may read that —
 * everyone on the event — worked out afresh. Nothing written when both are
 * right already. True when something was.
 */
export async function settleEvent(
  db: admin.firestore.Firestore,
  id: string,
  groups?: Group[]
): Promise<boolean> {
  const everyGroup = groups ?? (await readGroups(db))
  const openRef = db.doc(`events/${id}`)
  const closedRef = db.doc(`eventPrivate/${id}`)
  return db.runTransaction(async (tx) => {
    const [o, c] = await tx.getAll(openRef, closedRef)
    // Gone, or still being made: its private record waits for it.
    if (!o.exists) return false
    const open = o.data() ?? {}
    const closed = c.data() ?? {}
    const { moved, cleared } = strays(open, closed)
    const access = eventAccess(mergeEvent(open, withMoved(closed, moved)), everyGroup)
    if (c.exists && !cleared.length && sameAccess(closed.access, access)) return false
    tx.set(closedRef, { ...moved, access }, { merge: true })
    if (cleared.length) {
      const [first, ...rest] = cleared.map((path) => new admin.firestore.FieldPath(...path))
      tx.update(
        openRef,
        first,
        admin.firestore.FieldValue.delete(),
        ...rest.flatMap((p) => [p, admin.firestore.FieldValue.delete()])
      )
    }
    return true
  })
}

/**
 * An event written: put right. An app not yet updated writes its private
 * details here, and adding people to it changes who may read them.
 */
export const settleEventRecord = onDocumentWritten('events/{eventId}', async (event) => {
  if (!event.data?.after?.exists) return
  if (await settleEvent(admin.firestore(), event.params.eventId)) {
    logger.info('settleEventRecord: settled', { id: event.params.eventId })
  }
})

/** Its private record written: who is on its teams may have changed. */
export const settleEventAccess = onDocumentWritten('eventPrivate/{eventId}', async (event) => {
  if (!event.data?.after?.exists) return
  await settleEvent(admin.firestore(), event.params.eventId)
})

/** A group's members changed: so has who is on each event it is on. */
export const settleGroupAccess = onDocumentWritten('groups/{groupId}', async (event) => {
  const before = event.data?.before?.data()?.members
  const after = event.data?.after?.data()?.members
  if (JSON.stringify(before ?? []) === JSON.stringify(after ?? [])) return
  const db = admin.firestore()
  const gid = event.params.groupId
  const [events, groups] = await Promise.all([db.collection('events').get(), readGroups(db)])
  const onIt = (part: { groups?: unknown[] } | undefined) =>
    (part?.groups ?? []).some((g) => String(g) === gid)
  for (const d of events.docs) {
    const ev = d.data() as {
      groups?: unknown[]
      overrides?: Record<string, { groups?: unknown[] }>
    }
    if (!onIt(ev) && !Object.values(ev.overrides ?? {}).some(onIt)) continue
    await settleEvent(db, d.id, groups)
  }
})

/**
 * Whether an event's records need putting right, from copies already read:
 * so a sweep reads each once, and writes only those that do.
 */
function unsettled(
  open: Record<string, unknown>,
  closed: Record<string, unknown> | undefined,
  groups: Group[]
) {
  if (!closed) return true
  const { moved, cleared } = strays(open, closed)
  if (cleared.length) return true
  return !sameAccess(closed.access, eventAccess(mergeEvent(open, withMoved(closed, moved)), groups))
}

/**
 * Every event put right, each half hour: a safety net under the above, and
 * how the events from before the private record were moved into it.
 */
export const settleEventRecords = onSchedule(
  { schedule: 'every 30 minutes', timeoutSeconds: 540 },
  async () => {
    const db = admin.firestore()
    const [events, closed, groups] = await Promise.all([
      db.collection('events').get(),
      db.collection('eventPrivate').get(),
      readGroups(db),
    ])
    const privateOf = new Map(closed.docs.map((d) => [d.id, d.data()]))
    let settled = 0
    for (const d of events.docs) {
      if (!unsettled(d.data(), privateOf.get(d.id), groups)) continue
      try {
        if (await settleEvent(db, d.id, groups)) settled++
      } catch (err) {
        logger.error('settleEventRecords: failed', { id: d.id, err })
      }
    }
    if (settled) logger.info(`settleEventRecords: settled ${settled} of ${events.size}`)
  }
)
