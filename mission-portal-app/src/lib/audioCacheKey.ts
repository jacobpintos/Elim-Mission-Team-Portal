/**
 * Naming the local copy of a track.
 *
 * Apart from audioCache.ts so it can be tested: that module reaches for
 * react-native and expo-file-system, and none of this needs either.
 */

/**
 * The part of a download URL that identifies the file.
 *
 * Firebase hands out a token in the query string and reissues it, so the
 * query is exactly the part that must not be keyed on — the same track would
 * miss the cache every time its token changed.
 */
export function stableAudioUrl(url: string): string {
  const cut = url.search(/[?#]/)
  return cut === -1 ? url : url.slice(0, cut)
}

/** A dull, stable filename for a URL: hash first, then something readable. */
export function cacheKeyFor(url: string): string {
  const stable = stableAudioUrl(url)

  // djb2: short, stable across runs, and collisions do not matter much here —
  // the worst case is one track playing where another was expected, and the
  // readable half makes that visible rather than mysterious.
  let hash = 5381
  for (let i = 0; i < stable.length; i++) hash = ((hash << 5) + hash + stable.charCodeAt(i)) >>> 0

  const tail = decodeURIComponent(stable.split('/').pop() ?? 'track')
  const safe = tail.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-48) || 'track'
  return `${hash.toString(36)}_${safe}`
}
