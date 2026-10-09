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
