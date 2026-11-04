import type { UserProfile } from '@/types/user'
import type { Prepared } from '@/features/miriam/actions'
import { ORG } from '.'
import { addVehicle, removeVehicle, updateVehicle, vehiclesForMiriam } from './theWell/miriam'

/**
 * What an organization's custom module lets Miriam look up and change
 * (src/custom/README.md), by the names functions/src/miriam/plan.ts gives
 * them — empty in a build without them. The app offers them only where these
 * have them (features/miriam/appTools).
 */

/** Lookups, run in the app as the person signed in. */
export const CUSTOM_LOOKUPS: Record<string, () => Promise<unknown>> = ORG.features.vehicles
  ? { read_vehicles: vehiclesForMiriam }
  : {}

/** Changes, worked out to be confirmed (features/miriam/actions). */
export const CUSTOM_ACTIONS: Record<
  string,
  (profile: UserProfile, input: Record<string, unknown>) => Promise<Prepared>
> = ORG.features.vehicles
  ? { add_vehicle: addVehicle, update_vehicle: updateVehicle, remove_vehicle: removeVehicle }
  : {}
