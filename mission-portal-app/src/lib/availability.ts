import type { EventInstance, EventTemplate, AvailResponse } from '@/types/events'

export function availKey(ev: EventInstance): string {
  const key = ev.instanceKey ?? `${ev.id}_${ev.date}`
  return key.replace(/\//g, '_')
}

export function seriesAvailKey(templateId: string | number): string {
  return String(templateId).replace(/\//g, '_') + '_series'
}

export function getAvail(
  avail: Record<string, Record<string, AvailResponse>>,
  ev: EventInstance,
  uid: string
): AvailResponse | null {
  const key = availKey(ev)
  return avail[key]?.[uid] ?? null
}

export function getSeriesAvail(
  avail: Record<string, Record<string, AvailResponse>>,
  templateId: string | number,
  uid: string
): AvailResponse | null {
  return avail[seriesAvailKey(templateId)]?.[uid] ?? null
}

// Returns the response to display for a user on an event instance:
// - Instance-level response (manually set) takes precedence
// - Falls back to series response for recurring events
export function effectiveAvail(
  avail: Record<string, Record<string, AvailResponse>>,
  ev: EventInstance,
  uid: string
): AvailResponse | null {
  const instanceResp = avail[availKey(ev)]?.[uid] ?? null
  if (instanceResp) return instanceResp
  if (ev.isRec) {
    return getSeriesAvail(avail, ev.templateId ?? ev.id, uid)
  }
  return null
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

/** Worst first: the order a leader needs to notice them in. */
const STATUS_RANK: Record<AvailResponse['status'], number> = { no: 0, partial: 1, tbd: 2, yes: 3 }

/**
 * What someone said about an event, as a leader putting them on a team needs it.
 *
 * Teams belong to the whole event, so the answer is the event's, not a day's:
 *  - one occurrence being edited (instanceKey) → that occurrence's answer,
 *    falling back to the series answer for a recurring event;
 *  - a recurring event as a whole → the series answer;
 *  - a one-time event → the worst answer across its days, because someone who
 *    can come on Friday but not Saturday is not free for the trip.
 *
 * Null when they have not answered at all, which is different from TBD: TBD
 * is an answer, silence is not.
 */
export function teamAvailStatus(
  avail: Record<string, Record<string, AvailResponse>>,
  event: Pick<EventTemplate, 'id' | 'isRec' | 'date' | 'extraDays'> | null | undefined,
  uid: string,
  instanceKey?: string
): AvailResponse['status'] | null {
  if (!event) return null
  const key = (k: string) => k.replace(/\//g, '_')
  const series = () => (event.isRec ? (getSeriesAvail(avail, event.id, uid)?.status ?? null) : null)

  if (instanceKey) return avail[key(instanceKey)]?.[uid]?.status ?? series()
  if (event.isRec) return series()

  const keys: string[] = []
  if (event.date) keys.push(`${event.id}_${event.date}`)
  ;(event.extraDays ?? []).forEach((ed, i) => keys.push(`${event.id}_${ed.date}_d${i + 2}`))
  let worst: AvailResponse['status'] | null = null
  for (const k of keys) {
    const s = avail[key(k)]?.[uid]?.status
    if (s && (worst === null || STATUS_RANK[s] < STATUS_RANK[worst])) worst = s
  }
  return worst
}

/**
 * Order people for picking onto a team: available first, then partial, then
 * TBD, then those who have not answered, and those who said no last. Stable,
 * so people with the same answer keep the order they came in.
 */
export function availPickRank(status: AvailResponse['status'] | null): number {
  if (status === 'yes') return 0
  if (status === 'partial') return 1
  if (status === 'tbd') return 2
  if (status === null) return 3
  return 4
}

function todayStr() {
  return new Date().toISOString().split('T')[0]
}
