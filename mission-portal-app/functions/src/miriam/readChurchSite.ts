import { onSchedule } from 'firebase-functions/v2/scheduler'
import { ORG_TIME_ZONE } from '../org'
import { logger } from 'firebase-functions'
import * as admin from 'firebase-admin'
import type { OwnDb } from './own/learn'
import { readSite, storeSite } from './own/site'
import { loadModel } from './model'

if (!admin.apps.length) admin.initializeApp()

/**
 * Miriam reads the church's website every night (./own/site): what it says
 * The Well believes, for her answers to questions of faith (./own/faith).
 * If nothing could be read, what she read before is kept.
 */
export const readChurchSite = onSchedule(
  {
    schedule: 'every day 03:50',
    timeZone: ORG_TIME_ZONE,
    memory: '1GiB',
    cpu: 1,
    timeoutSeconds: 540,
  },
  async () => {
    // Each passage's meaning is worked out with her model (./model).
    await loadModel()
    const read = await readSite()
    const kept = await storeSite(admin.firestore() as unknown as OwnDb, read)
    logger.info('readChurchSite', {
      pages: read.pages.length,
      passages: read.passages.length,
      kept,
    })
  }
)
