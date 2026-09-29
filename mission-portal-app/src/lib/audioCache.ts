import { Platform } from 'react-native'
import { stableAudioUrl, cacheKeyFor } from '@/lib/audioCacheKey'

/**
 * Keep a reference track on the device after the first listen.
 *
 * A set list is used where the signal is worst — a church basement, a bus, a
 * trip abroad — and a fourteen megabyte track re-downloads on every play
 * otherwise. It is also the same file every time: the upload path carries a
 * timestamp, so a given URL never points at different audio.
 *
 * Everything here fails soft. A cache that cannot be written is a track that
 * streams, which is what happened before this existed, so no failure in here
 * is worth showing anybody.
 */

const CACHE_NAME = 'setlist-audio-v1'

/**
 * The local copy of a track, if there is one.
 *
 * Returns null rather than fetching: the caller plays the remote URL while
 * cacheAudio() fills the cache behind it, so the first listen is never delayed
 * by the copy being made.
 */
export async function cachedAudioUri(url: string): Promise<string | null> {
  if (!url) return null
  try {
    if (Platform.OS === 'web') {
      if (typeof caches === 'undefined') return null
      const cache = await caches.open(CACHE_NAME)
      const hit = await cache.match(stableAudioUrl(url))
      if (!hit) return null
      return URL.createObjectURL(await hit.blob())
    }

    const { File, Directory, Paths } = await import('expo-file-system')
    const dir = new Directory(Paths.cache, 'setlist-audio')
    const file = new File(dir, cacheKeyFor(url))
    return file.exists ? file.uri : null
  } catch {
    // No cache is the old behaviour, not a problem to report.
    return null
  }
}

/**
 * Put a track in the cache for next time, if it is not there already.
 *
 * On the web this needs the bucket to allow cross-origin reads: the Cache API
 * cannot store a response it is not allowed to look at. Where it is not
 * allowed, this quietly does nothing and every play streams, exactly as it did
 * before.
 */
export async function cacheAudio(url: string): Promise<void> {
  if (!url) return
  try {
    if (Platform.OS === 'web') {
      if (typeof caches === 'undefined') return
      const cache = await caches.open(CACHE_NAME)
      const key = stableAudioUrl(url)
      if (await cache.match(key)) return
      const response = await fetch(url)
      if (!response.ok) return
      // Stored under the token-free URL so a reissued token still hits.
      await cache.put(key, response)
      return
    }

    const { File, Directory, Paths } = await import('expo-file-system')
    const dir = new Directory(Paths.cache, 'setlist-audio')
    if (!dir.exists) dir.create({ intermediates: true })
    const file = new File(dir, cacheKeyFor(url))
    if (file.exists) return
    await File.downloadFileAsync(url, file)
  } catch {
    // Out of space, offline, or a bucket that does not allow this. Streaming
    // still works, which is the point of doing this in the background.
  }
}
