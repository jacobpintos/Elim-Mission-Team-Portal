import {
  ref as storageRef,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage'
import { storage } from '@/lib/firebase'
import { Platform } from 'react-native'
import { uriToBlob } from '@/lib/uriToBlob'
import { looksLikeAudio, audioContentType, uploadPercent } from '@/lib/audioFileType'

/**
 * The Storage rule for setListAudio/ rejects anything larger.
 *
 * Bigger than the 10 MB the image paths allow: a five-minute worship track at
 * a decent bitrate is already 7 MB, and a ten-minute one blows past 10 MB. The
 * ceiling is there to stop somebody uploading a WAV of a whole rehearsal, not
 * to make people re-encode a normal song.
 */
export const MAX_AUDIO_BYTES = 20 * 1024 * 1024

export interface UploadedAudio {
  url: string
  name: string
  path: string
}

/**
 * Choose an audio file and put it in Storage for one song of a set list.
 *
 * Keyed by song rather than by set list, because a set list has no id until it
 * is saved and the track is picked while the form is still open. What ties the
 * file to the set list is `audioPath` on the song — which is also what deletes
 * it later, so nothing here depends on the folder name.
 *
 * expo-document-picker rather than the image picker used everywhere else: it
 * is the one that offers Files, and on web it is a plain file input, so the
 * same call works in the browser where these set lists are actually built.
 */
export async function pickAndUploadSetListAudio(
  songId: string,
  /** Called with 0-100 as the bytes go up, so a long upload can show itself. */
  onProgress?: (percent: number) => void
): Promise<UploadedAudio | null> {
  const DocumentPicker = await import('expo-document-picker')

  const result = await DocumentPicker.getDocumentAsync({
    // No filter on the web, and it is not laziness. The web picker becomes
    // <input accept="…">, and iOS applies that by mapping it to document
    // types: a file it cannot map is greyed out and cannot be chosen at all.
    // An mp3 that reached the phone through another app is routinely typed as
    // plain data rather than audio, so accept="audio/*" greys out the very
    // file somebody is trying to add, with nothing on screen to say why.
    // Everything is offered instead and the choice is checked below, where a
    // wrong file can be explained rather than silently refused.
    type: Platform.OS === 'web' ? '*/*' : 'audio/*',
    // Straight to Storage — leaving it in the cache would mean reading a file
    // the OS may have already cleaned up by the time upload starts.
    copyToCacheDirectory: true,
    multiple: false,
  })
  if (result.canceled) return null

  const asset = result.assets?.[0]
  if (!asset?.uri) return null

  const name = asset.name ?? 'track.mp3'
  if (!looksLikeAudio(name, asset.mimeType)) {
    throw new Error(`${name} does not look like an audio file. Try an MP3 or M4A.`)
  }

  const blob = await uriToBlob(asset.uri)
  if (blob.size > MAX_AUDIO_BYTES) {
    throw new Error(`${name} is larger than 20 MB. Please choose a smaller file.`)
  }

  const path = `setListAudio/${songId}/${Date.now()}_${sanitize(name)}`
  const fileRef = storageRef(storage, path)

  // Resumable rather than uploadBytes, only for the progress it reports: a
  // full-length track on church wifi takes long enough that a button reading
  // "Uploading…" and nothing else is indistinguishable from one that has hung.
  const task = uploadBytesResumable(fileRef, blob, {
    // Deliberately not `asset.mimeType || …`: a browser that reports
    // application/octet-stream is reporting something, and storing an mp3
    // under that name is an upload the Storage rule rejects outright, since
    // it requires audio/*.
    contentType: audioContentType(name, asset.mimeType),
    // A year, and immutable, because it is: the path carries a timestamp, so
    // this URL will never point at different audio. It lets the browser keep
    // the file between visits without being asked, which is most of what
    // offline playback means on the web — the app's own cache is the rest.
    cacheControl: 'public, max-age=31536000, immutable',
  })

  onProgress?.(0)
  await new Promise<void>((resolve, reject) => {
    task.on(
      'state_changed',
      (snapshot) => onProgress?.(uploadPercent(snapshot.bytesTransferred, snapshot.totalBytes)),
      reject,
      resolve
    )
  })

  return { url: await getDownloadURL(fileRef), name, path }
}

/**
 * Remove an uploaded track.
 *
 * Failures are swallowed on purpose. By the time this runs the song no longer
 * points at the file, so an error here is a stray object in a bucket — not
 * something the person deleting a set list can do anything about, and not a
 * reason to fail the delete they asked for.
 */
export async function deleteSetListAudio(path: string | undefined | null): Promise<void> {
  if (!path) return
  try {
    await deleteObject(storageRef(storage, path))
  } catch {
    // Already gone, or never uploaded.
  }
}

/** Storage object names take almost anything; keeping them dull avoids finding out. */
function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80)
}
