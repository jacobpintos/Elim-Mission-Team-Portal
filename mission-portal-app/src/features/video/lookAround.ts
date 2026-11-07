import { Platform } from 'react-native'
import { phoneNetwork, udpExchange } from '@/lib/localNetwork'
import { httpPeek } from '@/lib/httpPeek'
import { networkSaid } from '@/lib/netScan'
import { alsoFoundSaid, notFoundSaid } from '@/lib/foundSaid'
import { findSwitchers } from '@/lib/switcher/find'
import { findEncoders } from '@/lib/switcher/findEncoder'
import {
  saveMultiviewFeed,
  saveSwitcherAddress,
  type MultiviewFeed,
} from '@/lib/switcher/switcherAddress'

/**
 * Finding the video equipment on the phone's network, from Settings → Video
 * switcher or from Video before anything is set up: the ATEM
 * (lib/switcher/find) and the encoder serving its multiview
 * (lib/switcher/findEncoder). What's found is saved on this phone.
 */

const NO_WIFI = 'This phone isn’t on Wi-Fi. Join the switcher’s network first.'

/** Looks for the switcher, and saves the first that answers. `looking` is told where it's looking. */
export async function lookForSwitcher(
  looking: (said: string) => void
): Promise<{ host: string | null; said: string }> {
  const net = phoneNetwork()
  if (!net) return { host: null, said: NO_WIFI }
  looking(`Looking on ${networkSaid(net.address)}…`)
  const found = await findSwitchers(udpExchange, net)
  if (!found.length) {
    return { host: null, said: notFoundSaid('video switcher', net.address, Platform.OS === 'ios') }
  }
  const [first, ...more] = found
  await saveSwitcherAddress(first.host)
  return { host: first.host, said: `Found it at ${first.host}.${alsoFoundSaid(more)}` }
}

export type EncoderLook =
  /** One device gave a picture, now saved. */
  | { kind: 'saved'; feed: MultiviewFeed; said: string }
  /** Several did: which is the multiview is for the operator to say. */
  | { kind: 'choose'; feeds: { host: string; feed: MultiviewFeed }[]; said: string }
  | { kind: 'none'; said: string }

/** At most this many devices with a web page are named when none gave a picture. */
const PAGES_SAID = 6

/** Looks for the encoder, and saves its picture if only one device gives one. */
export async function lookForEncoder(looking: (said: string) => void): Promise<EncoderLook> {
  const net = phoneNetwork()
  if (!net) return { kind: 'none', said: NO_WIFI }
  looking(`Looking on ${networkSaid(net.address)}… This takes a few seconds.`)
  const { feeds, pages } = await findEncoders(httpPeek, net)
  if (feeds.length === 1) {
    const [{ host, feed }] = feeds
    await saveMultiviewFeed(feed)
    return { kind: 'saved', feed, said: `Found a picture at ${host}, and saved it.` }
  }
  if (feeds.length > 1) {
    return {
      kind: 'choose',
      feeds,
      said: `${feeds.length} devices here give a picture. Use the one showing the multiview.`,
    }
  }
  if (!pages.length) {
    return { kind: 'none', said: notFoundSaid('encoder', net.address, Platform.OS === 'ios') }
  }
  const named = pages.slice(0, PAGES_SAID).join(', ') + (pages.length > PAGES_SAID ? ', …' : '')
  return {
    kind: 'none',
    said:
      `No preview picture found on ${networkSaid(net.address)}. Devices with a web page there: ${named}. ` +
      'If one is the encoder, open its address in a browser: its settings give its preview picture’s ' +
      'address, to enter as the multiview preview address. It has to work without a password.',
  }
}
