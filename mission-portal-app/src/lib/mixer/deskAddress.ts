import AsyncStorage from '@react-native-async-storage/async-storage'

/**
 * Where the sound desk is on its Wi-Fi: its IP address, as the X32 shows it
 * (Setup → Network). Kept on this phone, set in Settings → Sound desk.
 */

const KEY = 'mixer.deskAddress'

let cached: string | null | undefined

/** An IPv4 address as typed, tidied, or null if it isn't one. */
export function deskAddressOf(typed: string): string | null {
  const m = /^\s*(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\s*$/.exec(typed)
  if (!m) return null
  const parts = m.slice(1).map(Number)
  return parts.every((p) => p <= 255) ? parts.join('.') : null
}

/** The address saved on this phone, or '' if none is. */
export async function loadDeskAddress(): Promise<string> {
  if (cached === undefined) cached = await AsyncStorage.getItem(KEY).catch(() => null)
  return cached ?? ''
}

/** The address as last loaded, without waiting: '' before it's loaded, or with none. */
export const deskAddressNow = (): string => cached ?? ''

export async function saveDeskAddress(address: string): Promise<void> {
  cached = address
  await (address ? AsyncStorage.setItem(KEY, address) : AsyncStorage.removeItem(KEY)).catch(
    () => {}
  )
}
