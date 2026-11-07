import { networkSaid } from './netScan'

/**
 * What a search of the network found, said (Settings → Sound desk and Video
 * switcher, and Video).
 */

/** Nothing answered. */
export function notFoundSaid(what: string, phone: string, ios: boolean): string {
  const asked = ios ? ' If it asked about local network access, allow it and try again.' : ''
  return `No ${what} answered on ${networkSaid(phone)}. Is this phone on its network?${asked}`
}

/** Others that answered too: said, so the right one can be typed in. */
export const alsoFoundSaid = (more: { host: string }[]) =>
  more.length ? ` (Also answered: ${more.map((m) => m.host).join(', ')}.)` : ''
