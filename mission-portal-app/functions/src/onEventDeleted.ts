import { onDocumentDeleted } from 'firebase-functions/v2/firestore'
import * as admin from 'firebase-admin'
import { logger } from 'firebase-functions'
import { COVER_FOLDER, coverUrlsOf, storagePathOf, travelFoldersOf } from './eventRetention'

if (!admin.apps.length) admin.initializeApp()

/** Firestore rejects a batch over 500 writes. */
const BATCH_LIMIT = 450

/**
 * Documents keyed by event and date, which an event delete used to leave
 * behind.
 *
 * Both are named `${templateId}_${date}` — one per occurrence — so they are
 * found by asking for the ids that begin with the event's id and a separator.
 * Firestore has no prefix operator, but a range over the document id does the
 * same thing.
 */
const KEYED_BY_EVENT_AND_DATE = ['foodSignups', 'avail'] as const

/**
 * Every document in `collection` whose id belongs to this event.
 *
 * The separator is what makes the range safe: event 4's keys start "4_", and
 * "40_..." sorts before "4_" because '0' is below '_', so a neighbouring event
 * cannot be swept up by the range.
 */
async function keyedDocs(
  db: admin.firestore.Firestore,
  collection: string,
  eventId: string
): Promise<admin.firestore.DocumentReference[]> {
  const snap = await db
    .collection(collection)
    .where(admin.firestore.FieldPath.documentId(), '>=', `${eventId}_`)
    .where(admin.firestore.FieldPath.documentId(), '<', `${eventId}_\uf8ff`)
    .get()
  return snap.docs.map((d) => d.ref)
}

/**
 * Delete an event's tasks along with the event.
 *
 * Tasks spawned from a task template point back at the event that created
 * them, and deleting the event used to leave them behind: assigned to people,
 * appearing in their lists, with due dates counted against an event that no
 * longer exists and no way to reach it.
 *
 * Runs server-side rather than in the delete button so it covers every route
 * an event can be removed by, including a future one nobody remembers to wire
 * up. Tasks reference the event as either evId or evTemplateId depending on
 * how they were made, and Firestore cannot OR across two fields in one query,
 * so both are asked for and the results merged.
 *
 * Food sign-ups and availability responses go too. They are keyed by event
 * and date rather than pointing at the event with a field, and nothing was
 * removing them — so every deleted event left a row of documents behind that
 * nothing could reach and that would resurface if the id were ever reused.
 *
 * Both forms of the id are asked for as well. Events are numbered by a
 * counter and stored with a numeric `id`, while the document is named with
 * the string of that number — so a task created through the app holds the
 * number, and matching only the document id would have found nothing and
 * silently deleted no tasks at all.
 */
export const onEventDeleted = onDocumentDeleted('events/{eventId}', async (event) => {
  await removeEventLeftovers(admin.firestore(), event.params.eventId, event.data?.data())
})

/**
 * Everything of a deleted event (`data`: the event as it was): its tasks,
 * availability, food sign-ups and private record; the records of invitations
 * to it (lib/inviteLog); and its pictures — its cover photo, unless another
 * event has it too, and its flight and hotel pictures (./eventRetention).
 * Run by the trigger above, whichever way an event goes — by an admin, or
 * kept past its time (./eventHistory).
 */
export async function removeEventLeftovers(
  db: admin.firestore.Firestore,
  eventId: string,
  data: Record<string, unknown> | undefined
): Promise<void> {
  const numericId = Number(eventId)
  const idValues: (string | number)[] = Number.isFinite(numericId)
    ? [eventId, numericId]
    : [eventId]

  const snaps = await Promise.all(
    idValues.flatMap((value) => [
      db.collection('tasks').where('evTemplateId', '==', value).get(),
      db.collection('tasks').where('evId', '==', value).get(),
    ])
  )

  // The queries overlap when a task carries both fields, so dedupe by doc id.
  const refs = new Map<string, admin.firestore.DocumentReference>()
  for (const snap of snaps) {
    snap.docs.forEach((d) => refs.set(d.id, d.ref))
  }

  const keyed = await Promise.all(KEYED_BY_EVENT_AND_DATE.map((c) => keyedDocs(db, c, eventId)))
  for (const list of keyed) {
    // Keyed by path rather than id: a food sign-up and an availability doc for
    // the same occurrence share an id, and one would displace the other.
    list.forEach((ref) => refs.set(ref.path, ref))
  }

  // Invitations to any date of it: counted for the admins, nothing to count now.
  const invites = await db
    .collection('invites')
    .where('eventKey', '>=', `${eventId}_`)
    .where('eventKey', '<', `${eventId}_\uf8ff`)
    .get()
  invites.docs.forEach((d) => refs.set(d.ref.path, d.ref))

  // Its private record (../eventPrivate): teams, cars, rooms and flights —
  // read first, for the pictures its flights and rooms have.
  const privateRef = db.doc(`eventPrivate/${eventId}`)
  const privateDoc = (await privateRef.get().catch(() => null))?.data()
  refs.set(privateRef.path, privateRef)

  const all = [...refs.values()]
  for (let i = 0; i < all.length; i += BATCH_LIMIT) {
    const batch = db.batch()
    all.slice(i, i + BATCH_LIMIT).forEach((ref) => batch.delete(ref))
    await batch.commit()
  }

  const files = await removePictures(db, data, privateDoc)
  logger.info(
    `onEventDeleted: removed ${refs.size} document(s) and ${files} picture folder(s) of event ${eventId}`
  )
}

/** Its pictures: each step on its own, so one that fails leaves the rest done. */
async function removePictures(
  db: admin.firestore.Firestore,
  data: Record<string, unknown> | undefined,
  privateDoc: Record<string, unknown> | undefined
): Promise<number> {
  const bucket = admin.storage().bucket()
  let removed = 0
  for (const folder of travelFoldersOf(privateDoc)) {
    try {
      await bucket.deleteFiles({ prefix: folder })
      removed++
    } catch (err) {
      logger.warn(`onEventDeleted: couldn't remove ${folder}`, err)
    }
  }
  for (const url of coverUrlsOf(data)) {
    const path = storagePathOf(url)
    if (!path?.startsWith(COVER_FOLDER)) continue
    try {
      // Another event with the same photo keeps it.
      const shared = await db.collection('events').where('coverImage', '==', url).limit(1).get()
      if (!shared.empty) continue
      await bucket.file(path).delete({ ignoreNotFound: true })
      removed++
    } catch (err) {
      logger.warn(`onEventDeleted: couldn't remove ${path}`, err)
    }
  }
  return removed
}
