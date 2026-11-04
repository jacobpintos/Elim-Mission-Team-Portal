import type { SeatingRules } from '@/features/events/carpoolAssign'
import { ORG } from '.'
import { readPersonRules } from './theWell/people/personRulesStore'
import { seatingRulesFrom } from './theWell/people/types'

/**
 * Seating rules an organization's custom module keeps for particular people
 * (src/custom/README.md), for the app's own Auto-assign — in the carpool
 * builder, and Miriam's — to follow: none in a build without them. The Well's
 * are kept in Admin → Vehicles: Special rules for people.
 */
export async function customSeatingRules(): Promise<SeatingRules> {
  if (!ORG.features.vehicles) return {}
  return seatingRulesFrom(await readPersonRules())
}
