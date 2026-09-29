import { onDocumentDeleted } from 'firebase-functions/v2/firestore'
import * as admin from 'firebase-admin'
import { logger } from 'firebase-functions'

if (!admin.apps.length) admin.initializeApp()

interface SongRaw {
  audioPath?: unknown
}

/**
 * Every uploaded track a set list points at.
 *
 * Mirrors audioPathsFor() in mission-portal-app/src/lib/setListAudioUpload.ts —
 * functions/ is a separate TypeScript project and cannot import it, so the two
 * have to be kept in step by hand. Reads the stored path rather than the
 * download URL: a download URL carries a token and is not an object name.
 */
export function audioPathsFor(data: { songs?: unknown } | undefined): string[] {
  const songs = Array.isArray(data?.songs) ? (data?.songs as SongRaw[]) : []
  return songs
    .map((song) => song?.audioPath)
    .filter((path): path is string => typeof path === 'string' && path.length > 0)
}

/**
 * Delete a set list's audio files along with the set list.
 *
 * A track is uploaded to Storage the moment it is picked, and the set list
 * document only ever holds a URL to it — so deleting the set list used to
 * leave the files in the bucket, paid for monthly, reachable by anyone holding
 * the link and referenced by nothing.
 *
 * Runs server-side rather than in the delete button, like onEventDeleted, so
 * it covers every route a set list can be removed by, including one added
 * later by somebody who never reads this file. Each delete is independent:
 * one missing object must not strand the rest.
 */
export const onSetListDeleted = onDocumentDeleted('setLists/{setListId}', async (event) => {
  const paths = audioPathsFor(event.data?.data())
  if (paths.length === 0) return

  const bucket = admin.storage().bucket()
  const results = await Promise.allSettled(paths.map((path) => bucket.file(path).delete()))

  const failed = results.filter((r) => r.status === 'rejected').length
  logger.info(
    `onSetListDeleted: removed ${paths.length - failed} of ${paths.length} audio file(s) ` +
      `for set list ${event.params.setListId}`
  )
})
