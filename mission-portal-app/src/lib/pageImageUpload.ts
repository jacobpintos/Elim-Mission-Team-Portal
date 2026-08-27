import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage } from '@/lib/firebase'
import { uriToBlob } from '@/lib/uriToBlob'

/** The Storage rule for pages/ rejects anything larger. */
const MAX_BYTES = 10 * 1024 * 1024

export interface PickedImage {
  url: string
  /** What the file was called, for reporting which one failed. */
  name: string
}

export interface PickPageImagesOptions {
  /** Let the admin choose several at once. The point of the whole exercise. */
  multiple?: boolean
  /** Called as each upload finishes, so a button can count up. */
  onProgress?: (done: number, total: number) => void
}

/**
 * Choose pictures and put them in Storage, returning addresses to store.
 *
 * Page blocks hold image addresses, and until this existed the only way to
 * get one was to find the picture somewhere else on the internet, copy its
 * address, and paste it in — once per picture, per block. That is the whole
 * reason the Giving hero ended up pointing at a Facebook page: no address was
 * to hand, so the nearest link got used.
 *
 * Works on web as well as native: expo-image-picker's web implementation is a
 * file input, and it honours multiple selection, so a gallery can be filled
 * in one go from a desktop browser — which is where these pages are actually
 * built.
 */
export async function pickAndUploadPageImages(
  pageKey: string,
  options: PickPageImagesOptions = {}
): Promise<PickedImage[]> {
  const ImagePicker = await import('expo-image-picker')

  // Granted automatically on web; on native this is the photo library prompt.
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
  if (!permission.granted) {
    throw new Error('Photo access is off for this app. Turn it on in Settings to add pictures.')
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: options.multiple ?? false,
    quality: 0.8,
  })
  if (result.canceled) return []

  const assets = result.assets ?? []
  const uploaded: PickedImage[] = []

  // Sequential rather than Promise.all: a page gallery can be a dozen photos
  // off a phone, and starting a dozen uploads at once on a hotel connection
  // is how they all time out together.
  for (const asset of assets) {
    if (!asset.uri) continue
    const name = asset.fileName ?? `photo-${uploaded.length + 1}.jpg`

    const blob = await uriToBlob(asset.uri)
    if (blob.size > MAX_BYTES) {
      throw new Error(`${name} is larger than 10 MB. Please choose a smaller picture.`)
    }

    const path = `pages/${pageKey}/${Date.now()}_${sanitize(name)}`
    const sRef = storageRef(storage, path)
    // The rule requires an image/* content type, which a Blob read off a
    // file:// URI does not reliably carry.
    await uploadBytes(sRef, blob, { contentType: asset.mimeType ?? 'image/jpeg' })

    uploaded.push({ url: await getDownloadURL(sRef), name })
    options.onProgress?.(uploaded.length, assets.length)
  }

  return uploaded
}

/** Storage object names take almost anything; keeping them dull avoids finding out. */
function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80)
}
