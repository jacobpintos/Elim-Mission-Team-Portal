/**
 * The organization these functions serve: its names and its clock. One
 * organization for now, The Well of Iowa. The app's own copy of who it is
 * is in src/custom (the organization's profile), and a test there keeps the
 * two the same (src/lib/orgProfile.test.ts).
 *
 * At Stage 2, when partner churches join (docs/ROADMAP.md), each will have its
 * own of these, kept with its data: the nightly jobs will then run for each
 * organization at its own midnight rather than at one fixed time zone.
 */
export const ORG = {
  id: 'thewell',
  name: 'The Well',
  fullName: 'The Well of Iowa',
  /** When its days begin and end. */
  timeZone: 'America/Chicago',
  /** Where post reaches it, at the foot of its emails. */
  mailingAddress: 'P.O. Box 552, North Liberty, IA 52317',
} as const

/** The time zone the scheduled jobs run in, and in which "today" is decided. */
export const ORG_TIME_ZONE = ORG.timeZone

/** Today where the organization is, as YYYY-MM-DD. */
export function todayInOrg(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: ORG_TIME_ZONE })
}
