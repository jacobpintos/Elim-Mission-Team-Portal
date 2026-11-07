import type { OrgModule } from '../types'

/**
 * Custom: The Well of Iowa — what its build has that another organization's
 * wouldn't (src/custom/README.md).
 */
export const theWell: OrgModule = {
  id: 'thewell',
  name: 'The Well',
  profile: {
    fullName: 'The Well of Iowa',
    kind: 'church',
    timeZone: 'America/Chicago',
    mailingAddress: 'P.O. Box 552, North Liberty, IA 52317',
    home: { city: 'North Liberty', state: 'IA', lat: 41.7491, lng: -91.5779 },
    appUrl: 'https://mission-team-portal.web.app',
  },
  plan: 'founding',
  equipment: {
    // The X32 on its own Wi-Fi, and the ATEM Television Studio Pro.
    soundDesk: 'x32',
    videoSwitcher: 'atem',
  },
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
    // Operations → Production Checklist: a member's own site, shown as it is.
    productionChecklist: true,
  },
}
