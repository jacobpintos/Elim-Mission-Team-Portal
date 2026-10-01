import { Directory, File, Paths } from 'expo-file-system'

/**
 * The native app's copy on the device of what it was last sent, so it opens
 * and reads with no signal. liveFirestore.ts decides what goes in it; this
 * only keeps it.
 *
 * The web app has this from Firestore itself (its cache is kept in IndexedDB —
 * see firebase.ts), so offlineCache.web.ts does nothing but forget it.
 *
 * One file per key, in the documents directory — which, unlike the cache
 * directory, the system does not clear to make space. Files rather than
 * AsyncStorage: a busy chat or the whole user list can outgrow what Android's
 * AsyncStorage will hold.
 *
 * Everything fails soft: a copy that cannot be written or read is the app as
 * it was before this existed, so nothing in here is worth showing anybody.
 */

const dir = () => new Directory(Paths.document, 'offline-data')

/** FNV-1a, twice over, for a file name: keys are paths and spelled-out queries. */
function fileName(key: string): string {
  let a = 0x811c9dc5
  let b = 0x01000193 ^ key.length
  for (let i = 0; i < key.length; i++) {
    const c = key.charCodeAt(i)
    a = Math.imul(a ^ c, 0x01000193) >>> 0
    b = Math.imul(b ^ c, 0x01000193 + 2) >>> 0
  }
  return `${a.toString(16).padStart(8, '0')}${b.toString(16).padStart(8, '0')}.json`
}

const file = (key: string) => new File(dir(), fileName(key))

export async function loadOffline<T>(key: string): Promise<T | null> {
  try {
    const f = file(key)
    if (!f.exists) return null
    const kept = JSON.parse(await f.text()) as { key: string; value: T }
    // Two keys with one file name: not this one's.
    return kept.key === key ? kept.value : null
  } catch {
    return null
  }
}

// A listener can be sent a new answer several times a second; only the last
// of a burst is written.
const waiting = new Map<string, unknown>()
let timer: ReturnType<typeof setTimeout> | null = null

function flush() {
  timer = null
  const batch = [...waiting]
  waiting.clear()
  try {
    const d = dir()
    if (!d.exists) d.create({ intermediates: true, idempotent: true })
    for (const [key, value] of batch) {
      try {
        const f = file(key)
        if (!f.exists) f.create()
        f.write(JSON.stringify({ key, value }))
      } catch {
        // This one is not kept.
      }
    }
  } catch {
    // Nothing kept this time.
  }
}

export function saveOffline(key: string, value: unknown): void {
  waiting.set(key, value)
  timer ??= setTimeout(flush, 1000)
}

/** On signing out: the next person to sign in on this phone sees none of it. */
export async function forgetOfflineData(): Promise<void> {
  waiting.clear()
  if (timer) clearTimeout(timer)
  timer = null
  try {
    const d = dir()
    if (d.exists) d.delete()
  } catch {
    // Nothing more to do.
  }
}
