import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db, storage } from '@/lib/firebase'
import { uriToBlob } from '@/lib/uriToBlob'

/** Storage refuses room images at 10MB (storage.rules rooms). */
const COVER_MAX_BYTES = 10 * 1024 * 1024

export interface PickedPhoto {
  uri: string
  mimeType?: string
}

/** A photo chosen from the library, square, for a group chat's cover; null if none was. */
export async function pickCover(): Promise<PickedPhoto | null> {
  const ImagePicker = await import('expo-image-picker')
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.7,
  })
  if (result.canceled) return null
  const asset = result.assets?.[0]
  return asset?.uri ? { uri: asset.uri, mimeType: asset.mimeType ?? undefined } : null
}

/** A group chat's cover photo: uploaded, and put on the chat for everyone in it. Its URL. */
export async function setRoomCover(roomId: string, photo: PickedPhoto): Promise<string> {
  const blob = await uriToBlob(photo.uri)
  if (blob.size >= COVER_MAX_BYTES) {
    throw new Error('That photo is too large — please choose a smaller one')
  }
  const sref = storageRef(storage, `rooms/${roomId}/cover/${Date.now()}.jpg`)
  // The rules require an image/* type, which a Blob read off a file:// URI may not carry.
  await uploadBytes(sref, blob, { contentType: photo.mimeType ?? 'image/jpeg' })
  const photoURL = await getDownloadURL(sref)
  await updateDoc(doc(db, 'rooms', roomId), { photoURL, updatedAt: serverTimestamp() })
  return photoURL
}
