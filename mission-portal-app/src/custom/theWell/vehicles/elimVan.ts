import type { Vehicle } from './types'

/**
 * Custom: The Well. The Elim Van: the church's own, seating 15, driven by
 * anyone who may drive another of the vehicles, and asked about each time a
 * carpool is planned ("Bring the Elim Van?").
 *
 * It is in the list from the start, as this, until an admin changes it — its
 * seats, what it can pull, drivers of its own — and then it is kept as they
 * left it. It can be changed but not removed.
 */
export const ELIM_VAN_ID = 'elim-van'

export const ELIM_VAN: Vehicle = {
  id: ELIM_VAN_ID,
  name: 'Elim Van',
  seats: 15,
  drivers: [],
  trailer: 'none',
  anyDriver: true,
  ask: true,
}

/** The vehicles as kept, with the Elim Van as it starts if it hasn't been kept yet. */
export function withElimVan(vehicles: Vehicle[]): Vehicle[] {
  return vehicles.some((v) => v.id === ELIM_VAN_ID) ? vehicles : [ELIM_VAN, ...vehicles]
}
