import type { UdpSession } from './atem'

/** A browser can't send UDP, so the website can't reach the switcher (./link.ts). */
export const canReachSwitcher = (): boolean => false

export function switcherAt(_host: string): (() => Promise<UdpSession | null>) | null {
  return null
}
