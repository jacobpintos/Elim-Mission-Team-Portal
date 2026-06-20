import type { Role } from '@/types/user'
import type { Tab } from '@/lib/roles'

/**
 * A single step in a guided tour. Steps either explain a real screen
 * (navigate via `route` and narrate with `title`/`body`/`bullets`) or
 * demonstrate a "doing" action via a sandboxed `showcase` whose state is
 * thrown away when the tour exits — nothing ever persists to Firestore.
 */
export interface TourStep {
  id: string
  title: string
  body: string
  /** Bulleted feature highlights shown under the body. */
  bullets?: string[]
  /** Underlying app route to navigate to when this step is shown (e.g. "/events"). */
  route?: string
  /** Key into the showcase registry — renders an interactive, non-persisting demo. */
  showcase?: ShowcaseKey
  /** Only show this step to admins. */
  adminOnly?: boolean
  /** Only show this step if the user has at least one of these roles. */
  roles?: Role[]
  /** Override the primary (advance) button label — e.g. the welcome step's "Yes, show me around". */
  primaryLabel?: string
  /** Override the secondary (exit) button label — e.g. the welcome step's "No thanks". */
  secondaryLabel?: string
}

export interface TourFlow {
  /** Stable id; for tab tours this matches the owning Tab. */
  id: string
  /** Owning tab — used to map the "Need help?" button on a screen to its tour. */
  tab?: Tab
  title: string
  subtitle?: string
  steps: TourStep[]
}

export type ShowcaseKey =
  | 'calendar'
  | 'eventForm'
  | 'eventDetail'
  | 'availability'
  | 'planningBoard'
  | 'announce'
  | 'securityReport'
  | 'inventory'
  | 'setlist'
  | 'kanban'
  | 'messages'
  | 'tasks'
