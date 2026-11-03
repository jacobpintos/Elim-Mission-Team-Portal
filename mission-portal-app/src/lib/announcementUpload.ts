import {
  ref as storageRef,
  uploadBytes,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage'
import { Platform } from 'react-native'
import { storage } from '@/lib/firebase'
import { uriToBlob } from '@/lib/uriToBlob'
import type { AnnouncementAttachment } from '@/types/events'
import { MAX_VIDEO_BYTES, sizeSaid, videoType } from '@/lib/announcementImage'

const MAX_BYTES = 10 * 1024 * 1024

/**
 * Put an announcement's photo in Storage and describe it.
 *
 * The natural width and height come back from the picker and are stored with
 * the URL, so a card can work out the height that keeps the proportions
 * without downloading the file to measure it — otherwise every card would lay
 * out at a guessed height and jump once the real one arrived.
 *
 * Files live under the announcement's own id, which is what lets the expiry
 * job and the "remove photo" button find and delete them.
 */
export async function uploadAnnouncementImage(
  announcementId: string,
  // fileName and mimeType come back nullable from expo-image-picker, not just
  // absent, so the nulls are accepted here rather than cast away at the call.
  asset: {
    uri: string
    width?: number
    height?: number
    fileName?: string | null
    mimeType?: string | null
  }
): Promise<AnnouncementAttachment> {
  const blob = await uriToBlob(asset.uri)
  if (blob.size > MAX_BYTES) {
    throw new Error('That photo is larger than 10 MB. Please pick a smaller one.')
  }

  const name = `${Date.now()}_${asset.fileName ?? 'photo.jpg'}`
  const sRef = storageRef(storage, `announcements/${announcementId}/${name}`)
  // The Storage rule requires an image/* content type, which a Blob read off a
  // file:// URI does not reliably carry.
  await uploadBytes(sRef, blob, { contentType: asset.mimeType ?? 'image/jpeg' })
  const url = await getDownloadURL(sRef)

  return {
    type: 'image',
    url,
    name,
    ...(asset.width && asset.height ? { width: asset.width, height: asset.height } : {}),
  }
}

/**
 * Put an announcement's video in Storage and describe it, telling `onProgress`
 * how far along it is (0 to 1) — a video takes long enough to need saying.
 *
 * Kept beside its photos, under the announcement's id, so removing it, the
 * announcement, or its expiry takes it too (functions/src/expireAnnouncements).
 */
export async function uploadAnnouncementVideo(
  announcementId: string,
  asset: {
    uri: string
    width?: number
    height?: number
    /** In milliseconds on the phone, seconds on the web (expo-image-picker). */
    duration?: number | null
    fileName?: string | null
    mimeType?: string | null
  },
  onProgress?: (fraction: number) => void
): Promise<AnnouncementAttachment> {
  const blob = await uriToBlob(asset.uri)
  if (blob.size > MAX_VIDEO_BYTES) {
    throw new Error(
      `That video is ${sizeSaid(blob.size)} — the most is ${sizeSaid(MAX_VIDEO_BYTES)}. Try a shorter clip.`
    )
  }
  const contentType = videoType(asset.mimeType ?? blob.type, asset.fileName)
  const name = `${Date.now()}_${asset.fileName ?? `video.${contentType === 'video/quicktime' ? 'mov' : 'mp4'}`}`
  const sRef = storageRef(storage, `announcements/${announcementId}/${name}`)
  const task = uploadBytesResumable(sRef, blob, { contentType })
  await new Promise<void>((resolve, reject) => {
    task.on(
      'state_changed',
      (snap) => onProgress?.(snap.totalBytes ? snap.bytesTransferred / snap.totalBytes : 0),
      reject,
      () => resolve()
    )
  })
  const url = await getDownloadURL(sRef)
  return {
    type: 'video',
    url,
    name,
    size: blob.size,
    ...(asset.width && asset.height ? { width: asset.width, height: asset.height } : {}),
    // In milliseconds from the phone's picker; the web's gives the browser's
    // own reading, in seconds, though its type says otherwise.
    ...(asset.duration
      ? { duration: Math.round(Platform.OS === 'web' ? asset.duration : asset.duration / 1000) }
      : {}),
  }
}

/**
 * Remove a photo from Storage, given the URL stored on the announcement.
 *
 * Best-effort on purpose. A file that is already gone, or one whose URL cannot
 * be resolved back to a path, must not stop the announcement itself being
 * saved or deleted — an orphaned object costs a little space, and a delete
 * that refuses to finish costs the admin their edit.
 */
export async function deleteAnnouncementImage(url: string | undefined | null): Promise<void> {
  if (!url) return
  try {
    await deleteObject(storageRef(storage, url))
  } catch {
    // Already deleted, or not a path this bucket owns. Nothing to do.
  }
}
