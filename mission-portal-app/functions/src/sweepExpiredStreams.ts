import { onSchedule } from 'firebase-functions/v2/scheduler'
import * as admin from 'firebase-admin'
import { logger } from 'firebase-functions'

if (!admin.apps.length) admin.initializeApp()

/**
 * Has this stream card outlived its window?
 *
 * Mirrors isLive in src/lib/livestream.ts — the two packages cannot import from
 * one another. Inverted here because this side cares about what to delete.
 */
export function isExpiredStream(expiresAt: unknown, now: number): boolean {
  return typeof expiresAt === 'number' && expiresAt > 0 && now >= expiresAt
}

/**
 * Delete stream cards whose window has passed.
 *
 * The app already stops showing a card at its expiry, so this is housekeeping
 * rather than enforcement: without it the collection grows a document a week
 * forever, and every client pays to sync them.
 *
 * Hourly, not nightly like expireAnnouncements. Windows are measured in hours,
 * so a card posted at ten on Sunday morning is done by late afternoon, and
 * leaving it until after midnight would keep a dead link syncing all day.
 *
 * A whole-collection read rather than a query on expiresAt: Firestore's
 * inequality filters skip documents missing the field, and this collection
 * holds roughly one document per week. The read costs less than the index.
 */
export const sweepExpiredStreams = onSchedule(
  { schedule: '7 * * * *', timeZone: 'America/Chicago' },
  async () => {
    const db = admin.firestore()
    const now = Date.now()

    const snap = await db.collection('livestreams').get()
    const doomed = snap.docs.filter((d) => isExpiredStream(d.data().expiresAt, now))
    if (doomed.length === 0) return

    const batch = db.batch()
    for (const doc of doomed) batch.delete(doc.ref)
    await batch.commit()

    logger.info('[sweepExpiredStreams] deleted', {
      count: doomed.length,
      ids: doomed.map((d) => d.id),
    })
  }
)
