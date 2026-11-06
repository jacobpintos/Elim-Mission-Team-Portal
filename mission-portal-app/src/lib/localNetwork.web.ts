import type { Exchange } from './netScan'

/** A browser can't look around the local network (./localNetwork.ts). */
export const canLookAround = (): boolean => false

export function phoneNetwork(): { address: string; prefix: number } | null {
  return null
}

export const udpExchange: Exchange = async () => null
