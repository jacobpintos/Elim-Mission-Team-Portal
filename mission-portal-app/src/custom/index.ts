import { theWell } from './theWell'
import type { OrgModule } from './types'

/**
 * The organization this build is for, and what its custom module adds
 * (src/custom/README.md). One today: The Well of Iowa.
 */
export const ORG: OrgModule = theWell

/** Whether this build has a custom feature. */
export const hasCustom = (feature: keyof OrgModule['features']) => ORG.features[feature]

export type { OrgModule } from './types'
