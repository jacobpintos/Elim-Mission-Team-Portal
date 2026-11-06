import AsyncStorage from '@react-native-async-storage/async-storage'
import { liveSwaps, type Swap } from './swaps'

/**
 * Who is using whose pack or mic (./swaps), kept on this phone: there is no
 * internet at the desk to share it by. Each swap ends by itself after 12
 * hours, so only those still in force are kept.
 */

const KEY = 'mixer.swaps'

const isSwap = (v: unknown): v is Swap => {
  const s = v as Swap
  return (
    !!s &&
    (s.item === 'pack' || s.item === 'mic') &&
    typeof s.user === 'string' &&
    typeof s.owner === 'string' &&
    typeof s.at === 'number'
  )
}

export async function loadSwaps(now = Date.now()): Promise<Swap[]> {
  const raw = await AsyncStorage.getItem(KEY).catch(() => null)
  if (!raw) return []
  try {
    const all: unknown = JSON.parse(raw)
    return Array.isArray(all) ? liveSwaps(all.filter(isSwap), now) : []
  } catch {
    return []
  }
}

export async function saveSwaps(swaps: Swap[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(swaps)).catch(() => {})
}
