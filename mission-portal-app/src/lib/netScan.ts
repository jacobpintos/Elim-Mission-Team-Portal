/**
 * Looking for the church's equipment (the X32 sound desk, the ATEM video
 * switcher) on the network the phone is on: every other address there is
 * asked, a batch at a time, and those that answer as the equipment would are
 * kept (lib/mixer/find, lib/switcher/find). At most the 254 addresses of the
 * phone's own x.x.x.0–255 range.
 */

/** Sends one datagram to an address and port, and gives back the first answer, or null. */
export type Exchange = (
  host: string,
  port: number,
  message: Uint8Array,
  timeoutMs: number
) => Promise<Uint8Array | null>

const parts = (ip: string): number[] | null => {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip.trim())
  if (!m) return null
  const p = m.slice(1).map(Number)
  return p.every((n) => n <= 255) ? p : null
}
const toInt = (p: number[]) => ((p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]) >>> 0
const toIp = (n: number) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.')

/** A network mask as a prefix length: "255.255.255.0" is 24. Null if it isn't a mask. */
export function prefixOfNetmask(mask: string): number | null {
  const p = parts(mask)
  if (!p) return null
  const bits = toInt(p).toString(2).padStart(32, '0')
  return /^1*0*$/.test(bits) ? (bits.indexOf('0') === -1 ? 32 : bits.indexOf('0')) : null
}

/** The other addresses on the phone's network, at most its own x.x.x.0–255 range. */
export function addressesToScan(address: string, prefix: number): string[] {
  const p = parts(address)
  if (!p || prefix > 30) return []
  const bits = Math.max(prefix, 24)
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
  const self = toInt(p)
  const network = (self & mask) >>> 0
  const broadcast = (network | (~mask >>> 0)) >>> 0
  const out: string[] = []
  for (let n = network + 1; n < broadcast; n++) if (n !== self) out.push(toIp(n))
  return out
}

/** Asks each address, `batch` at a time, keeping those that answer. */
export async function scanAddresses<T>(
  hosts: readonly string[],
  probe: (host: string) => Promise<T | null>,
  batch = 64
): Promise<{ host: string; found: T }[]> {
  const out: { host: string; found: T }[] = []
  for (let i = 0; i < hosts.length; i += batch) {
    const answers = await Promise.all(
      hosts
        .slice(i, i + batch)
        .map(async (host) => ({ host, found: await probe(host).catch(() => null) }))
    )
    for (const a of answers) if (a.found !== null) out.push(a as { host: string; found: T })
  }
  return out
}

/** The phone's network, said: "192.168.1.x". */
export const networkSaid = (address: string) => address.replace(/\.\d+$/, '.x')
