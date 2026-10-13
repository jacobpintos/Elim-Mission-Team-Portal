import {
  ADMIN_ONLY_NOTIF_KEYS,
  NOTIF_LABELS,
  PUBLIC_NOTIF_LABELS,
  type NotifKey,
  type PublicNotifKey,
} from './notificationKeys'
import { fits } from './miriamAppData'

/**
 * The pieces of Miriam's changes that can be worked out without the app
 * running (features/miriam/actions.ts does the rest): which food item was
 * meant, and which notification switch, as Settings names it.
 */

/** The food item on an event's sheet that was asked for: the same, else the one that fits. */
export function foodItemFor(items: string[], asked: string): number {
  const said = asked.trim().toLowerCase()
  const exact = items.findIndex((i) => i.trim().toLowerCase() === said)
  if (exact >= 0) return exact
  const close = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => fits(item, asked) || item.toLowerCase().includes(said))
  return close.length === 1 ? close[0].index : -1
}

/**
 * Said when the item asked for is already someone's. "Just signed up" only
 * when they were shown it open — in their briefing, or by Miriam moments
 * before — so it must have been taken since; otherwise "already bringing",
 * since it may have been theirs for weeks.
 */
export function foodTakenSaid(
  by: { uid: string | number; displayName?: string },
  item: string,
  uid: string,
  shownOpen: boolean
): string {
  if (String(by.uid) === uid) return `You’re already bringing ${item}.`
  const who = by.displayName?.trim() || 'Someone'
  return shownOpen ? `${who} just signed up for ${item}.` : `${who} is already bringing ${item}.`
}

/** What is still open on a sheet, by name, in the list's order. `signups`: keyed by the item's place. */
export function stillOpen(items: string[], signups: Record<string, unknown>): string[] {
  return items.filter((item, i) => item && !signups[String(i)])
}

/** What is left on the sheet, said after an item taken: "Salsa and Drinks are still open." */
export function foodStillOpenSaid(open: string[]): string {
  if (open.length === 0) return 'Nothing else on the sheet is open.'
  if (open.length === 1) return `${open[0]} is still open.`
  return `${open.slice(0, -1).join(', ')} and ${open[open.length - 1]} are still open.`
}

/** Settings' switches that are a single on-or-off, not push and email. */
const SINGLE = {
  weeklyDigest: 'Weekly digest email',
  monthlyDigest: 'Monthly digest email',
  securityReportUrgent: 'Security reports break through Focus',
} as const

export interface NotificationSwitch {
  /** Fields of notificationPrefs to write, by dot path. */
  paths: string[]
  label: string
}

/**
 * The switch asked for, as this person sees it in Settings — an admin's
 * own are only for admins — or null.
 */
export function notificationSwitch(
  key: string,
  channel: 'push' | 'email' | 'both',
  admin: boolean
): NotificationSwitch | null {
  if (key in SINGLE) {
    return { paths: [`notificationPrefs.${key}`], label: SINGLE[key as keyof typeof SINGLE] }
  }
  const label = NOTIF_LABELS[key as NotifKey] ?? PUBLIC_NOTIF_LABELS[key as PublicNotifKey] ?? null
  if (!label) return null
  if (ADMIN_ONLY_NOTIF_KEYS.includes(key as NotifKey) && !admin) return null
  const channels = channel === 'both' ? ['push', 'email'] : [channel]
  return {
    paths: channels.map((c) => `notificationPrefs.${key}.${c}`),
    label: `${label} (${channel === 'both' ? 'push and email' : channel})`,
  }
}

/** Who is in it after adding and taking out — each once, the order kept. */
export function membersAfter(before: string[], add: string[], remove: string[]): string[] {
  return [...new Set([...before.map(String).filter((m) => !remove.includes(m)), ...add])]
}

/** A person's roles after the change, only roles that exist; [] means none left. */
export function rolesAfter(
  before: string[],
  add: string[],
  remove: string[],
  known: readonly string[]
): string[] {
  return membersAfter(
    before,
    add.filter((r) => known.includes(r)),
    remove
  )
}

export interface Team {
  name: string
  members: string[]
}
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/** The common teams with one changed, or why it can't be: as the Common Teams screen keeps them. */
export function teamsAfter(
  teams: Team[],
  change:
    | { kind: 'add'; name: string; members: string[] }
    | { kind: 'update'; team: string; newName: string; add: string[]; remove: string[] }
    | { kind: 'remove'; team: string }
): Team[] | string {
  if (change.kind === 'add') {
    return teams.some((t) => same(t.name, change.name))
      ? `There is already a team called ${change.name}.`
      : [...teams, { name: change.name, members: change.members }]
  }
  const at = teams.findIndex((t) => same(t.name, change.team))
  if (at < 0) return `There is no team called ${change.team}.`
  if (change.kind === 'remove') return teams.filter((_, i) => i !== at)
  if (change.newName && teams.some((t, i) => i !== at && same(t.name, change.newName))) {
    return `There is already a team called ${change.newName}.`
  }
  return teams.map((t, i) =>
    i === at
      ? {
          name: change.newName || t.name,
          members: membersAfter(t.members, change.add, change.remove),
        }
      : t
  )
}

