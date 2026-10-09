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
