import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage } from '@/lib/firebase'
import { uriToBlob } from '@/lib/uriToBlob'
import { shrinkImage } from '@/lib/imageShrink'

/** The Storage rule for receipts rejects anything larger. */
const MAX_BYTES = 10 * 1024 * 1024

/** Receipts are read for small print, so they are kept larger than a page photo. */
const RECEIPT_EDGE = 2000

export interface PickedReceipt {
  /** A local URI, for the preview before it is sent. */
  uri: string
  mimeType: string
  fileName: string
}

/**
 * Choose photos of receipts. Resolves to [] when the picker is cancelled.
 * Nothing is uploaded yet: the form can still be abandoned.
 */
export async function pickReceipts(limit: number): Promise<PickedReceipt[]> {
  const ImagePicker = await import('expo-image-picker')
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
  if (!permission.granted) {
    throw new Error('Photo access is off for this app. Turn it on in Settings to add receipts.')
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: limit,
    quality: 0.8,
  })
  if (result.canceled) return []
  return (result.assets ?? [])
    .filter((a) => !!a.uri)
    .map((a) => ({
      uri: a.uri,
      mimeType: a.mimeType ?? 'image/jpeg',
      fileName: a.fileName ?? 'receipt.jpg',
    }))
}

/**
 * Put a receipt in the person's own folder and return its Storage path.
 *
 * The path, not a download URL, is what the request keeps: a download URL
 * opens for anyone who has it, and a receipt should be reached only through
 * the request that names it.
 */
export async function uploadReceipt(uid: string, receipt: PickedReceipt): Promise<string> {
  const picked = await uriToBlob(receipt.uri)
  if (picked.size > MAX_BYTES) {
    throw new Error('A receipt photo is larger than 10 MB. Please choose a smaller one.')
  }
  const { blob, contentType } = await shrinkImage(picked, receipt.mimeType, {
    maxEdge: RECEIPT_EDGE,
  })
  const name = receipt.fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-60)
  const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  const path = `reimbursements/${uid}/${unique}_${name}`
  await uploadBytes(storageRef(storage, path), blob, { contentType })
  return path
}

/** A link to look at a receipt, asked for when it is about to be shown. */
export function receiptUrl(path: string): Promise<string> {
  return getDownloadURL(storageRef(storage, path))
}
