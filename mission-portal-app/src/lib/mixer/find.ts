import { addressesToScan, scanAddresses, type Exchange } from '@/lib/netScan'
import { decodeOsc, encodeOsc } from './osc'
import { X32_PORT } from './x32'

/** What answered /xinfo as a sound desk: its name and model, or null. */
export function deskFromAnswer(answer: Uint8Array | null): { name: string; model: string } | null {
  const m = answer ? decodeOsc(answer) : null
  if (!m || m.address !== '/xinfo') return null
  const [, name, model] = m.args.map((a) => (a.t === 's' ? a.v : ''))
  return { name: name ?? '', model: model ?? '' }
}

/** Every X32 on the phone's network: each address asked "/xinfo" on the desk's port. */
export function findDesks(
  exchange: Exchange,
  network: { address: string; prefix: number }
): Promise<{ host: string; found: { name: string; model: string } }[]> {
  const ask = encodeOsc('/xinfo')
  return scanAddresses(addressesToScan(network.address, network.prefix), async (host) =>
    deskFromAnswer(await exchange(host, X32_PORT, ask, 500))
  )
}
