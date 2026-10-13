import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage } from '@/lib/firebase'
import { uriToBlob } from '@/lib/uriToBlob'
import { shrinkImage } from '@/lib/imageShrink'

/** The Storage rule for eventFlights/ rejects anything larger. */
const MAX_BYTES = 10 * 1024 * 1024

/**
 * Choose a picture for a flight leg — a boarding pass, an itinerary
 * screenshot — and put it in Storage, returning the address to store on the
 * entry. Resolves to null when the picker is cancelled.
 *
 * Files are keyed by the flight entry's id rather than the event's, because a
 * new event has no id until it is saved and the picture is chosen before that.
 *
 * Nothing is deleted on replace or remove: the form can still be cancelled,
 * and a file deleted then would leave the saved event pointing at nothing.
 */
export async function pickAndUploadFlightImage(entryId: string): Promise<string | null> {
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
  const { blob, contentType } = await shrinkImage(picked, asset.mimeType ?? 'image/jpeg')

  const name = (asset.fileName ?? 'flight.jpg').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80)
  const sRef = storageRef(storage, `eventFlights/${entryId}/${Date.now()}_${name}`)
  // The rule requires an image/* content type, which a Blob read off a
  // file:// URI does not reliably carry.
  await uploadBytes(sRef, blob, { contentType })
  return getDownloadURL(sRef)
}
