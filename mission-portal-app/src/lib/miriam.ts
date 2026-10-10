import type { UserProfile } from '@/types/user'

/**
 * Miriam, the in-app assistant: a request, said or typed, sent to the
 * askMiriam function (functions/src/miriam; called from features/miriam),
 * which works out what was meant and hands back something for the app to
 * open — today, a new event's form filled in.
 *
 * Who may use what is decided there, from the caller's profile, against the
 * table in functions/src/miriam/plan.ts. `canUseMiriam` mirrors it only to
 * decide whether to show the button: someone who has no command to use is not
 * offered one. Add a command there, and widen this to match.
 */
export function canUseMiriam(profile: UserProfile | null): boolean {
  // Questions are for every member and guest (what each may see is decided
  // there); a new event's form, for admins.
  return (profile?.roles ?? []).some((r) => r !== 'public')
}

/** The longest request Miriam takes, typed or said (askMiriam's MAX_TEXT). */
export const MAX_REQUEST = 1500

/** One way of a flight, as Miriam fills it in. */
export interface FlightLegDraft {
  date: string
  time: string
  airport: string
  airline: string
  flight: string
  confirmation: string
  arrival: string
}

/**
 * An event's form, filled in (functions/src/miriam/plan.ts: EventDraft). For
 * a new event, fields not said are '' or []; for an edit, only what changes
 * is here, and a field left out is as the event has it.
 */
export interface EventDraft {
  title: string
  /** YYYY-MM-DD, or '' */
  date: string
  /** "9:00 PM", or '' */
  startTime: string
  location: string
  address: string
  city: string
  state: string
  users?: string[]
  groups?: string[]
  /** null: not repeating. */
  repeat?: { recur: 'weekly' | 'biweekly' | 'monthly'; recDay: number } | null
  isPublic?: boolean
  isVirtual?: boolean
  virtualLink?: string
  foodItems?: string[]
  cars?: { label: string; seats?: number; driver: string; riders: string[] }[]
  lodging?: {
    name: string
    address: string
    room: string
    confirmation: string
    assignees: string[]
  }[]
  flights?: { uid: string; out: FlightLegDraft; ret: FlightLegDraft }[]
  teams?: { name: string; leaders: string[]; members: string[] }[]
  dressCode?: { group: string; text: string }[]
  extraDays?: { date: string; startTime: string; location: string }[]
  taskTemplateId?: string
}

/** A new task's form, filled in (functions/src/miriam/plan.ts: TaskDraft). */
export interface TaskDraft {
  title: string
  /** YYYY-MM-DD, or '' */
  dueDate: string
  users: string[]
  /** A group to assign instead of people; '' for none. */
  group: string
  lead: string
}

/** Where an answer can be shown (functions/src/miriam/askMiriam.ts: Open). */
export type MiriamOpen =
  | {
      kind: 'event'
      key: string
      section: 'dress_code' | 'availability' | 'weather' | 'details' | null
    }
  | { kind: 'task'; id: string }
  | { kind: 'availability' }
  /** A screen from lib/miriamScreens, by id; opened only if it is this person's. */
  | { kind: 'screen'; id: string }
  /** A video from Content, by id: played over the page. */
  | { kind: 'video'; id: string }
  /** A reorder list item, by id: its link opened, to buy it (admins). */
  | { kind: 'reorder'; id: string }

export type MiriamResult =
  /** With `editKey`, an existing event's form (its instance key) with the changes made. */
  | { kind: 'eventForm'; draft: EventDraft; notes: string[]; editKey?: string }
  | {
      kind: 'answer'
      text: string
      open: MiriamOpen | null
      /** Events offered when she isn't sure which was meant. */
      choices?: { key: string; title: string; date: string }[]
      /** The words used for the event, as heard: learned when a choice is picked. */
      heardName?: string
    }
  | { kind: 'reply'; text: string }
  /** A new task's form, filled in, for an admin to check and save. */
  | { kind: 'taskForm'; draft: TaskDraft; notes: string[] }
  /** A change asked for, to be shown and confirmed before it is made (features/miriam/actions). */
  | { kind: 'confirm'; name: string; input: Record<string, unknown> }

/** The app's address for where an answer is shown. */
export function miriamHref(
  open: Exclude<MiriamOpen, { kind: 'screen' | 'video' | 'reorder' }>
): string {
  if (open.kind === 'task') return `/assignments?taskId=${encodeURIComponent(open.id)}`
  if (open.kind === 'availability') return '/admin/avail'
  const focus = open.section ? `?focus=${open.section}` : ''
  return `/events/${encodeURIComponent(open.key)}${focus}`
}
