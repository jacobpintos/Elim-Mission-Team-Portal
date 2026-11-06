/**
 * OSC messages, the way the X32 sound desk takes them over the network
 * (./x32): an address, then the type of each value and the values, each
 * part padded to a multiple of four bytes, numbers big-endian.
 *
 * A message with no values asks the desk for one ("/ch/01/mix/fader"), and
 * the desk answers with the same address and its value.
 */

export type OscArg = { t: 'f'; v: number } | { t: 'i'; v: number } | { t: 's'; v: string }

export interface OscMessage {
  address: string
  args: OscArg[]
}

const pad4 = (n: number) => (n + 3) & ~3

/** A string as OSC has it: its bytes, at least one zero after them, padded to four. */
function oscString(s: string): Uint8Array {
  const bytes = new TextEncoder().encode(s)
  const out = new Uint8Array(pad4(bytes.length + 1))
  out.set(bytes)
  return out
}

/** An address and its values (none: a question), as bytes to send. */
export function encodeOsc(address: string, args: readonly OscArg[] = []): Uint8Array {
  const parts: Uint8Array[] = [oscString(address)]
  // Asked with no values, the X32 wants the address alone, without a type list.
  if (args.length) parts.push(oscString(`,${args.map((a) => a.t).join('')}`))
  for (const a of args) {
    if (a.t === 's') {
      parts.push(oscString(a.v))
      continue
    }
    const b = new Uint8Array(4)
    const view = new DataView(b.buffer)
    if (a.t === 'f') view.setFloat32(0, a.v, false)
    else view.setInt32(0, a.v, false)
    parts.push(b)
  }
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

/** A message received, or null when it isn't one this understands. */
export function decodeOsc(bytes: Uint8Array): OscMessage | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let at = 0
  const readString = (): string | null => {
    const end = bytes.indexOf(0, at)
    if (end < 0) return null
    const s = new TextDecoder().decode(bytes.subarray(at, end))
    at = pad4(end + 1)
    return s
  }
  const address = readString()
  if (!address || !address.startsWith('/')) return null
  if (at >= bytes.length) return { address, args: [] }
  const types = readString()
  if (types === null || !types.startsWith(',')) return null
  const args: OscArg[] = []
  for (const t of types.slice(1)) {
    if (t === 's') {
      const v = readString()
      if (v === null) return null
      args.push({ t: 's', v })
    } else if (t === 'f' || t === 'i') {
      if (at + 4 > bytes.length) return null
      args.push(
        t === 'f'
          ? { t: 'f', v: view.getFloat32(at, false) }
          : { t: 'i', v: view.getInt32(at, false) }
      )
      at += 4
    } else if (t === 'b') {
      // A blob (the desk's meters): skipped.
      if (at + 4 > bytes.length) return null
      at = pad4(at + 4 + view.getInt32(at, false))
    } else {
      return null
    }
  }
  return { address, args }
}
