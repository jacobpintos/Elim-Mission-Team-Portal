import type { AdminSection } from '@/lib/adminSections'

/**
 * What an organization's custom module adds to the app (src/custom/README.md).
 * Core code reads this, and nothing in an organization's own folder.
 */
export interface OrgModule {
  id: string
  name: string
  /** Sections of its own in the admin area, after the app's. */
  adminSections: AdminSection[]
  /** Its features, each on or off. */
  features: {
    /**
     * The team's vehicles (Admin → Vehicles), a carpool planned from them,
     * and Miriam keeping them.
     */
    vehicles: boolean
  }
}
