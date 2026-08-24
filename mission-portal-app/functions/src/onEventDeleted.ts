import { onDocumentDeleted } from 'firebase-functions/v2/firestore'
import * as admin from 'firebase-admin'
import { logger } from 'firebase-functions'

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
  const db = admin.firestore()
  const eventId = event.params.eventId

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

  const keyed = await Promise.all(
    KEYED_BY_EVENT_AND_DATE.map((c) => keyedDocs(db, c, eventId))
  )
  for (const list of keyed) {
    // Keyed by path rather than id: a food sign-up and an availability doc for
    // the same occurrence share an id, and one would displace the other.
    list.forEach((ref) => refs.set(ref.path, ref))
  }

  if (refs.size === 0) return

  const all = [...refs.values()]
  for (let i = 0; i < all.length; i += BATCH_LIMIT) {
    const batch = db.batch()
    all.slice(i, i + BATCH_LIMIT).forEach((ref) => batch.delete(ref))
    await batch.commit()
  }

  logger.info(`onEventDeleted: removed ${refs.size} document(s) belonging to event ${eventId}`)
})
