import { ORG } from '.'
import { VehiclePlanner } from './theWell/carpool/VehiclePlanner'
import { VehiclesScreen } from './theWell/vehicles/VehiclesScreen'
import { ProductionChecklistScreen } from './theWell/production/ProductionChecklistScreen'

/**
 * The screens an organization's custom module adds (src/custom/README.md),
 * for core screens to show where they belong — null in a build without them.
 * Kept apart from the manifest (./index.ts), which the app's logic and its
 * tests read, so that reading it never loads a screen.
 */

/** The Well: a carpool planned from the team's vehicles, from an event's carpool. */
export const CustomCarpoolPlanner = ORG.features.vehicles ? VehiclePlanner : null

/** The Well: Admin → Vehicles. */
export const CustomVehiclesScreen = ORG.features.vehicles ? VehiclesScreen : null

/** The Well: Operations' first tab, its Production Checklist, in place of the Pre-service Checklist. */
export const CustomOperationsChecklist = ORG.features.productionChecklist
  ? ProductionChecklistScreen
  : null

export type { VehiclePlannerProps as CarpoolPlannerProps } from './theWell/carpool/VehiclePlanner'
