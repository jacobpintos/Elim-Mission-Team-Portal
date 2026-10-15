import AsyncStorage from '@react-native-async-storage/async-storage'

/**
 * Names this device has taught Miriam: what was said for an event, and the
 * event it turned out to mean — learned when one of the events she offered
 * is picked. Sent with each request, so the next "revival in the hard land"
 * is Revival in the Heartland straight away. Kept on the device, newest
 * first, as the song finder keeps its corrections (lib/songAliases).
 */
const KEY = 'miriam_names'
const KEEP = 30

export interface LearnedName {
  heard: string
  title: string
}

export async function loadNames(): Promise<LearnedName[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY)
    const list = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(list)
      ? list.filter(
          (n): n is LearnedName => !!n && typeof n.heard === 'string' && typeof n.title === 'string'
        )
      : []
  } catch {
    return []
  }
}

/** Remember that `heard` meant `title`; the newest of a phrase wins. */
export async function rememberName(heard: string, title: string): Promise<void> {
  const said = heard.trim().toLowerCase()
  if (!said || !title.trim()) return
  const kept = (await loadNames()).filter((n) => n.heard !== said)
  try {
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify([{ heard: said, title }, ...kept].slice(0, KEEP))
    )
  } catch {
    // Not remembered this time; nothing else depends on it.
  }
}

/**
 * Words this device's speech recognition has misheard, and what was meant —
 * "even" for "event", "Mariam" for "Miriam" — as Claude worked out from the
 * rest of a request. Sent with each request, so the same mishearing is
 * read right at once next time.
 */
const WORDS_KEY = 'miriam_words'
const WORDS_KEEP = 40

export interface MisheardWord {
  heard: string
  meant: string
}

export async function loadWords(): Promise<MisheardWord[]> {
  try {
    const raw = await AsyncStorage.getItem(WORDS_KEY)
    const list = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(list)
      ? list.filter(
          (w): w is MisheardWord =>
            !!w && typeof w.heard === 'string' && typeof w.meant === 'string'
        )
      : []
  } catch {
    return []
  }
}

/** Remember mishearings; the newest of a word wins. */
export async function rememberWords(words: MisheardWord[]): Promise<void> {
  const fresh = words
    .map((w) => ({ heard: w.heard.trim().toLowerCase(), meant: w.meant.trim() }))
    .filter((w) => w.heard && w.meant && w.heard !== w.meant.toLowerCase())
    .slice(0, 5)
  if (fresh.length === 0) return
  const kept = (await loadWords()).filter((w) => !fresh.some((f) => f.heard === w.heard))
  try {
    await AsyncStorage.setItem(WORDS_KEY, JSON.stringify([...fresh, ...kept].slice(0, WORDS_KEEP)))
  } catch {
    // Not remembered this time.
  }
}

/**
 * Videos this device has taught Miriam: a way of asking for one ("the Flip
 * The Narrative podcast with Scott Reece") and the one it meant — learned
 * when Claude found it for her, or it was picked from those she offered. The
 * next time it is asked for the same way, she plays it herself.
 */
const PLAYS_KEY = 'miriam_plays'

export interface LearnedPlay {
  /** lib/miriamQuick: playKey. */
  key: string
  id: string
}

export async function loadPlays(): Promise<LearnedPlay[]> {
  try {
    const raw = await AsyncStorage.getItem(PLAYS_KEY)
    const list = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(list)
      ? list.filter(
          (p): p is LearnedPlay => !!p && typeof p.key === 'string' && typeof p.id === 'string'
        )
      : []
  } catch {
    return []
  }
}

/** Remember that asking `key` meant the video `id`; the newest of a way of asking wins. */
export async function rememberPlay(key: string, id: string): Promise<void> {
  if (!key.replace('|', '').trim() || !id) return
  const kept = (await loadPlays()).filter((p) => p.key !== key)
  try {
    await AsyncStorage.setItem(PLAYS_KEY, JSON.stringify([{ key, id }, ...kept].slice(0, KEEP)))
  } catch {
    // Not remembered this time; asking again still works.
  }
}
