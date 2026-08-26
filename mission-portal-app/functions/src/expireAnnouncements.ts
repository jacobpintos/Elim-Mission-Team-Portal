import { onSchedule } from 'firebase-functions/v2/scheduler'
import * as admin from 'firebase-admin'
import { logger } from 'firebase-functions'

if (!admin.apps.length) admin.initializeApp()

/** Firestore rejects a batch over 500 writes. */
const BATCH_LIMIT = 450

/**
 * Today in Central time, as YYYY-MM-DD.
 *
 * The church's day, not UTC's. Expiring on UTC's calendar would delete an
 * announcement at six or seven in the evening local time on the day it was
 * still meant to be up.
 */
export function todayCentral(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/**
 * Has this announcement outlived its date?
 *
 * Mirrors isExpired in src/lib/announcementImage.ts — the two packages cannot
 * import from one another. Strictly greater than: an announcement expiring
 * today is shown all of today and goes tomorrow.
 */
export function isExpired(expiresAt: unknown, todayStr: string): boolean {
  return typeof expiresAt === 'string' && expiresAt !== '' && todayStr > expiresAt
}

/**
 * The Storage path inside a download URL, or null if it is not one of ours.
 *
 * A download URL carries the object path percent-encoded between `/o/` and the
 * query string. Deleting by path rather than by URL keeps this working for
 * files uploaded before the bucket's domain changed.
 */
export function storagePathFromUrl(url: unknown): string | null {
  if (typeof url !== 'string' || url === '') return null
  const m = /\/o\/([^?]+)/.exec(url)
  if (!m) return null
  try {
    const path = decodeURIComponent(m[1])
    return path.startsWith('announcements/') ? path : null
  } catch {
    return null
  }
}

/**
 * Delete announcements whose day has passed, and their photos with them.
 *
 * Real deletion, as asked for: the document goes, and so does the file behind
 * it. There is no undo, which is why the composer says so plainly and why the
 * comparison keeps an announcement through the whole of its final day.
 *
 * Runs a few minutes past midnight Central, so an announcement expiring today
 * disappears overnight rather than mid-morning.
 *
 * The photo is removed first. A file whose document still exists is findable
 * and can be cleaned up; a document pointing at a file that is gone renders a
 * broken card to everyone until the next run.
 */
export const expireAnnouncements = onSchedule(
  { schedule: '5 0 * * *', timeZone: 'America/Chicago' },
  async () => {
    const db = admin.firestore()
    const today = todayCentral()

    // Read the whole collection rather than querying on expiresAt: most
    // announcements have no such field at all, and Firestore's inequality
    // filters exclude documents missing the field — so a query would work, but
    // this collection is small enough that one read of it costs less than the
    // index and the reasoning.
    const snap = await db.collection('announcements').get()
    const doomed = snap.docs.filter((d) => isExpired(d.data().expiresAt, today))
    if (doomed.length === 0) return

    const bucket = admin.storage().bucket()
    for (const doc of doomed) {
      const path = storagePathFromUrl(doc.data().attachment?.url)
      if (!path) continue
      try {
        await bucket.file(path).delete()
      } catch (err) {
        // Already gone, or never there. Not a reason to keep the announcement.
        logger.warn('[expireAnnouncements] could not delete photo', { path, err })
      }
    }

    let batch = db.batch()
    let pending = 0
    for (const doc of doomed) {
      batch.delete(doc.ref)
      pending += 1
      if (pending >= BATCH_LIMIT) {
        await batch.commit()
        batch = db.batch()
        pending = 0
      }
    }
    if (pending > 0) await batch.commit()

    logger.info('[expireAnnouncements] deleted', {
      count: doomed.length,
      today,
      ids: doomed.map((d) => d.id),
    })
  }
)
