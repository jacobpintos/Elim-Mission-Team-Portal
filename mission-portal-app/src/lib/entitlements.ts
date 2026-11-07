import { ORG, type OrgModule } from '@/custom'
import type { OrgPlan } from '@/custom/types'

/**
 * What an organization may use: what its plan includes, and, for equipment,
 * whether it has that equipment (src/custom: its profile). One question asked
 * in one place, `orgCan`, so that partner churches (Stage 2) can be given
 * only what they have, and a paid plan (Stage 3) can be checked where the
 * feature is offered rather than all through the app (docs/ROADMAP.md).
 *
 * Today there is one organization, on the founding plan, with everything.
 */

/** The parts of the app a plan can include or leave out. */
export type AppFeature =
  /** Sound Engineers, and Miriam, changing the sound desk (src/lib/mixer). */
  | 'soundDesk'
  /** Video Operators, the Video screen, and Miriam, switching cameras (src/lib/switcher). */
  | 'videoSwitcher'

/** What each plan includes. */
const PLAN_FEATURES: Record<OrgPlan, 'everything' | readonly AppFeature[]> = {
  // The Well's own, while the app is built with it: everything, and no billing.
  founding: 'everything',
}

/** Whether a plan includes a feature. */
export function planIncludes(plan: OrgPlan, feature: AppFeature): boolean {
  const included = PLAN_FEATURES[plan]
  return included === 'everything' || included.includes(feature)
}

/** Whether the organization has the equipment a feature works (true for one that needs none). */
export function hasEquipmentFor(feature: AppFeature, org: OrgModule = ORG): boolean {
  switch (feature) {
    case 'soundDesk':
      return !!org.equipment.soundDesk
    case 'videoSwitcher':
      return !!org.equipment.videoSwitcher
  }
}

/** Whether the organization may use a feature: its plan includes it, and it has what it needs. */
export function orgCan(feature: AppFeature, org: OrgModule = ORG): boolean {
  return planIncludes(org.plan, feature) && hasEquipmentFor(feature, org)
}
