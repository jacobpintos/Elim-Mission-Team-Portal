import { onSchedule } from 'firebase-functions/v2/scheduler'
import * as admin from 'firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions'
import { receiptsDue, RECEIPT_KEEP_YEARS, type ReimbursementStatus } from './logic'

if (!admin.apps.length) admin.initializeApp()

/**
 * Every night, remove receipts and invoices once they are two years old.
 *
 * The request itself stays — what was asked, approved and paid, and when — so
 * Finance still tallies it; only the files go, and the request records when.
 * Nothing in the app deletes them before then.
 */
export const purgeOldReceipts = onSchedule(
  { schedule: '15 3 * * *', timeZone: 'America/Chicago', timeoutSeconds: 540 },
  async () => {
    const db = admin.firestore()
    const bucket = admin.storage().bucket()
    const now = Date.now()
    // Made before this moment, at the latest, to be two years old.
    const cutoff = new Date(now)
    cutoff.setUTCFullYear(cutoff.getUTCFullYear() - RECEIPT_KEEP_YEARS)

    const snap = await db
      .collection('reimbursements')
      .where('createdAt', '<=', cutoff.getTime())
      .get()

    let removed = 0
    for (const d of snap.docs) {
      const r = d.data() as {
        createdAt: number
        status: ReimbursementStatus
        receipts?: string[]
      }
      const receipts = r.receipts ?? []
      if (!receiptsDue({ ...r, receipts }, now)) continue
      // A file already gone counts as removed: the point is that it is.
      await Promise.all(
        receipts.map((p) =>
          bucket
            .file(p)
            .delete()
            .catch(() => undefined)
        )
      )
      await d.ref.update({
        receipts: [],
        receiptsRemovedAt: now,
        history: FieldValue.arrayUnion({
          at: now,
          by: 'system',
          text: `Receipts removed, ${RECEIPT_KEEP_YEARS} years after the request`,
        }),
      })
      removed++
    }
    logger.info('[purgeOldReceipts] done', { checked: snap.size, removed })
  }
)
