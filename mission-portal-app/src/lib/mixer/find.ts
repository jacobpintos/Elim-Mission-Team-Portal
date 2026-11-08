import { addressesToScan, scanAddresses, type Exchange } from '@/lib/netScan'
import { decodeOsc, encodeOsc } from './osc'
import { X32_PORT } from './x32'
import { orgDesk, type DeskKind } from './deskModel'
import { WING_ASK, WING_FIND_PORT, wingFromAnswer } from './wing'

/** What answered /xinfo as a sound desk: its name and model, or null. */
export function deskFromAnswer(answer: Uint8Array | null): { name: string; model: string } | null {
  const m = answer ? decodeOsc(answer) : null
  if (!m || m.address !== '/xinfo') return null
  const [, name, model] = m.args.map((a) => (a.t === 's' ? a.v : ''))
  return { name: name ?? '', model: model ?? '' }
}

/**
 * Every desk of this kind on the phone's network: an X32 is asked "/xinfo" on
 * its port; a WING "WING?" on the port it answers that on (./wing).
 */
export function findDesks(
  exchange: Exchange,
  network: { address: string; prefix: number },
  kind: DeskKind = orgDesk()
): Promise<{ host: string; found: { name: string; model: string } }[]> {
  const hosts = addressesToScan(network.address, network.prefix)
  if (kind === 'wing') {
    return scanAddresses(hosts, async (host) =>
      wingFromAnswer(await exchange(host, WING_FIND_PORT, WING_ASK, 500))
    )
  }
  const ask = encodeOsc('/xinfo')
  return scanAddresses(hosts, async (host) =>
    deskFromAnswer(await exchange(host, X32_PORT, ask, 500))
  )
}
