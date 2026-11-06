import { requireOptionalNativeModule } from 'expo'
import { X32_PORT, type DeskLink } from './x32'

/**
 * The phone's way to the sound desk: the app's own native module
 * (modules/desk-link), which sends UDP on the desk's Wi-Fi. On the web there
 * is none (./link.web.ts): a browser can't talk to the desk. Null too in an
 * app build made before the module was added.
 */

interface DeskLinkModule {
  isAvailable(): boolean
  exchange(
    host: string,
    port: number,
    message: number[],
    timeoutMs: number
  ): Promise<number[] | null>
  send(host: string, port: number, message: number[]): Promise<void>
}

const native = requireOptionalNativeModule<DeskLinkModule>('DeskLink')

/** Whether this build of the app can reach a desk at all. */
export const canReachDesk = (): boolean => !!native?.isAvailable()

/** The way to the desk at this address, or null where the app can't reach one. */
export function deskLinkTo(host: string): DeskLink | null {
  const n = native
  if (!n) return null
  return {
    exchange: async (message, timeoutMs) => {
      const answer = await n
        .exchange(host, X32_PORT, Array.from(message), timeoutMs)
        .catch(() => null)
      return answer ? Uint8Array.from(answer) : null
    },
    send: (message) => n.send(host, X32_PORT, Array.from(message)).catch(() => {}),
  }
}
