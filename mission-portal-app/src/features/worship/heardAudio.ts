import { File } from 'expo-file-system'
import { chromagram, parseWav, type Chroma } from '@/lib/keyDetect'

/** Less sound than this says too little about the key to guess it. */
const MIN_KEY_SECONDS = 4

/**
 * The notes in a recording SongListener kept while listening — or null, if
 * it is too short to tell or `wanted` is false — and the file deleted
 * either way.
 */
export async function readHeardAudio(uri: string, wanted: boolean): Promise<Chroma | null> {
  const file = new File(uri)
  try {
    if (!wanted) return null
    const wav = parseWav(await file.bytes())
    if (!wav || wav.samples.length < wav.sampleRate * MIN_KEY_SECONDS) return null
    return chromagram(wav.samples, wav.sampleRate)
  } catch {
    return null
  } finally {
    try {
      if (file.exists) file.delete()
    } catch {
      // Left in the cache, which the system clears.
    }
  }
}
