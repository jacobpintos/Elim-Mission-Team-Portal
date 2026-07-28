import { onDocumentUpdated } from 'firebase-functions/v2/firestore'
import * as admin from 'firebase-admin'
import { logger } from 'firebase-functions'
import { RESEND_API_KEY } from '../email/client'
import { notifyUser } from './notifyCore'

if (!admin.apps.length) admin.initializeApp()

/** All uids that should hear about security activity: admins + security role. */
async function getSecurityAudience(): Promise<string[]> {
  const db = admin.firestore()
  const [adminsSnap, securitySnap] = await Promise.all([
    db.collection('users').where('roles', 'array-contains', 'admin').get(),
    db.collection('users').where('roles', 'array-contains', 'security').get(),
  ])
  const uids = new Set<string>()
  adminsSnap.docs.forEach((d) => uids.add(d.id))
  securitySnap.docs.forEach((d) => uids.add(d.id))
  return [...uids]
}

/**
 * Notifies on security report responses.
 *
 * Submission itself is already notified client-side when the report is filed.
 * This covers the "responded to" half of the spec: someone marking themselves
 * on the way, or resolving the report. The original reporter is notified too
 * (they're the one waiting on it), alongside admins and security users.
 */
export const onSecurityReportUpdated = onDocumentUpdated(
  { document: 'securityReports/{id}', secrets: [RESEND_API_KEY] },
  async (event) => {
    const before = event.data?.before.data() as { status?: string } | undefined
    const after = event.data?.after.data() as
      | { status?: string; location?: string; responderName?: string; reportedBy?: string }
      | undefined
    if (!before || !after) return
    if (before.status === after.status) return

    let message: string
    if (after.status === 'responding') {
      message = `${after.responderName ?? 'A responder'} is on the way to the incident at ${after.location ?? 'an unknown location'}`
    } else if (after.status === 'resolved') {
      message = `Security report at ${after.location ?? 'an unknown location'} was resolved`
    } else {
      return
    }

    const audience = new Set(await getSecurityAudience())
    // The person who filed it is waiting on this outcome.
    if (after.reportedBy) audience.add(String(after.reportedBy))

    for (const uid of audience) {
      await notifyUser(uid, 'securityReport', {
        message,
        reportId: event.params.id,
      })
    }
    logger.info(`onSecurityReportUpdated: ${event.params.id} -> ${after.status}`)
  }
)
