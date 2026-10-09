import AsyncStorage from '@react-native-async-storage/async-storage'
import { splitSpokenKey } from '@/lib/songRequest'

/**
 * What this device has learned to hear as which song.
 *
 * When the song finder gets a name wrong and a song is picked from its
 * guesses instead, what was heard is remembered against that song — "oh
 * hill king jesus" against All Hail King Jesus — and the next time those
 * words are heard, with any key, that song opens (requestFromAliases).
 * The same voice in the same room tends to be misheard the same way.
 *
 * Kept on the device (AsyncStorage; the browser's storage on the web): it
 * is one person's voice it describes. The most recent 200, oldest dropped.
 * Only names — a few words — are learned, not lines of lyrics.
 */
const KEY = 'song_finder_aliases'
const MAX = 200
const MAX_WORDS = 8

let entries: [string, string][] | null = null

export async function loadAliases(): Promise<ReadonlyMap<string, string>> {
  if (!entries) {
    try {
      const raw = await AsyncStorage.getItem(KEY)
      const parsed = raw ? (JSON.parse(raw) as unknown) : []
      entries = Array.isArray(parsed)
        ? parsed.filter(
            (e): e is [string, string] =>
              Array.isArray(e) && typeof e[0] === 'string' && typeof e[1] === 'string'
          )
        : []
    } catch {
      entries = []
    }
  }
  return new Map(entries)
}

export function rememberAlias(heard: string, sheetId: string): void {
  const { name } = splitSpokenKey(heard)
  const count = name.split(' ').filter(Boolean).length
  if (count === 0 || count > MAX_WORDS) return
  const kept = (entries ?? []).filter(([n]) => n !== name)
  kept.push([name, sheetId])
  entries = kept.slice(-MAX)
  AsyncStorage.setItem(KEY, JSON.stringify(entries)).catch(() => {})
}
