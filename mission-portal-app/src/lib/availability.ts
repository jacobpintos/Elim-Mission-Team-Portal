import type { EventInstance, AvailResponse } from '@/types/events'

export function availKey(ev: EventInstance): string {
  const key = ev.instanceKey ?? `${ev.id}_${ev.date}`
  return key.replace(/\//g, '_')
}

export function getAvail(
  avail: Record<string, Record<string, AvailResponse>>,
  ev: EventInstance,
  uid: string
): AvailResponse | null {
  const key = availKey(ev)
  return avail[key]?.[uid] ?? null
}

export const AVAIL_COLORS = {
  yes: '#27ae60',
  no: '#c0392b',
  partial: '#e67e22',
  tbd: '#2980b9',
} as const

export const AVAIL_LABELS = {
  yes: 'Available',
  no: 'Not Available',
  partial: 'Partial',
  tbd: 'TBD',
} as const

export function isOverdue(task: { dueDate?: string | null; status?: string }): boolean {
  return !!(task.dueDate && task.status !== 'done' && task.dueDate < todayStr())
}

function todayStr() {
  return new Date().toISOString().split('T')[0]
}
