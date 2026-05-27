import * as ImagePicker from 'expo-image-picker'
import { Platform } from 'react-native'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage } from '@/lib/firebase'
import type { Attachment } from '@/types/shared'

export function useFileUpload() {
  async function pickAndUpload(): Promise<Attachment | null> {
    if (Platform.OS === 'web') {
      return pickAndUploadWeb()
    }
    return pickAndUploadNative()
  }

  async function pickAndUploadNative(): Promise<Attachment | null> {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) return null

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.8,
      allowsEditing: false,
    })

    if (result.canceled || !result.assets.length) return null

    const asset = result.assets[0]
    const filename = `${Date.now()}_${asset.fileName ?? 'upload'}`
    const storageRef = ref(storage, `attachments/${filename}`)

    const response = await fetch(asset.uri)
    const blob = await response.blob()

    await uploadBytes(storageRef, blob)
    const url = await getDownloadURL(storageRef)

    return {
      name: asset.fileName ?? filename,
      url,
      type: asset.mimeType ?? 'application/octet-stream',
    }
  }

  async function pickAndUploadWeb(): Promise<Attachment | null> {
    return new Promise((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'image/*,application/pdf'
      input.onchange = async () => {
        const file = input.files?.[0]
        if (!file) {
          resolve(null)
          return
        }
        try {
          const filename = `${Date.now()}_${file.name}`
          const storageRef = ref(storage, `attachments/${filename}`)
          await uploadBytes(storageRef, file)
          const url = await getDownloadURL(storageRef)
          resolve({ name: file.name, url, type: file.type })
        } catch {
          resolve(null)
        }
      }
      input.click()
    })
  }

  return { pickAndUpload }
}
