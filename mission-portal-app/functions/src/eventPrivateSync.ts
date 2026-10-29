import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import * as admin from 'firebase-admin'
import { logger } from 'firebase-functions'
import { eventAccess, eventSeenBy, mergeEvent, sameAccess, strays, withMoved } from './eventPrivate'

if (!admin.apps.length) admin.initializeApp()

type Group = { id: string; members?: unknown[] }

async function readGroups(db: admin.firestore.Firestore): Promise<Group[]> {
  const snap = await db.collection('groups').get()
  return snap.docs.map((d) => ({ ...(d.data() as Omit<Group, 'id'>), id: d.id }))
}

/** Firestore rejects a batch over 500 writes. */
const BATCH_LIMIT = 450

type Doc = Record<string, unknown>

/** What putting an event right would change, from copies already read. */
function settling(open: Doc, closed: Doc | undefined, groups: Group[]) {
  const { moved, cleared } = strays(open, closed ?? {})
  const merged = mergeEvent(open, withMoved(closed ?? {}, moved))
  const access = eventAccess(merged, groups)
  const seenBy = eventSeenBy(merged, groups)
  return {
    moved,
    cleared,
    access,
    seenBy,
    accessRight: !!closed && sameAccess(closed.access, access),
    seenRight: sameAccess(open.seenBy, seenBy),
  }
}

/**
 * Whether an event's records need putting right, from copies already read:
 * so a sweep reads each once, and writes only those that do.
 */
const unsettled = (open: Doc, closed: Doc | undefined, groups: Group[]) => {
  const s = settling(open, closed, groups)
  return s.cleared.length > 0 || !s.accessRight || !s.seenRight
}

/**
 * One event's records put right (./eventPrivate): any private details left
 * in the event moved to its private record; who may read that — everyone
 * on the event — and who may see the event at all (`seenBy`) worked out
 * afresh, and its availability records told the latter. Nothing written
 * when all is right already. True when something was.
 */
export async function settleEvent(
  db: admin.firestore.Firestore,
  id: string,
  groups?: Group[]
): Promise<boolean> {
  const everyGroup = groups ?? (await readGroups(db))
  const openRef = db.doc(`events/${id}`)
  const closedRef = db.doc(`eventPrivate/${id}`)
  const done = await db.runTransaction(async (tx) => {
    const [o, c] = await tx.getAll(openRef, closedRef)
    // Gone, or still being made: its private record waits for it.
    if (!o.exists) return null
    const open = o.data() ?? {}
    const s = settling(open, c.exists ? c.data() : undefined, everyGroup)
    if (s.accessRight && s.seenRight && !s.cleared.length) return null
    if (!s.accessRight || Object.keys(s.moved).length) {
      tx.set(closedRef, { ...s.moved, access: s.access }, { merge: true })
    }
    const fields: [admin.firestore.FieldPath, unknown][] = [
      ...s.cleared.map(
        (path) =>
          [new admin.firestore.FieldPath(...path), admin.firestore.FieldValue.delete()] as [
            admin.firestore.FieldPath,
            unknown,
          ]
      ),
      ...(s.seenRight
        ? []
        : [
            [new admin.firestore.FieldPath('seenBy'), s.seenBy] as [
              admin.firestore.FieldPath,
              unknown,
            ],
          ]),
    ]
    if (fields.length) {
      const [[first, value], ...rest] = fields
      tx.update(openRef, first, value, ...rest.flat())
    }
    return { seenBy: s.seenBy, seenChanged: !s.seenRight }
  })
  if (!done) return false
  if (done.seenChanged) await stampAvail(db, id, done.seenBy)
  return true
}

/**
 * Its availability records (avail/{eventId}_{date}, and _series) told who
 * may see the event: they say when it is, and who is coming, so they are
 * read as it is (firestore.rules avail).
 */
async function stampAvail(db: admin.firestore.Firestore, eventId: string, seenBy: string[]) {
  const snap = await db
    .collection('avail')
    .where(admin.firestore.FieldPath.documentId(), '>=', `${eventId}_`)
    .where(admin.firestore.FieldPath.documentId(), '<', `${eventId}_\uf8ff`)
    .get()
  const stale = snap.docs.filter((d) => !sameAccess(d.data().seenBy, seenBy))
  for (let i = 0; i < stale.length; i += BATCH_LIMIT) {
    const batch = db.batch()
    stale.slice(i, i + BATCH_LIMIT).forEach((d) => batch.update(d.ref, { seenBy }))
    await batch.commit()
  }
}

/** The event an availability record is for: `${eventId}_${date}`, or `${eventId}_series`. */
const eventOfAvail = (key: string) => key.slice(0, key.indexOf('_'))

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
 * An availability record written — a first answer, say — told who may see
 * its event. Until then only admins can read it.
 */
export const stampAvailRecord = onDocumentWritten('avail/{key}', async (event) => {
  const after = event.data?.after
  if (!after?.exists) return
  const ev = (
    await admin
      .firestore()
      .doc(`events/${eventOfAvail(event.params.key)}`)
      .get()
  ).data()
  const seenBy = Array.isArray(ev?.seenBy) ? (ev.seenBy as string[]) : []
  if (!sameAccess(after.data()?.seenBy, seenBy)) await after.ref.update({ seenBy })
})

/**
 * Every event put right; with `avail`, every availability record too —
 * which the deploy does (scripts/settleAll), so that what the rules ask
 * for is there before they ask for it. Counts of what was done.
 */
export async function settleAll(
  db: admin.firestore.Firestore,
  { avail = false }: { avail?: boolean } = {}
): Promise<{ events: number; settled: number; availStamped: number }> {
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
      logger.error('settleAll: failed', { id: d.id, err })
    }
  }
  let availStamped = 0
  if (avail) {
    const seenByOf = new Map(
      (await db.collection('events').get()).docs.map((d) => [d.id, d.data().seenBy])
    )
    const stale = (await db.collection('avail').get()).docs.flatMap((d) => {
      const seenBy = seenByOf.get(eventOfAvail(d.id))
      const want = Array.isArray(seenBy) ? (seenBy as string[]) : []
      return sameAccess(d.data().seenBy, want) ? [] : [{ ref: d.ref, want }]
    })
    for (let i = 0; i < stale.length; i += BATCH_LIMIT) {
      const batch = db.batch()
      stale.slice(i, i + BATCH_LIMIT).forEach((x) => batch.update(x.ref, { seenBy: x.want }))
      await batch.commit()
    }
    availStamped = stale.length
  }
  return { events: events.size, settled, availStamped }
}

/**
 * Every event put right, each half hour: a safety net under the above, and
 * how the events from before the private record were moved into it.
 */
export const settleEventRecords = onSchedule(
  { schedule: 'every 30 minutes', timeoutSeconds: 540 },
  async () => {
    const { events, settled } = await settleAll(admin.firestore())
    if (settled) logger.info(`settleEventRecords: settled ${settled} of ${events}`)
  }
)
