import type { UserProfile } from '@/types/user'
import { visibleTabs, isAdmin, canUseMessages } from '@/lib/roles'
import type { Tab } from '@/lib/roles'
import type { TourFlow, TourStep } from '../types'
import {
  welcomeFlow,
  adminFlow,
  inventoryFlow,
  announceFlow,
  messagesFlow,
  TAB_FLOWS,
} from './definitions'

const byId: Record<string, TourFlow> = Object.fromEntries(TAB_FLOWS.map((f) => [f.id, f]))

function stepVisible(step: TourStep, profile: UserProfile | null): boolean {
  if (step.adminOnly && !isAdmin(profile)) return false
  if (step.roles && !step.roles.some((r) => profile?.roles?.includes(r))) return false
  return true
}

function filterFlow(flow: TourFlow, profile: UserProfile | null): TourStep[] {
  return flow.steps.filter((s) => stepVisible(s, profile))
}

/**
 * Expand a drawer tab into the flows it actually covers.
 *
 * Two tabs hold more than their own name suggests: "issues" is Operations,
 * which carries the Inventory tools alongside its own screens, and "announce"
 * carries messages for anyone who has them. Without this the messages tour
 * would be unreachable, since messages stopped being a tab of its own.
 *
 * Inventory is admin-only, so it is offered only to admins — Operations
 * itself is not.
 */
function flowsForTab(tab: Tab, profile: UserProfile | null): TourFlow[] {
  // The Admin flow is filed under its own id, not the tab that reaches it.
  if (tab === 'rolehub') return [adminFlow]
  if (tab === 'issues') {
    const operations = byId[tab]
    return [...(operations ? [operations] : []), ...(isAdmin(profile) ? [inventoryFlow] : [])]
  }
  if (tab === 'announce') {
    return [announceFlow, ...(canUseMessages(profile) ? [messagesFlow] : [])]
  }
  const f = byId[tab]
  return f ? [f] : []
}

/** Map a route's first path segment to its tour flow (for the "Need help?" button). */
export function flowForRouteSegment(seg: string): TourFlow | null {
  if (seg === 'admin' || seg === 'rolehub') return adminFlow
  return byId[seg] ?? null
}

/** The full first-login tour: the welcome card followed by every accessible tab, in nav order. */
export function buildFullTour(profile: UserProfile | null): TourStep[] {
  const seen = new Set<string>()
  const ordered: TourFlow[] = []
  for (const tab of visibleTabs(profile)) {
    for (const f of flowsForTab(tab, profile)) {
      if (seen.has(f.id)) continue
      seen.add(f.id)
      ordered.push(f)
    }
  }
  const steps = ordered.flatMap((f) => filterFlow(f, profile))
  return [welcomeFlow.steps[0], ...steps]
}

/** A single tab's tour, scoped to what this user can access. Null if nothing applies. */
export function buildTabTour(
  seg: string,
  profile: UserProfile | null
): { title: string; steps: TourStep[] } | null {
  const flow = flowForRouteSegment(seg)
  if (!flow) return null
  const steps = filterFlow(flow, profile)
  return steps.length ? { title: flow.title, steps } : null
}
