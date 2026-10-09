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

/** A new event's form, filled in (functions/src/miriam/plan.ts: EventDraft). */
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
  users: string[]
  groups: string[]
}

/** Where an answer can be shown (functions/src/miriam/askMiriam.ts: Open). */
export type MiriamOpen =
  | { kind: 'event'; key: string; section: 'dress_code' | 'availability' | 'details' | null }
  | { kind: 'task'; id: string }
  | { kind: 'availability' }

export type MiriamResult =
  | { kind: 'eventForm'; draft: EventDraft; notes: string[] }
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

/** The app's address for where an answer is shown. */
export function miriamHref(open: MiriamOpen): string {
  if (open.kind === 'task') return `/assignments?taskId=${encodeURIComponent(open.id)}`
  if (open.kind === 'availability') return '/admin/avail'
  const focus = open.section ? `?focus=${open.section}` : ''
  return `/events/${encodeURIComponent(open.key)}${focus}`
}