// --- Task templates -----------------------------------------------------------

/** Section colours, in the order the template editor gives them (EditTaskTemplateSheet). */
const SECTION_COLORS = [
  '#f56c5a',
  '#2980b9',
  '#27ae60',
  '#f39c12',
  '#9b59b6',
  '#1abc9c',
  '#e91e8c',
  '#607d8b',
]

export interface TemplateAsked {
  name: string
  sections: {
    name: string
    tasks: {
      title: string
      people_ids: string[]
      group_ids: string[]
      days_before: number
      days_after: number
    }[]
  }[]
}

/**
 * A task template as the template editor saves it: its sections, each with
 * an id made from its name, and every task in one — or a reason it can't be.
 */
export function templateFrom(asked: TemplateAsked):
  | {
      name: string
      sections: { id: string; label: string; color: string }[]
      tasks: {
        title: string
        assignees: string[]
        assigneeGroups: string[]
        daysBefore: number
        daysAfterEvent?: number
        section: string
      }[]
    }
  | string {
  const name = String(asked.name ?? '').trim()
  if (!name) return 'A task template needs a name.'
  const sections: { id: string; label: string; color: string }[] = []
  const tasks: ReturnType<typeof templateTask>[] = []
  for (const s of Array.isArray(asked.sections) ? asked.sections : []) {
    const label = String(s?.name ?? '').trim() || 'Tasks'
    let id = sections.find((x) => x.label.toLowerCase() === label.toLowerCase())?.id
    if (!id) {
      const base =
        label
          .toLowerCase()
          .replace(/\s+/g, '_')
          .replace(/[^a-z0-9_]/g, '') || 'section'
      id = base
      for (let i = 2; sections.some((x) => x.id === id); i++) id = `${base}_${i}`
      sections.push({ id, label, color: SECTION_COLORS[sections.length % SECTION_COLORS.length] })
    }
    for (const t of Array.isArray(s?.tasks) ? s.tasks : []) {
      const task = templateTask(t, id)
      if (task.title) tasks.push(task)
    }
  }
  if (tasks.length === 0) return 'A task template needs at least one task.'
  return { name, sections, tasks }
}

const days = (v: unknown) => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) && n > 0 && n < 400 ? n : 0
}
const strings = (v: unknown) => (Array.isArray(v) ? v.map(String).filter(Boolean) : [])

function templateTask(t: TemplateAsked['sections'][number]['tasks'][number], section: string) {
  const after = days(t?.days_after)
  return {
    title: String(t?.title ?? '').trim(),
    assignees: strings(t?.people_ids),
    assigneeGroups: strings(t?.group_ids),
    // The editor's own default, when no day was said.
    daysBefore: after ? 0 : days(t?.days_before) || 7,
    ...(after ? { daysAfterEvent: after } : {}),
    section,
  }
}

/** When a template task is due, as said: "7 days before", "2 days after". */
export function templateDue(task: { daysBefore: number; daysAfterEvent?: number }): string {
  if (task.daysAfterEvent) return `${task.daysAfterEvent} ${plural(task.daysAfterEvent)} after`
  return `${task.daysBefore} ${plural(task.daysBefore)} before`
}
const plural = (n: number) => (n === 1 ? 'day' : 'days')

// --- Set lists --------------------------------------------------------------------

/** The keys a set list's songs are given in (lib/nashvilleNumbers: NNS_KEYS), as spelled there. */
const KEY_SPELLING: Record<string, string> = {
  C: 'C',
  'C#': 'Db',
  DB: 'Db',
  D: 'D',
  'D#': 'Eb',
  EB: 'Eb',
  E: 'E',
  F: 'F',
  'F#': 'F#',
  GB: 'F#',
  G: 'G',
  'G#': 'Ab',
  AB: 'Ab',
  A: 'A',
  'A#': 'Bb',
  BB: 'Bb',
  B: 'B',
}

/** A key as said ("D", "B flat", "F#m", "c sharp minor") as a set list holds it, or "" for none. */
export function setListKey(said: string): string {
  const k = String(said ?? '')
    .trim()
    .replace(/\s*(?:minor|min|m)$/i, '')
    .replace(/\s*flat$/i, 'b')
    .replace(/\s*sharp$/i, '#')
    .replace(/♭/g, 'b')
    .replace(/♯/g, '#')
  const m = k.match(/^([A-Ga-g])([b#]?)$/)
  if (!m) return ''
  // Upper-cased, a flat is "B": "Bb" is "BB", "Db" is "DB".
  return KEY_SPELLING[(m[1] + m[2]).toUpperCase()] ?? ''
}
