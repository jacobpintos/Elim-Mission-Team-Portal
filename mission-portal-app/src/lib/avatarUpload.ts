import { Platform } from 'react-native'
import { ref as storageRef, uploadString, getDownloadURL } from 'firebase/storage'
import { doc, updateDoc } from 'firebase/firestore'
import { db, storage } from '@/lib/firebase'

/**
 * Downscale + re-encode a data URL using a canvas. Web only — `document` and
 * `window.Image` do not exist in React Native.
 */
async function compressDataUrl(dataUrl: string, maxDim = 512, quality = 0.78): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    img.onload = () => {
      const ratio = Math.min(maxDim / img.width, maxDim / img.height, 1)
      const w = Math.round(img.width * ratio)
      const h = Math.round(img.height * ratio)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('canvas unavailable'))
        return
      }
      ctx.drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = reject
    img.src = dataUrl
  })
}

/** Read a browser File into a data URL. Web only. */
export async function fileToDataUrl(file: File): Promise<string> {
  const reader = new FileReader()
  return new Promise<string>((resolve, reject) => {
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/** Upload an already-read web File as the user's avatar. */
export async function uploadAvatarFromFile(uid: string, file: File): Promise<string> {
  const dataUrl = await fileToDataUrl(file)
  const compressed = await compressDataUrl(dataUrl)
  const sref = storageRef(storage, `avatars/${uid}`)
  await uploadString(sref, compressed, 'data_url')
  const photoURL = await getDownloadURL(sref)
  await updateDoc(doc(db, 'users', uid), { photoURL })
  return photoURL
}

interface PickAvatarCallbacks {
  /** Called when the user declines photo library access. */
  onPermissionDenied?: () => void
  /** Called once an image is chosen and the upload is about to start. */
  onUploadStart?: () => void
}

/**
 * Open the native photo library, upload the chosen image as the user's avatar
 * and write the resulting URL to their profile.
 *
 * Returns the new photo URL, or `null` if the user cancelled or denied access.
 * Native only — on web use {@link uploadAvatarFromFile} with a file input.
 *
 * Reads the asset as base64 and uploads it as a data URL rather than going
 * through `fetch(uri).blob()`, which is unreliable for `file://` URIs on React
 * Native. expo-image-picker's `quality` option handles the downscaling, so the
 * web-only canvas compression step is skipped here.
 */
export async function pickAndUploadAvatar(
  uid: string,
  callbacks: PickAvatarCallbacks = {}
): Promise<string | null> {
  if (Platform.OS === 'web') throw new Error('pickAndUploadAvatar is native-only')

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ImagePicker = require('expo-image-picker')
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
  if (!perm.granted) {
    callbacks.onPermissionDenied?.()
    return null
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.5,
    base64: true,
  })
  if (result.canceled) return null
  const asset = result.assets?.[0]
  if (!asset?.base64) return null

  callbacks.onUploadStart?.()
  const dataUrl = `data:${asset.mimeType ?? 'image/jpeg'};base64,${asset.base64}`
  const sref = storageRef(storage, `avatars/${uid}`)
  await uploadString(sref, dataUrl, 'data_url')
  const photoURL = await getDownloadURL(sref)
  await updateDoc(doc(db, 'users', uid), { photoURL })
  return photoURL
}
