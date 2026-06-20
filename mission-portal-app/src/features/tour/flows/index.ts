import type { UserProfile } from '@/types/user'
import { visibleTabs, isAdmin } from '@/lib/roles'
import type { Tab } from '@/lib/roles'
import type { TourFlow, TourStep } from '../types'
import { welcomeFlow, adminFlow, inventoryFlow, worshipFlow, TAB_FLOWS } from './definitions'

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
 * The "rolehub" tab is a hub for the Admin panel plus the Inventory/Worship
 * role tools, so expand it into those flows for the full tour.
 */
function flowsForTab(tab: Tab): TourFlow[] {
  if (tab === 'rolehub') return [adminFlow, inventoryFlow, worshipFlow]
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
    for (const f of flowsForTab(tab)) {
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
