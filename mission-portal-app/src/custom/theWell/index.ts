import type { OrgModule } from '../types'

/**
 * Custom: The Well of Iowa — what its build has that another organization's
 * wouldn't (src/custom/README.md).
 */
export const theWell: OrgModule = {
  id: 'thewell',
  name: 'The Well',
  adminSections: [
    {
      key: 'vehicles',
      label: 'Vehicles',
      path: '/(app)/admin/vehicles',
      icon: '🚐',
    },
  ],
  // The texting list's texts come from this number.
  textingNumber: '+13192490049',
  features: {
    // Admin → Vehicles, the carpool planner, and Miriam's vehicle commands.
    vehicles: true,
  },
}
