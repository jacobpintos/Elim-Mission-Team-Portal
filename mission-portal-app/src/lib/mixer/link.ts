import { requireOptionalNativeModule } from 'expo'
import { X32_PORT, type DeskLink } from './x32'
import { orgDesk, type DeskKind } from './deskModel'
import { WING_PORT, wingLink } from './wing'

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

/**
 * The way to the desk at this address, or null where the app can't reach one:
 * the organization's desk (src/custom: its equipment), an X32 or a WING,
 * each on its own port, and a WING's put into its own words (./wing).
 */
export function deskLinkTo(host: string, kind: DeskKind = orgDesk()): DeskLink | null {
  const n = native
  if (!n) return null
  const port = kind === 'wing' ? WING_PORT : X32_PORT
  const raw: DeskLink = {
    exchange: async (message, timeoutMs) => {
      const answer = await n.exchange(host, port, Array.from(message), timeoutMs).catch(() => null)
      return answer ? Uint8Array.from(answer) : null
    },
    send: (message) => n.send(host, port, Array.from(message)).catch(() => {}),
  }
  return kind === 'wing' ? wingLink(raw) : { ...raw, model: 'x32' }
}
