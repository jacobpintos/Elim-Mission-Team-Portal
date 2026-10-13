import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage } from '@/lib/firebase'
import { uriToBlob } from '@/lib/uriToBlob'
import { shrinkImage } from '@/lib/imageShrink'

/** The Storage rules for these folders reject anything larger. */
const MAX_BYTES = 10 * 1024 * 1024

/** eventFlights/ for boarding passes and itineraries, eventLodging/ for hotels. */
export type TravelImageFolder = 'eventFlights' | 'eventLodging'

export interface UploadedTravelImage {
  url: string
  /** The Storage path, which is what readTravelImage is given to read. */
  path: string
}

/**
 * Choose a picture for a flight leg or a hotel — a boarding pass, an
 * itinerary, a booking confirmation — and put it in Storage. Resolves to null
 * when the picker is cancelled.
 *
 * Files are keyed by the flight or lodging entry's id rather than the event's,
 * because a new event has no id until it is saved and the picture is chosen
 * before that.
 *
 * Nothing is deleted on replace or remove: the form can still be cancelled,
 * and a file deleted then would leave the saved event pointing at nothing.
 */
export async function pickAndUploadTravelImage(
  folder: TravelImageFolder,
  entryId: string
): Promise<UploadedTravelImage | null> {
  const ImagePicker = await import('expo-image-picker')

  // Granted automatically on web; on native this is the photo library prompt.
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
  if (!permission.granted) {
    throw new Error('Photo access is off for this app. Turn it on in Settings to add pictures.')
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.7,
  })
  if (result.canceled) return null
  const asset = result.assets?.[0]
  if (!asset?.uri) return null

  const picked = await uriToBlob(asset.uri)
  if (picked.size > MAX_BYTES) {
    throw new Error('That picture is larger than 10 MB. Please choose a smaller one.')
  }
  // The text on a boarding pass stays legible at the size this shrinks to.
  const { blob, contentType } = await shrinkImage(picked, asset.mimeType ?? 'image/jpeg')

  const name = (asset.fileName ?? 'travel.jpg').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80)
  const path = `${folder}/${entryId.replace(/[^A-Za-z0-9_-]/g, '_')}/${Date.now()}_${name}`
  const sRef = storageRef(storage, path)
  // The rule requires an image/* content type, which a Blob read off a
  // file:// URI does not reliably carry.
  await uploadBytes(sRef, blob, { contentType })
  return { url: await getDownloadURL(sRef), path }
}
