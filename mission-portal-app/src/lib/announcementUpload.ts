import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { storage } from '@/lib/firebase'
import { uriToBlob } from '@/lib/uriToBlob'
import type { AnnouncementAttachment } from '@/types/events'

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
