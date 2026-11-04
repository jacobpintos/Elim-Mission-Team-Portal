import { ELIM_VAN_ID } from './elimVan'

/**
 * Custom: The Well. A vehicle the team can bring to an event, as an admin
 * keeps it (Admin → Vehicles): whose it is doesn't matter, only who may drive
 * it — its owner needn't be going for it to go, if one of its drivers is.
 */

/** What it can pull: nothing, the small trailer only, or the small and the big. */
export type TrailerAbility = 'none' | 'small' | 'both'

export interface Vehicle {
  id: string
  name: string
  /** The most it holds, the driver counted. */
  seats: number
  /** Who may drive it, by uid. */
  drivers: string[]
  trailer: TrailerAbility
  /**
   * Anyone who may drive another of the vehicles may drive this one too
   * (the Elim Van): its own drivers, and all of theirs.
   */
  anyDriver?: boolean
  /** Asked about each time a carpool is planned: "Bring the Elim Van?" */
  ask?: boolean
  /**
   * Men and women may ride in it together (the Elim Van): it is filled with
   * whoever the other vehicles can't keep apart, and nobody in it counts as
   * mixed. Others are men's or women's, by their driver.
   */
  mixedSex?: boolean
  /**
   * Filled before the others when it goes (the Elim Van), so fewer cars are
   * needed — full is what it should be, and no reason to bring another.
   */
  fillFirst?: boolean
  /**
   * Chosen first to pull a trailer it can pull, when one is needed — after
   * keeping men and women apart and bringing as few vehicles as possible.
   */
  preferTrailer?: boolean
  /** Anything else to know: "Needs gas card", "Tow hitch is 2 inch". */
  notes?: string
}

export const TRAILER_LABELS: Record<TrailerAbility, string> = {
  none: 'No trailer',
  small: 'Small trailer only',
  both: 'Small or big trailer',
}

/** Which trailers an event needs. */
export interface TrailersNeeded {
  small: boolean
  big: boolean
}

/** Whether a vehicle can pull a trailer of this size. */
export const canPull = (v: Pick<Vehicle, 'trailer'>, size: 'small' | 'big') =>
  size === 'big' ? v.trailer === 'both' : v.trailer === 'small' || v.trailer === 'both'

/** A vehicle as kept, from whatever was read: anything missing set to what it means when absent. */
export function vehicleFrom(id: string, data: Record<string, unknown> | undefined): Vehicle {
  const d = data ?? {}
  const seats = Math.round(Number(d.seats))
  const trailer = d.trailer === 'small' || d.trailer === 'both' ? d.trailer : 'none'
  return {
    id,
    name: typeof d.name === 'string' && d.name.trim() ? d.name.trim() : 'Unnamed vehicle',
    seats: Number.isFinite(seats) && seats > 0 ? Math.min(seats, 60) : 5,
    drivers: Array.isArray(d.drivers) ? [...new Set(d.drivers.map(String))].filter(Boolean) : [],
    trailer,
    ...(d.anyDriver === true ? { anyDriver: true } : {}),
    ...(d.ask === true ? { ask: true } : {}),
    // The Elim Van kept before these were asked: men and women together, and filled first.
    ...(d.mixedSex === true || (d.mixedSex === undefined && id === ELIM_VAN_ID)
      ? { mixedSex: true }
      : {}),
    ...(d.fillFirst === true || (d.fillFirst === undefined && id === ELIM_VAN_ID)
      ? { fillFirst: true }
      : {}),
    ...(d.preferTrailer === true && trailer !== 'none' ? { preferTrailer: true } : {}),
    ...(typeof d.notes === 'string' && d.notes.trim() ? { notes: d.notes.trim() } : {}),
  }
}

/** A vehicle as it is written: only what it has. */
export function vehicleData(v: Vehicle): Record<string, unknown> {
  return {
    name: v.name.trim(),
    seats: v.seats,
    drivers: v.drivers,
    trailer: v.trailer,
    anyDriver: !!v.anyDriver,
    ask: !!v.ask,
    mixedSex: !!v.mixedSex,
    fillFirst: !!v.fillFirst,
    preferTrailer: !!v.preferTrailer && v.trailer !== 'none',
    notes: v.notes?.trim() ?? '',
  }
}
