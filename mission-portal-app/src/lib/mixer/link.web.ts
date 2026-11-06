import type { DeskLink } from './x32'

/** A browser can't send UDP, so the website can't reach the desk (./link.ts). */
export const canReachDesk = (): boolean => false

export function deskLinkTo(_host: string): DeskLink | null {
  return null
}
