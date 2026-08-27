import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { storage } from '@/lib/firebase'
import { uriToBlob } from '@/lib/uriToBlob'
import { shrinkImage, THUMB_EDGE } from '@/lib/imageShrink'
import type { PhotoItem } from '@/types/photos'

/** The Storage rule for photoAlbums/ rejects anything larger. */
const MAX_BYTES = 10 * 1024 * 1024

/**
 * Below this a separate thumbnail is not worth the second file: the picture
 * is already small enough to put in a grid.
 */
const THUMB_WORTH_IT_OVER = 80 * 1024

export interface AlbumUploadOptions {
  onProgress?: (done: number, total: number) => void
}

/**
 * Choose photos and add them to an album.
 *
 * Two files are stored for each picture, not one. An album can run to
 * hundreds of photos and the grid draws them at 120pt, so handing the browser
 * the full-size image for every cell is the difference between a page that
 * opens and one that grinds — thirty photos at 300 KB is 9 MB of downloading
 * before anything appears, against about 900 KB of thumbnails. The full
 * version is fetched only when a photo is tapped.
 */
export async function pickAndUploadAlbumPhotos(
  albumId: string,
  options: AlbumUploadOptions = {}
): Promise<PhotoItem[]> {
  const ImagePicker = await import('expo-image-picker')

  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
  if (!permission.granted) {
    throw new Error('Photo access is off for this app. Turn it on in Settings to add photos.')
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    // The entire point: a year of photos is not added one at a time.
    allowsMultipleSelection: true,
    quality: 0.6,
  })
  if (result.canceled) return []

  const assets = result.assets ?? []
  const added: PhotoItem[] = []

  // One at a time. A hundred photos started at once is a hundred stalled
  // connections, and the count would stop meaning anything.
  for (const asset of assets) {
    if (!asset.uri) continue
    const name = asset.fileName ?? `photo-${added.length + 1}.jpg`

    const picked = await uriToBlob(asset.uri)
    if (picked.size > MAX_BYTES) {
      throw new Error(`${name} is larger than 10 MB. Please choose a smaller photo.`)
    }

    const base = `photoAlbums/${albumId}/${Date.now()}_${sanitize(name)}`
    const full = await shrinkImage(picked, asset.mimeType ?? 'image/jpeg')
    const fullRef = storageRef(storage, base)
    await uploadBytes(fullRef, full.blob, { contentType: full.contentType })

    const photo: PhotoItem = { url: await getDownloadURL(fullRef) }

    if (full.blob.size > THUMB_WORTH_IT_OVER) {
      const thumb = await shrinkImage(full.blob, full.contentType, {
        maxEdge: THUMB_EDGE,
        // Always redraw: the size test that protects a small PNG from being
        // re-encoded would otherwise skip the very files a thumbnail is for.
        skipUnderBytes: 0,
        quality: 0.7,
      })
      // On native there is no canvas, so this comes back as the same blob and
      // a second copy would be pure waste.
      if (thumb.blob !== full.blob) {
        const thumbRef = storageRef(storage, `${base}_thumb.jpg`)
        await uploadBytes(thumbRef, thumb.blob, { contentType: thumb.contentType })
        photo.thumbUrl = await getDownloadURL(thumbRef)
      }
    }

    added.push(photo)
    options.onProgress?.(added.length, assets.length)
  }

  return added
}

/**
 * Delete the files behind an album photo, if this app is what stored them.
 *
 * A photo added by pasting an address is hosted by someone else and is not
 * ours to remove. Failures are swallowed: the photo is already gone from the
 * album by this point, and an error here would only report a problem nobody
 * can act on.
 */
export async function deleteAlbumPhotoFiles(photo: PhotoItem): Promise<void> {
  for (const url of [photo.url, photo.thumbUrl]) {
    if (!url || !isUploadedAlbumPhoto(url)) continue
    try {
      await deleteObject(storageRef(storage, url))
    } catch {
      // Already deleted, or never there.
    }
  }
}

/** A download URL for something under photoAlbums/ in this project's bucket. */
export function isUploadedAlbumPhoto(url: string): boolean {
  return (
    url.startsWith('https://firebasestorage.googleapis.com/') &&
    (url.includes('/o/photoAlbums%2F') || url.includes('/o/photoAlbums/'))
  )
}

/** Storage object names take almost anything; keeping them dull avoids finding out. */
function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80)
}
