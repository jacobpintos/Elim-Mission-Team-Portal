import type { UserProfile } from '@/types/user'

/**
 * The questions people ask Miriam, kept for Admin → Analytics to show which
 * are asked most (functions/src/miriam/own/asked). The words only — never
 * who asked, only what kind of account — and only questions: never a note,
 * a reminder or a message, which are theirs (src/lib/dateNotes).
 */

/** What kind of account asked. */
export type Audience = 'public' | 'member' | 'guest'

const MEMBER_ROLES = ['admin', 'security', 'regular', 'intern', 'worship']

export function audienceOf(profile: UserProfile | null): Audience {
  const roles = profile?.roles ?? []
  if (roles.some((r) => MEMBER_ROLES.includes(r))) return 'member'
  if (roles.includes('guest')) return 'guest'
  return 'public'
}

/** The longest kept. */
export const ASKED_MAX = 200

/** Asks something: a question mark, or a question's first word. */
const QUESTION =
  /\?\s*$|^(?:what|what's|whats|when|when's|where|where's|who|who's|whom|whose|why|how|how's|which|is|are|am|was|were|do|does|did|can|could|will|would|should|shall|may|might|has|have|had|any|tell me|explain)\b/i

/** Theirs alone, or a change asked for: not kept. */
const PERSONAL =
  /\b(?:notes?|remind(?:er|ers)?|message|messages|text|email|e-mail|dm|password|my\s+(?:doctor|health|medical|diagnosis|therapist|bank|account|address|phone))\b/i

/** The question as kept, or null when it isn't one to keep. */
export function askedQuestion(text: string): string | null {
  const s = text.replace(/\s+/g, ' ').trim()
  if (s.split(' ').length < 2 || !QUESTION.test(s) || PERSONAL.test(s)) return null
  return s.slice(0, ASKED_MAX)
}
