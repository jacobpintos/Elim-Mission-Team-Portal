/**
 * A meaning (./encoder's 384 numbers) kept small: as 8-bit numbers with one
 * scale, in base64 — 520 characters instead of 1,536 bytes, and within a
 * hair of the original. How her examples' meanings are stored, both those
 * worked out ahead of time and those she learns (./learn).
 */
export function packVector(v: ArrayLike<number>): string {
  let max = 0
  for (let i = 0; i < v.length; i++) max = Math.max(max, Math.abs(v[i]))
  const scale = max / 127 || 1
  const bytes = Buffer.alloc(4 + v.length)
  bytes.writeFloatLE(scale, 0)
  for (let i = 0; i < v.length; i++) bytes.writeInt8(Math.round(v[i] / scale), 4 + i)
  return bytes.toString('base64')
}

export function unpackVector(packed: string): Float32Array | null {
  const bytes = Buffer.from(packed, 'base64')
  if (bytes.length < 5) return null
  const scale = bytes.readFloatLE(0)
  const v = new Float32Array(bytes.length - 4)
  for (let i = 0; i < v.length; i++) v[i] = bytes.readInt8(4 + i) * scale
  return v
}
