import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore'
import * as admin from 'firebase-admin'
import { logger } from 'firebase-functions'
import { notifyUser } from './notifyCore'
import { newIncidentSaid } from './recordTellings'

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
 * A security report filed: admins and security are told, here.
 *
 * The app used to tell them itself, from whoever filed it — and only an
 * admin's app knows who the admins and security are, so a report filed by
 * anyone else reached nobody.
 */
export const onSecurityReportCreated = onDocumentCreated('securityReports/{id}', async (event) => {
  const report = event.data?.data()
  if (!report) return
  const message = newIncidentSaid(report)
  const audience = await getSecurityAudience()
  for (const uid of audience) {
    await notifyUser(uid, 'securityReport', {
      message,
      reportId: event.params.id,
      link: '/(app)/security',
    }).catch((err: unknown) => logger.error('onSecurityReportCreated: not told', { uid, err }))
  }
  logger.info(`onSecurityReportCreated: ${event.params.id} told to ${audience.length}`)
})

/**
 * Notifies on security report responses: someone marking themselves on the
 * way, or resolving the report. The original reporter is notified too
 * (they're the one waiting on it), alongside admins and security users.
 */
export const onSecurityReportUpdated = onDocumentUpdated('securityReports/{id}', async (event) => {
  const before = event.data?.before.data() as { status?: string } | undefined
  const after = event.data?.after.data() as
    | {
        status?: string
        location?: string
        responderName?: string
        reportedBy?: string
        resolution?: string | null
      }
    | undefined
  if (!before || !after) return
  if (before.status === after.status) return

  let message: string
  if (after.status === 'responding') {
    message = `${after.responderName ?? 'A responder'} is on the way to the incident at ${after.location ?? 'an unknown location'}`
  } else if (after.status === 'resolved') {
    // With how it ended, as far as fits: those who were told of it are waiting to hear.
    const how = String(after.resolution ?? '').trim()
    message =
      `Security report at ${after.location ?? 'an unknown location'} was resolved` +
      (how ? `: ${how.slice(0, 100)}${how.length > 100 ? '…' : ''}` : '')
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
      link: '/(app)/security',
    })
  }
  logger.info(`onSecurityReportUpdated: ${event.params.id} -> ${after.status}`)
})
