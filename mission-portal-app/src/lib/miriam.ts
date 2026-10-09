import { isAdmin } from '@/lib/roles'
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
  return isAdmin(profile)
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

export type MiriamResult =
  | { kind: 'eventForm'; draft: EventDraft; notes: string[] }
  | { kind: 'reply'; text: string }
