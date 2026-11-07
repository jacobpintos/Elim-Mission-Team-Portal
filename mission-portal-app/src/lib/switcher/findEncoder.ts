import { addressesToScan, scanAddresses, type Peek, type Peeked } from '@/lib/netScan'
import type { MultiviewFeed } from './switcherAddress'

/**
 * Looking for the video encoder that serves the ATEM's multiview (./multiview)
 * on the phone's network. Every address there is asked for a web page; each
 * device that answers is asked for a preview picture at the addresses
 * encoders and network cameras commonly serve one, and what comes back as a
 * picture is kept. Encoders don't agree on that address, so one serving its
 * picture somewhere else is still found as a device with a web page, for its
 * own settings to give the address.
 */

/** Where encoders and network cameras commonly serve a preview picture, asked in this order. */
export const PREVIEW_PATHS: readonly string[] = [
  // Still pictures, renewed as they're asked for.
  '/snapshot.jpg',
  '/snapshot.cgi',
  '/snapshot',
  '/cgi-bin/snapshot.cgi',
  '/image.jpg',
  '/jpg/image.jpg',
  '/axis-cgi/jpg/image.cgi',
  // Motion-JPEG streams.
  '/mjpeg',
  '/video.mjpg',
  '/mjpg/video.mjpg',
  '/stream.mjpg',
  '/video.cgi',
]

/** How long a device has to start answering, and a picture to finish arriving. */
const PAGE_MS = 1500
const PICTURE_MS = 2500
const BODY_MS = 2500

/** The feed an answer is, or null if it isn't a picture. */
export function feedOf(url: string, answer: Peeked | null): MultiviewFeed | null {
  if (!answer || answer.status !== 200) return null
  if (answer.type.startsWith('multipart/x-mixed-replace')) return { url, kind: 'mjpeg' }
  // A still picture ends. A motion-JPEG stream doesn't: iPhones hand it over
  // a picture at a time, each looking like a still one.
  if (answer.type.startsWith('image/')) return { url, kind: answer.ended ? 'still' : 'mjpeg' }
  return null
}

export interface EncoderSearch {
  /** A picture from each device that gave one: the first of its addresses that did. */
  feeds: { host: string; feed: MultiviewFeed }[]
  /** The devices with a web page but no picture at those addresses (the router, for one). */
  pages: string[]
}

/** Every device on the phone's network serving a preview picture, and the other devices with a web page. */
export async function findEncoders(
  peek: Peek,
  network: { address: string; prefix: number }
): Promise<EncoderSearch> {
  const web = await scanAddresses(addressesToScan(network.address, network.prefix), async (host) =>
    (await peek(`http://${host}/`, { timeoutMs: PAGE_MS, bodyMs: 0 })) ? true : null
  )
  const pictures = await Promise.all(
    web.map(async ({ host }) => {
      for (const path of PREVIEW_PATHS) {
        const url = `http://${host}${path}`
        const feed = feedOf(url, await peek(url, { timeoutMs: PICTURE_MS, bodyMs: BODY_MS }))
        if (feed) return feed
      }
      return null
    })
  )
  const out: EncoderSearch = { feeds: [], pages: [] }
  web.forEach(({ host }, i) => {
    const feed = pictures[i]
    if (feed) out.feeds.push({ host, feed })
    else out.pages.push(host)
  })
  return out
}
