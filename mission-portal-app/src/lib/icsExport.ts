import { Platform } from 'react-native'
import { buildICS } from '@/lib/events'
import type { EventInstance } from '@/types/events'

export async function downloadICS(ev: EventInstance): Promise<void> {
  const content = buildICS(ev)
  const filename = `${(ev.title ?? 'event').replace(/[^a-zA-Z0-9_\- ]/g, '_')}_${(ev.date ?? '').replace(/-/g, '')}.ics`

  if (Platform.OS === 'web') {
    const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' })
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
  } else {
    // Native: write to cache directory using expo-file-system/legacy and share
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const FS = require('expo-file-system/legacy') as {
      cacheDirectory: string | null
      writeAsStringAsync: (
        uri: string,
        contents: string,
        options?: { encoding?: string }
      ) => Promise<void>
      EncodingType: { UTF8: string; Base64: string }
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { shareAsync } = require('expo-sharing') as {
      shareAsync: (
        url: string,
        options?: { mimeType?: string; dialogTitle?: string }
      ) => Promise<void>
    }
    const path = `${FS.cacheDirectory ?? ''}${filename}`
    await FS.writeAsStringAsync(path, content, { encoding: FS.EncodingType.UTF8 })
    await shareAsync(path, { mimeType: 'text/calendar', dialogTitle: 'Add to Calendar' })
  }
}
