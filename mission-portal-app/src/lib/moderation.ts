import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '@/lib/firebase'

export const REPORT_REASONS = [
  'Harassment or bullying',
  'Hate speech',
  'Sexual or explicit content',
  'Violence or threats',
  'Spam or scam',
  'Other',
] as const

export type ReportReason = (typeof REPORT_REASONS)[number]

export interface ContentReport {
  id: string
  roomId: string
  messageId: string
  messageText: string
  messageTs: number
  authorUid: string
  reporterUid: string
  reason: ReportReason
  details: string
  status: 'open' | 'actioned' | 'dismissed'
  createdAt: number
  resolvedBy?: string
  resolvedAt?: number
}

/**
 * File a report about a message. Handled server-side so the reporter does not
 * need read access to the moderation queue and cannot tamper with an existing
 * report.
 */
export async function reportMessage(input: {
  roomId: string
  messageId: string
  messageText: string
  messageTs: number
  authorUid: string
  reason: ReportReason
  details: string
}): Promise<void> {
  const reportContent = httpsCallable(functions, 'reportContent')
  await reportContent(input)
}

/** Hide every message from `blockedUid` for the current user. */
export async function blockUser(uid: string, blockedUid: string): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { blockedUsers: arrayUnion(blockedUid) })
}

export async function unblockUser(uid: string, blockedUid: string): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { blockedUsers: arrayRemove(blockedUid) })
}

/**
 * Filter a message list down to what the viewer is allowed to see: nothing from
 * a user they blocked, and nothing they have already reported.
 */
export function filterHiddenMessages<T extends { uid: string | number; ts: number }>(
  messages: T[],
  blockedUsers: string[] | undefined,
  reportedMessageIds: string[] | undefined
): T[] {
  const blocked = new Set((blockedUsers ?? []).map(String))
  const reported = new Set(reportedMessageIds ?? [])
  if (blocked.size === 0 && reported.size === 0) return messages
  return messages.filter((m) => !blocked.has(String(m.uid)) && !reported.has(`${m.ts}_${m.uid}`))
}
