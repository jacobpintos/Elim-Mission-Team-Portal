import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import * as admin from 'firebase-admin'
import { logger } from 'firebase-functions'
import { RESEND_API_KEY } from '../email/client'
import { notifyUser } from './notifyCore'

if (!admin.apps.length) admin.initializeApp()

async function getAdminUids(): Promise<string[]> {
  const snap = await admin
    .firestore()
    .collection('users')
    .where('roles', 'array-contains', 'admin')
    .get()
  return snap.docs.map((d) => d.id)
}

/** New Kaizen idea submitted — notify admins (batched). */
export const onKaizenCreated = onDocumentCreated(
  { document: 'kaizen/{id}', secrets: [RESEND_API_KEY] },
  async (event) => {
    const data = event.data?.data() as { title?: string } | undefined
    if (!data) return

    const adminUids = await getAdminUids()
    for (const uid of adminUids) {
      await notifyUser(uid, 'kaizenSubmission', {
        title: data.title ?? 'Untitled',
        kaizenId: event.params.id,
      })
    }
    logger.info(`onKaizenCreated: notified ${adminUids.length} admin(s)`)
  }
)

/** New issue report submitted — notify admins (batched). */
export const onIssueCreated = onDocumentCreated(
  { document: 'issues/{id}', secrets: [RESEND_API_KEY] },
  async (event) => {
    const data = event.data?.data() as { title?: string } | undefined
    if (!data) return

    const adminUids = await getAdminUids()
    for (const uid of adminUids) {
      await notifyUser(uid, 'issueSubmission', {
        title: data.title ?? 'Untitled',
        issueId: event.params.id,
      })
    }
    logger.info(`onIssueCreated: notified ${adminUids.length} admin(s)`)
  }
)
