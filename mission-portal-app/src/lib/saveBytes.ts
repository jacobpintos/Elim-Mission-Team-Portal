import { Platform } from 'react-native'
import { base64 } from '@/lib/zip'

/**
 * Hand a file that isn't text to the person — a slide deck — as saveTextFile
 * does text: a download on the web, the share sheet on a phone, where "Save
 * to Files", Google Drive, PowerPoint and Google Slides all are.
 *
 * `uti`: what iOS calls the file's type, so the apps that open it are offered.
 */
export async function saveBytes(
  filename: string,
  bytes: Uint8Array,
  mimeType: string,
  uti?: string
) {
  if (Platform.OS === 'web') {
    const blob = new Blob([bytes as BlobPart], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    setTimeout(() => {
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }, 500)
    return
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const FS = require('expo-file-system/legacy') as {
    cacheDirectory: string | null
    writeAsStringAsync: (
      uri: string,
      contents: string,
      options?: { encoding?: string }
    ) => Promise<void>
    EncodingType: { Base64: string }
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { shareAsync } = require('expo-sharing') as {
    shareAsync: (
      url: string,
      options?: { mimeType?: string; dialogTitle?: string; UTI?: string }
    ) => Promise<void>
  }
  const path = `${FS.cacheDirectory ?? ''}${filename}`
  await FS.writeAsStringAsync(path, base64(bytes), { encoding: FS.EncodingType.Base64 })
  await shareAsync(path, { mimeType, dialogTitle: filename, UTI: uti })
}
