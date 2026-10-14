import { Platform } from 'react-native'

/**
 * Hand a text file to the person: a download on the web, the share sheet on a
 * phone (where "Save to Files" and mail both live). The same two paths
 * icsExport takes for a calendar file.
 */
export async function saveTextFile(filename: string, content: string, mimeType: string) {
  if (Platform.OS === 'web') {
    // A byte-order mark, so Excel reads the file as UTF-8 and names with
    // accents come through intact.
    const blob = new Blob(['﻿', content], { type: `${mimeType};charset=utf-8` })
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
    EncodingType: { UTF8: string }
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { shareAsync } = require('expo-sharing') as {
    shareAsync: (
      url: string,
      options?: { mimeType?: string; dialogTitle?: string }
    ) => Promise<void>
  }
  const path = `${FS.cacheDirectory ?? ''}${filename}`
  await FS.writeAsStringAsync(path, '﻿' + content, { encoding: FS.EncodingType.UTF8 })
  await shareAsync(path, { mimeType, dialogTitle: filename })
}
