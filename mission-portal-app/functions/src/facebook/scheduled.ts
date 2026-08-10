import { onSchedule } from 'firebase-functions/v2/scheduler'
import * as admin from 'firebase-admin'
import { logger } from 'firebase-functions'
import { CONNECTIONS } from './config'
import { syncPage } from './sync'

if (!admin.apps.length) admin.initializeApp()

/**
 * Hourly catch-up across every connected Page.
 *
 * Webhooks carry the feed in real time, but they are best-effort: deliveries
 * get dropped, and engagement counts drift without ever firing an event. This
 * pass is what makes a missed post self-heal rather than being lost forever,
 * so it runs regardless of how healthy the webhook looks.
 */
export const fbPostsBackfill = onSchedule(
  { schedule: '17 * * * *', timeZone: 'America/Chicago', timeoutSeconds: 540 },
  async () => {
    const snap = await admin.firestore().collection(CONNECTIONS).get()
    if (snap.empty) return

    let ok = 0
    let failed = 0

    for (const doc of snap.docs) {
      // One dead token must not stop the Pages behind it in the loop.
      try {
        await syncPage(doc.id)
        ok++
      } catch (err) {
        failed++
        logger.error('fb: scheduled sync failed', { pageId: doc.id, err: String(err) })
      }
    }

    logger.info('fb: backfill complete', { pages: snap.size, ok, failed })
  }
)
