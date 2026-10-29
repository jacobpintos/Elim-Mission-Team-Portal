import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import * as admin from 'firebase-admin'
import { sameAccess } from './eventPrivate'
import { setListSeenBy, taskSeenBy } from './recordAccess'

if (!admin.apps.length) admin.initializeApp()

/** Firestore rejects a batch over 500 writes. */
const BATCH_LIMIT = 450

type Stamp = { ref: admin.firestore.DocumentReference; seenBy: string[] }

async function write(db: admin.firestore.Firestore, stale: Stamp[]) {
  for (let i = 0; i < stale.length; i += BATCH_LIMIT) {
    const batch = db.batch()
    stale.slice(i, i + BATCH_LIMIT).forEach((x) => batch.update(x.ref, { seenBy: x.seenBy }))
    await batch.commit()
  }
}

/** An event's id as a set list may hold it: a string, or — from before — a number. */
const idForms = (id: string) => (/^\d+$/.test(id) ? [id, Number(id)] : [id])

const eventSeenByOf = async (db: admin.firestore.Firestore, id: unknown) => {
  if (id == null || id === '') return null
  const seenBy = (await db.doc(`events/${String(id)}`).get()).data()?.seenBy
  return Array.isArray(seenBy) ? (seenBy as unknown[]) : null
}

/**
 * An event's set lists told who may see it (./recordAccess setListSeenBy):
 * when that changes (./eventPrivateSync settleEvent).
 */
export async function stampSetLists(
  db: admin.firestore.Firestore,
  eventId: string,
  seenBy: string[]
) {
  const snap = await db
    .collection('setLists')
    .where('eventTemplateId', 'in', idForms(eventId))
    .get()
  await write(
    db,
    snap.docs.flatMap((d) => {
      const want = setListSeenBy(d.data(), seenBy)
      return sameAccess(d.data().seenBy, want) ? [] : [{ ref: d.ref, seenBy: want }]
    })
  )
}

/** A task written — made, handed to someone else — told who may read it. */
export const stampTaskRecord = onDocumentWritten('tasks/{taskId}', async (event) => {
  const after = event.data?.after
  if (!after?.exists) return
  const seenBy = taskSeenBy(after.data() ?? {})
  if (!sameAccess(after.data()?.seenBy, seenBy)) await after.ref.update({ seenBy })
})

/** A set list written — made, moved to another event — told who may read it. */
export const stampSetListRecord = onDocumentWritten('setLists/{setListId}', async (event) => {
  const after = event.data?.after
  if (!after?.exists) return
  const data = after.data() ?? {}
  const seenBy = setListSeenBy(data, await eventSeenByOf(admin.firestore(), data.eventTemplateId))
  if (!sameAccess(data.seenBy, seenBy)) await after.ref.update({ seenBy })
})

/**
 * Every task and set list told who may read it — which the deploy does
 * (scripts/settleAll), so that what the rules ask for is there before
 * they ask for it. How many were.
 */
export async function stampAll(
  db: admin.firestore.Firestore
): Promise<{ tasks: number; setLists: number }> {
  const [tasks, setLists, events] = await Promise.all([
    db.collection('tasks').get(),
    db.collection('setLists').get(),
    db.collection('events').get(),
  ])
  const staleTasks = tasks.docs.flatMap((d) => {
    const want = taskSeenBy(d.data())
    return sameAccess(d.data().seenBy, want) ? [] : [{ ref: d.ref, seenBy: want }]
  })
  const seenByOf = new Map(events.docs.map((d) => [d.id, d.data().seenBy]))
  const staleLists = setLists.docs.flatMap((d) => {
    const data = d.data()
    const seen = seenByOf.get(String(data.eventTemplateId ?? ''))
    const want = setListSeenBy(data, Array.isArray(seen) ? seen : null)
    return sameAccess(data.seenBy, want) ? [] : [{ ref: d.ref, seenBy: want }]
  })
  await write(db, [...staleTasks, ...staleLists])
  return { tasks: staleTasks.length, setLists: staleLists.length }
}
