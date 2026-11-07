/**
 * The Pre-service Checklist: Operations' first tab for an organization
 * without a checklist of its own (The Well has its Production Checklist,
 * src/custom). Admins build it: what's to be done before a service, each
 * item given to the people who do it. Each person checks off their own and
 * sees how far along everyone is; admins see, and can check, the whole list.
 *
 * It's done again for every service: checks are kept by the day of the
 * service they're for (`serviceDayFor`), so each service starts with none.
 *
 * In Firestore (./preServiceDb, firestore.rules):
 * - preService/checklist: the items, keyed by id, and the service days;
 * - preServiceDays/{YYYY-MM-DD}/checks/{itemId}: who checked it, and when.
 */

export interface ChecklistItem {
  id: string
  /** What's to be done: "Batteries in the handheld mics". */
  text: string
  /** The heading it's listed under ("Sound", "Stage"), or '' for none. */
  section: string
  order: number
  /** Who does it (uids). None: it's for an admin to check. */
  assignees: string[]
}

export interface Checklist {
  /** In order. */
  items: ChecklistItem[]
  /** The days of the week services are on: 0 Sunday … 6 Saturday. */
  serviceDays: number[]
}

/** An item checked off for a service: by whom, and when (ms; null until the server has it). */
export interface Check {
  by: string
  at: number | null
}

export const DEFAULT_SERVICE_DAYS = [0]

export const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

const str = (v: unknown) => (typeof v === 'string' ? v : '')

/** Service days as stored: whole days of the week, each once, in order; Sunday if none. */
function serviceDaysOf(v: unknown): number[] {
  const days = Array.isArray(v)
    ? [...new Set(v.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))]
    : []
  return days.length ? days.sort((a, b) => a - b) : [...DEFAULT_SERVICE_DAYS]
}

/** The checklist as stored, read safely: an empty one for nothing, or for anything unreadable. */
export function checklistOf(data: unknown): Checklist {
  const d = (data ?? {}) as { items?: unknown; serviceDays?: unknown }
  const stored = d.items && typeof d.items === 'object' ? (d.items as Record<string, unknown>) : {}
  const items: ChecklistItem[] = []
  for (const [id, raw] of Object.entries(stored)) {
    const r = (raw ?? {}) as Record<string, unknown>
    const text = str(r.text).trim()
    if (!text) continue
    items.push({
      id,
      text,
      section: str(r.section).trim(),
      order: typeof r.order === 'number' ? r.order : Number.MAX_SAFE_INTEGER,
      assignees: Array.isArray(r.assignees)
        ? [...new Set(r.assignees.filter((a): a is string => typeof a === 'string' && !!a))]
        : [],
    })
  }
  items.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
  return { items, serviceDays: serviceDaysOf(d.serviceDays) }
}

/** Tidied for saving: text trimmed, empty items left out, numbered in order, each person once. */
export function tidied(c: Checklist): Checklist {
  const items = c.items
    .map((i) => ({ ...i, text: i.text.trim(), section: i.section.trim() }))
    .filter((i) => i.text)
    .map((i, order) => ({ ...i, order, assignees: [...new Set(i.assignees.filter(Boolean))] }))
  return { items, serviceDays: serviceDaysOf(c.serviceDays) }
}

/** As stored: items keyed by id, so the rules can find who an item is given to. */
export function storedChecklist(c: Checklist): {
  items: Record<string, Omit<ChecklistItem, 'id'>>
  serviceDays: number[]
} {
  const t = tidied(c)
  return {
    items: Object.fromEntries(t.items.map(({ id, ...rest }) => [id, rest])),
    serviceDays: t.serviceDays,
  }
}

const parts = (day: string) => day.split('-').map(Number) as [number, number, number]
const utc = (day: string) => {
  const [y, m, d] = parts(day)
  return new Date(Date.UTC(y, m - 1, d))
}
const dayOf = (t: Date) => t.toISOString().slice(0, 10)

/**
 * The service the checklist is for: today, when a service is today; else the
 * next service day. A service's checks stay with it, so the list starts
 * empty again the day after.
 */
export function serviceDayFor(today: string, serviceDays: readonly number[]): string {
  const days = serviceDays.length ? serviceDays : DEFAULT_SERVICE_DAYS
  const t = utc(today)
  for (let ahead = 0; ahead < 7; ahead++) {
    const d = new Date(t.getTime() + ahead * 86_400_000)
    if (days.includes(d.getUTCDay())) return dayOf(d)
  }
  return today
}

/** A service's day, said: "Sunday, November 8". */
export function serviceDaySaid(day: string): string {
  const t = utc(day)
  return `${DAY_NAMES[t.getUTCDay()]}, ${MONTHS[t.getUTCMonth()]} ${t.getUTCDate()}`
}

/** The items given to this person. */
export const mineOf = (items: readonly ChecklistItem[], uid: string) =>
  items.filter((i) => i.assignees.includes(uid))

/** Who may check an item off, or take the check back: those it's given to, and admins. */
export const canCheck = (item: ChecklistItem, uid: string, admin: boolean) =>
  admin || (!!uid && item.assignees.includes(uid))

/** How far along the list is: items checked off, of all of them. */
export function progressOf(
  items: readonly ChecklistItem[],
  checks: Readonly<Record<string, Check>>
): { done: number; total: number } {
  return { done: items.filter((i) => checks[i.id]).length, total: items.length }
}

/** The items under their headings, headings in the order they first come. */
export function bySection(
  items: readonly ChecklistItem[]
): { section: string; items: ChecklistItem[] }[] {
  const out: { section: string; items: ChecklistItem[] }[] = []
  for (const item of items) {
    const group = out.find((g) => g.section === item.section)
    if (group) group.items.push(item)
    else out.push({ section: item.section, items: [item] })
  }
  return out
}

/** An id for a new item: unique enough within one checklist. */
export const newItemId = () =>
  `i${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
