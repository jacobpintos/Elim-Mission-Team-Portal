import { Platform } from 'react-native'

/**
 * Let somebody choose a text file and hand back what is in it.
 *
 * Used by the chord sheet import. The picker is asked for any file rather
 * than for text, for the reason the audio picker is: on the web that becomes
 * <input accept>, and iOS greys out any file it cannot map to the type it was
 * asked for — a ChordPro file (.cho, .pro) is not something iOS knows is
 * text, so asking for text would grey out the very file being looked for.
 * What comes back is checked here instead.
 *
 * Null if nothing was chosen.
 */
export async function pickTextFile(): Promise<{ name: string; text: string } | null> {
  const DocumentPicker = await import('expo-document-picker')
  const result = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    copyToCacheDirectory: true,
    multiple: false,
  })
  if (result.canceled) return null
  const asset = result.assets?.[0]
  if (!asset?.uri) return null
  const name = asset.name ?? 'chart'

  let text: string
  if (Platform.OS === 'web') {
    text = await (await fetch(asset.uri)).text()
  } else {
    const { File } = await import('expo-file-system')
    text = await new File(asset.uri).text()
  }

  if (/\.pdf$/i.test(name) || text.startsWith('%PDF')) {
    throw new Error(
      "That's a PDF, and reading PDFs isn't built yet. Open it, copy the chart's text and paste it here — or download the song as ChordPro if the site offers it."
    )
  }
  // A word processor document, an image — anything with bytes text does not have.
  if (text.includes('\u0000')) {
    throw new Error(`${name} isn't a text file. Try a ChordPro (.cho, .pro) or .txt file.`)
  }
  return { name, text }
}
