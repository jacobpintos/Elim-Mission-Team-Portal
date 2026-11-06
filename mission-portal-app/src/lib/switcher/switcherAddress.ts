import AsyncStorage from '@react-native-async-storage/async-storage'

/**
 * Where the video switcher is on its network: the ATEM's IP address (ATEM
 * Setup, or the switcher's own menu). Kept on this phone, set in
 * Settings → Video switcher.
 */

const KEY = 'switcher.address'

let cached: string | null | undefined

/** The address saved on this phone, or '' if none is. */
export async function loadSwitcherAddress(): Promise<string> {
  if (cached === undefined) cached = await AsyncStorage.getItem(KEY).catch(() => null)
  return cached ?? ''
}

export async function saveSwitcherAddress(address: string): Promise<void> {
  cached = address
  await (address ? AsyncStorage.setItem(KEY, address) : AsyncStorage.removeItem(KEY)).catch(
    () => {}
  )
}
