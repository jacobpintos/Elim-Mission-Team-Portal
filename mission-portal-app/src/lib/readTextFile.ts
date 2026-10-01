import { Platform } from 'react-native'
import { pdfToChartText } from '@/lib/pdfChart'

/**
 * Let somebody choose a chart file and hand back its text.
 *
 * Used by the chord sheet import. A ChordPro or text file is read as it is; a
 * PDF is read through pdf.js and comes back as chords written over lyrics. The picker is asked for any file rather
 * than for text, for the reason the audio picker is: on the web that becomes
 * <input accept>, and iOS greys out any file it cannot map to the type it was
 * asked for — a ChordPro file (.cho, .pro) is not something iOS knows is
 * text, so asking for text would grey out the very file being looked for.
 * What comes back is checked here instead.
 *
 * Null if nothing was chosen.
 */
export async function pickTextFile(): Promise<{
  name: string
  text: string
  /** Read out of a PDF — worth a closer look at where the chords landed. */
  fromPdf: boolean
} | null> {
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

  // Read as bytes first: a PDF has to reach pdf.js as it is, not decoded as
  // text, and the first bytes are how a PDF is told from anything else
  // whatever it is called.
  let bytes: ArrayBuffer
  if (Platform.OS === 'web') {
    bytes = await (await fetch(asset.uri)).arrayBuffer()
  } else {
    const { File } = await import('expo-file-system')
    bytes = (await new File(asset.uri).bytes()).buffer as ArrayBuffer
  }
  const head = new TextDecoder().decode(bytes.slice(0, 5))
  if (head === '%PDF-' || /\.pdf$/i.test(name)) {
    return { name, text: await pdfToChartText(bytes), fromPdf: true }
  }
  const text = new TextDecoder().decode(bytes)
  // A word processor document, an image — anything with bytes text does not have.
  if (text.includes('\u0000')) {
    throw new Error(`${name} isn't a text file. Try a ChordPro (.cho, .pro) or .txt file.`)
  }
  return { name, text, fromPdf: false }
}
