import type { KaizenItem, ActionPlan } from '@/types/kaizen'

export const KAIZEN_COLS = [
  { id: 'idea',     label: 'Ideas',        color: '#2980b9' },
  { id: 'review',   label: 'Under Review', color: '#8e44ad' },
  { id: 'action',   label: 'Action Plan',  color: '#e67e22' },
  { id: 'complete', label: 'Completed',    color: '#27ae60' },
] as const

export const KAIZEN_CATS = [
  'Equipment', 'Instruments', 'Sound Balance',
  'Coordination', 'Tech', 'Stream / Capture', 'Other',
] as const

export function activeAP(item: KaizenItem): ActionPlan | null {
  return item.actionPlans.length ? item.actionPlans[item.actionPlans.length - 1] : null
}
