import { ORG } from '@/custom'

/**
 * The sound desks the app works: the Behringer X32 (./x32) and the Behringer
 * WING (./wing). What differs between them that the app's own logic needs:
 * how many of each strip there are, and how long a name can be. How each is
 * spoken to is in its own module.
 */

export type DeskKind = 'x32' | 'wing'

export interface DeskModel {
  kind: DeskKind
  /** As people say it: "X32", "WING". */
  said: string
  /** Input channels, and the aux inputs after them. */
  channels: number
  aux: number
  /** Mix buses (the in-ear mixes), mains (none on an X32: its main is left/right), matrices. */
  buses: number
  mains: number
  matrices: number
  /** The longest name a strip shows. */
  nameMax: number
}

export const DESKS: Record<DeskKind, DeskModel> = {
  x32: {
    kind: 'x32',
    said: 'X32',
    channels: 32,
    aux: 8,
    buses: 16,
    mains: 0,
    matrices: 6,
    nameMax: 12,
  },
  wing: {
    kind: 'wing',
    said: 'WING',
    channels: 40,
    aux: 8,
    buses: 16,
    mains: 4,
    matrices: 8,
    nameMax: 16,
  },
}

/** The desk a link is to (the X32 when it doesn't say). */
export const modelOf = (link: { model?: DeskKind }): DeskModel => DESKS[link.model ?? 'x32']

/** The desk this organization has (src/custom: its equipment). */
export const orgDesk = (): DeskKind => ORG.equipment.soundDesk ?? 'x32'
