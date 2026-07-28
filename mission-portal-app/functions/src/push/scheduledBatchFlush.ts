import { onSchedule } from 'firebase-functions/v2/scheduler'
import * as admin from 'firebase-admin'
import { flushDueBatches } from './notifyCore'

if (!admin.apps.length) admin.initializeApp()

// Runs every 5 minutes; flushDueBatches() only acts on windows whose 20-minute
// refractory period has actually elapsed, so most runs are a fast no-op scan.
export const flushNotificationBatches = onSchedule('*/5 * * * *', async () => {
  await flushDueBatches()
})
