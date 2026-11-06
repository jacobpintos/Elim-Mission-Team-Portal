import { requireOptionalNativeModule } from 'expo'
import { prefixOfNetmask, type Exchange } from './netScan'

/**
 * The phone's own place on its Wi-Fi network, and a way to ask any address on
 * it something: the app's native module (modules/desk-link). None on the web
 * (./localNetwork.web.ts), nor in an app build made before the module had it.
 */

interface NetModule {
  localNetwork?: () => { address?: string; netmask?: string; prefix?: string } | null
  exchange?: (
    host: string,
    port: number,
    message: number[],
    timeoutMs: number
  ) => Promise<number[] | null>
}

const native = requireOptionalNativeModule<NetModule>('DeskLink')

/** Whether this build of the app can look for equipment on the network. */
export const canLookAround = (): boolean => !!native?.localNetwork && !!native.exchange

/** The phone's address on Wi-Fi and the network's prefix length, or null when it isn't on Wi-Fi. */
export function phoneNetwork(): { address: string; prefix: number } | null {
  const n = native?.localNetwork?.()
  if (!n?.address) return null
  const prefix = n.prefix ? Number(n.prefix) : n.netmask ? prefixOfNetmask(n.netmask) : null
  return prefix === null || Number.isNaN(prefix) ? null : { address: n.address, prefix }
}

export const udpExchange: Exchange = async (host, port, message, timeoutMs) => {
  const answer = await native
    ?.exchange?.(host, port, Array.from(message), timeoutMs)
    .catch(() => null)
  return answer ? Uint8Array.from(answer) : null
}
