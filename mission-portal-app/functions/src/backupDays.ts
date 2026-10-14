/**
 * Where nightly backups go and how long they are kept, with nothing to do
 * with Firebase — so the app's tests can import it without the functions'
 * own dependencies installed, which CI does not do.
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
