import { onSchedule } from 'firebase-functions/v2/scheduler'
import * as admin from 'firebase-admin'
import { v1 } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions'

if (!admin.apps.length) admin.initializeApp()

/**
 * Every night, a copy of the whole database in the project's Storage bucket.
 *
 * Without this, a document deleted by mistake — an event, a person, a
 * year of availability — was gone: Firestore keeps no history of its own. An
 * export is a full copy that can be imported back, whole or a collection at a
 * time (see the README's "Backups" section for the command).
 *
 * Kept under backups/firestore/YYYY-MM-DD/ in the default bucket, where the
 * Storage rules match nothing, so no client can read or delete them. Exports
 * older than KEEP_DAYS are removed after each new one succeeds — never before,
 * so a run of failures cannot leave the project with none.
 *
 * Files in Storage (photos, receipts, audio) are not part of a Firestore
 * export; they live in Storage already, and are covered by its own
 * soft-delete setting rather than by this.
 *
 * The functions' service account needs the "Cloud Datastore Import Export
 * Admin" role for the export to be allowed. The project's default account
 * normally has it through Editor; if a run logs PERMISSION_DENIED, grant it in
 * Google Cloud → IAM.
 */

export const BACKUP_PREFIX = 'backups/firestore/'
export const KEEP_DAYS = 30

/** The folder for a day's export, and the day back out of a file's path. */
export function backupFolder(day: string): string {
  return `${BACKUP_PREFIX}${day}`
}

export function dayOfBackupFile(path: string): string | null {
  const m = path.startsWith(BACKUP_PREFIX)
    ? path.slice(BACKUP_PREFIX.length).match(/^(\d{4}-\d{2}-\d{2})\//)
    : null
  return m ? m[1] : null
}

/** The oldest day still kept, given today. */
export function oldestKept(today: string, keepDays = KEEP_DAYS): string {
  const d = new Date(`${today}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - (keepDays - 1))
  return d.toISOString().slice(0, 10)
}

function todayInIowa(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
}

export const nightlyBackup = onSchedule(
  { schedule: '30 2 * * *', timeZone: 'America/Chicago', timeoutSeconds: 540 },
  async () => {
    const projectId = process.env.GCLOUD_PROJECT ?? admin.app().options.projectId ?? ''
    const bucket = admin.storage().bucket()
    const day = todayInIowa()
    const status = admin.firestore().doc('backupStatus/latest')

    try {
      const client = new v1.FirestoreAdminClient()
      const [operation] = await client.exportDocuments({
        name: client.databasePath(projectId, '(default)'),
        outputUriPrefix: `gs://${bucket.name}/${backupFolder(day)}`,
        // Empty means every collection, including ones added after this was written.
        collectionIds: [],
      })
      // Waited for, so "succeeded" below means the copy is actually there.
      await operation.promise()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error('[nightlyBackup] export failed', { day, message })
      await status.set({ lastError: message, lastErrorAt: Date.now() }, { merge: true })
      return
    }

    // Only now, with today's copy safe, are old ones removed.
    const keepFrom = oldestKept(day)
    const [files] = await bucket.getFiles({ prefix: BACKUP_PREFIX })
    const old = files.filter((f) => {
      const d = dayOfBackupFile(f.name)
      return d !== null && d < keepFrom
    })
    await Promise.all(old.map((f) => f.delete().catch(() => undefined)))

    await status.set(
      { lastOk: day, lastOkAt: Date.now(), path: backupFolder(day), lastError: null },
      { merge: true }
    )
    logger.info('[nightlyBackup] done', { day, removed: old.length })
  }
)
