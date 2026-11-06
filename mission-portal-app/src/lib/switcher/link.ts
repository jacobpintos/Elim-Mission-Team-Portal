import { requireOptionalNativeModule } from 'expo'
import { ATEM_PORT, type UdpSession } from './atem'

/**
 * The phone's way to the video switcher: the app's own native module
 * (modules/desk-link), which holds a short UDP conversation on the local
 * network. On the web there is none (./link.web.ts): a browser can't talk to
 * the switcher. Null too in an app build made before the module had it.
 */

interface SessionModule {
  open(host: string, port: number): Promise<number | null>
  sendTo(id: number, message: number[]): Promise<boolean>
  receive(id: number, timeoutMs: number): Promise<number[] | null>
  close(id: number): void
}

const native = requireOptionalNativeModule<Partial<SessionModule>>('DeskLink')

/** Whether this build of the app can reach a switcher at all. */
export const canReachSwitcher = (): boolean =>
  !!native?.open && !!native.sendTo && !!native.receive && !!native.close

/** Opens a conversation with the switcher at this address, or null where the app can't. */
export function switcherAt(host: string): (() => Promise<UdpSession | null>) | null {
  if (!canReachSwitcher()) return null
  const n = native as SessionModule
  return async () => {
    const id = await n.open(host, ATEM_PORT).catch(() => null)
    if (id === null || id === undefined) return null
    return {
      send: (bytes) => n.sendTo(id, Array.from(bytes)).catch(() => false),
      receive: async (timeoutMs) => {
        const got = await n.receive(id, timeoutMs).catch(() => null)
        return got ? Uint8Array.from(got) : null
      },
      close: () => n.close(id),
    }
  }
}
