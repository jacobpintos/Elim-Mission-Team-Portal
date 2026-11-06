import { addressesToScan, scanAddresses, type Exchange } from '@/lib/netScan'
import { ATEM_PORT, HELLO, readPacket } from './atem'

/** Whether an answer to the ATEM's hello is a switcher starting a session. */
export function isAtemHello(answer: Uint8Array | null): boolean {
  const p = answer ? readPacket(answer) : null
  return !!p && (p.flags & 0x02) !== 0
}

/**
 * Every ATEM on the phone's network: each address sent the hello on the
 * switcher's port. One that answers is left without an acknowledgement, and
 * drops the half-started session by itself, as it does any client that stops.
 */
export function findSwitchers(
  exchange: Exchange,
  network: { address: string; prefix: number }
): Promise<{ host: string; found: true }[]> {
  return scanAddresses(addressesToScan(network.address, network.prefix), async (host) =>
    isAtemHello(await exchange(host, ATEM_PORT, HELLO, 500)) ? true : null
  )
}
