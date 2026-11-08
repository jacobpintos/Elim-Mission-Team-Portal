import type { AdminSection } from '@/lib/adminSections'

/**
 * What kind of organization it is. Churches only for now; traveling
 * ministries and bands come at Stage 4 (docs/ROADMAP.md).
 */
export type OrgKind = 'church'

/**
 * The plan an organization is on, which decides the features it may use
 * (src/lib/entitlements). One for now: the founding organization's, with
 * everything and no billing. Partner and paid plans come at Stages 2 and 3
 * (docs/ROADMAP.md).
 */
export type OrgPlan = 'founding'

/** Who an organization is, for everything that would otherwise name The Well. */
export interface OrgProfile {
  /** In full, as on its policies, letters and calendar files: "The Well of Iowa". */
  fullName: string
  kind: OrgKind
  /**
   * Its clock (an IANA zone): when its days begin and end. The functions'
   * nightly jobs keep the same one (functions/src/org.ts).
   */
  timeZone: string
  /** Where post reaches it: on its policies and emails. EXPO_PUBLIC_ORG_ADDRESS, when set, is used instead. */
  mailingAddress: string
  /** Where it's based: where its trips leave from, and where it is on a map. */
  home: { city: string; state: string; lat: number; lng: number }
  /** The web app's address, for links into it. EXPO_PUBLIC_APP_URL, when set, is used instead. */
  appUrl: string
}

/**
 * The equipment an organization has that the app can work: what its Sound
 * Engineers and Video Operators control (src/lib/entitlements). Absent: it
 * has none, and the jobs, settings and screens for it aren't shown.
 */
export interface OrgEquipment {
  /**
   * Its sound desk (src/lib/mixer): a Behringer WING, or a Behringer X32 (or
   * Midas M32, which works the same).
   */
  soundDesk?: 'wing' | 'x32'
  /** Its video switcher: a Blackmagic ATEM (src/lib/switcher). */
  videoSwitcher?: 'atem'
}

/**
 * What an organization's custom module adds to the app (src/custom/README.md).
 * Core code reads this, and nothing in an organization's own folder.
 */
export interface OrgModule {
  id: string
  /** As people say it: "The Well". */
  name: string
  profile: OrgProfile
  plan: OrgPlan
  equipment: OrgEquipment
  /** Sections of its own in the admin area, after the app's. */
  adminSections: AdminSection[]
  /**
   * The number its texting list's texts come from, E.164: who to text STOP
   * to. Said until an admin sets another (Admin → Leadership Team).
   */
  textingNumber?: string
  /** Its features, each on or off. */
  features: {
    /**
     * The team's vehicles (Admin → Vehicles), a carpool planned from them,
     * and Miriam keeping them.
     */
    vehicles: boolean
    /**
     * Operations opens on its own Production Checklist, a member's site
     * (theWell/production), rather than the app's Pre-service Checklist.
     */
    productionChecklist: boolean
  }
}
