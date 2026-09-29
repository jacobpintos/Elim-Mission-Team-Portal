import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { storage } from '@/lib/firebase'
import { uriToBlob } from '@/lib/uriToBlob'

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
export async function pickAndUploadSetListAudio(songId: string): Promise<UploadedAudio | null> {
  const DocumentPicker = await import('expo-document-picker')

  const result = await DocumentPicker.getDocumentAsync({
    type: 'audio/*',
    // Straight to Storage — leaving it in the cache would mean reading a file
    // the OS may have already cleaned up by the time upload starts.
    copyToCacheDirectory: true,
    multiple: false,
  })
  if (result.canceled) return null

  const asset = result.assets?.[0]
  if (!asset?.uri) return null

  const name = asset.name ?? 'track.mp3'
  const blob = await uriToBlob(asset.uri)
  if (blob.size > MAX_AUDIO_BYTES) {
    throw new Error(`${name} is larger than 20 MB. Please choose a smaller file.`)
  }

  const path = `setListAudio/${songId}/${Date.now()}_${sanitize(name)}`
  const fileRef = storageRef(storage, path)
  await uploadBytes(fileRef, blob, {
    // asset.mimeType comes back undefined often enough on Android that the
    // fallback matters: without a type Storage stores it as
    // application/octet-stream and the player refuses to touch it.
    contentType: asset.mimeType || guessAudioType(name),
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

/** Last resort when the picker reports no MIME type. */
function guessAudioType(name: string): string {
  const ext = name.toLowerCase().split('.').pop() ?? ''
  switch (ext) {
    case 'mp3':
      return 'audio/mpeg'
    case 'm4a':
    case 'mp4':
      return 'audio/mp4'
    case 'aac':
      return 'audio/aac'
    case 'wav':
      return 'audio/wav'
    case 'ogg':
      return 'audio/ogg'
    case 'flac':
      return 'audio/flac'
    default:
      return 'audio/mpeg'
  }
}
