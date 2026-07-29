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

export interface ReportedAttachment {
  type: 'image' | 'file'
  url: string
  name?: string | null
}

export interface ContentReport {
  id: string
  roomId: string
  messageId: string
  messageText: string
  /** Copied onto the report so a moderator can see what was actually reported. */
  attachment?: ReportedAttachment | null
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
  attachment?: ReportedAttachment | null
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
export interface HiddenMessageSplit<T> {
  visible: T[]
  /** Hidden because their author is blocked. */
  blockedCount: number
  /** Hidden because this specific message was reported, author not blocked. */
  reportedCount: number
}

/**
 * Split a message list into what the viewer may see and why the rest is hidden.
 *
 * The two reasons are counted separately on purpose. Blocking hides everything
 * from a person; reporting hides only the message reported. Collapsing them
 * into one number made a single reported message look like the sender had been
 * blocked, which is a materially different thing to tell someone.
 */
export function partitionHiddenMessages<T extends { uid: string | number; ts: number }>(
  messages: T[],
  blockedUsers: string[] | undefined,
  reportedMessageIds: string[] | undefined
): HiddenMessageSplit<T> {
  const blocked = new Set((blockedUsers ?? []).map(String))
  const reported = new Set(reportedMessageIds ?? [])
  if (blocked.size === 0 && reported.size === 0) {
    return { visible: messages, blockedCount: 0, reportedCount: 0 }
  }

  const visible: T[] = []
  let blockedCount = 0
  let reportedCount = 0
  for (const m of messages) {
    if (blocked.has(String(m.uid))) {
      blockedCount++
    } else if (reported.has(`${m.ts}_${m.uid}`)) {
      reportedCount++
    } else {
      visible.push(m)
    }
  }
  return { visible, blockedCount, reportedCount }
}
