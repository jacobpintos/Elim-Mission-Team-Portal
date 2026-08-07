import { logger } from 'firebase-functions'
import * as admin from 'firebase-admin'
import { resend, MAIL_FROM } from '../email/client'
import { sendExpoPush, type InterruptionLevel } from './expoPush'

if (!admin.apps.length) admin.initializeApp()

export type NotificationType =
  | 'newAssignment'
  | 'newMessage'
  | 'eventReminder'
  | 'announcement'
  | 'issueAssigned'
  | 'eventRsvp'
  | 'taskComplete'
  | 'eventJoin'
  | 'eventRemoved'
  | 'worshipSetAssigned'
  | 'taskDueSoon'
  | 'rsvpNonAvailable'
  | 'kaizenSubmission'
  | 'issueSubmission'
  | 'eventHealthBehind'
  | 'chatFlagged'
  | 'securityReport'
  | 'weatherAlertAdmin'
  | 'eventLogistics'
  | 'flightReminder'
  | 'foodSignupOpen'
  | 'foodSignupReminder'

/**
 * Notification types the user asked to be "bulk" (starred in their spec):
 * the FIRST occurrence for a user sends a push immediately and opens a
 * refractory window; any further occurrences of ANY batched type during
 * that window still write to the in-app notifs list immediately, but are
 * queued instead of pushed. When the window elapses, flushDueBatches()
 * (run on a schedule) sends ONE summary push for everything queued.
 */
export const BATCHED_TYPES = new Set<NotificationType>([
  'eventJoin',
  'newAssignment',
  'taskDueSoon',
  'worshipSetAssigned',
  'rsvpNonAvailable',
  'kaizenSubmission',
  'issueSubmission',
  'weatherAlertAdmin',
  // Food sign-ups arrive in bursts — one per invitee when an event opens, and
  // again on the three-day nudge — and none of them is urgent.
  'foodSignupOpen',
  'foodSignupReminder',
])

// How long a user's batch window stays open after the first push in it.
export const BATCH_WINDOW_MS = 20 * 60 * 1000 // 20 minutes

/**
 * Does this user answer security reports?
 *
 * Mirrors isSecurity() in src/lib/roles.ts — admins count, because they are the
 * escalation path when nobody holding the security role picks it up. functions/
 * is a separate TypeScript project and cannot import from the app, so the two
 * have to be kept in step by hand.
 */
export function isSecurityUser(roles: unknown): boolean {
  return Array.isArray(roles) && (roles.includes('security') || roles.includes('admin'))
}

/**
 * Whether a notification is allowed to break through the recipient's Focus.
 *
 * Deliberately narrow. Only an incident report, and only for the people whose
 * job is to answer one — everything else in the app can wait for someone to
 * pick up their phone, and a notification that cries wolf gets the whole app
 * muted in Settings.
 *
 * On by default rather than opt-in: a responder who never finds the setting
 * should still be reachable. Anyone who does not want it turns
 * securityReportUrgent off and drops back to an ordinary notification.
 *
 * This does NOT ring through the physical mute switch — only Apple's
 * critical-alerts entitlement does that, and it is granted case by case. If
 * that is ever obtained, this is the one line that changes.
 */
export function interruptionLevelFor(
  type: NotificationType,
  profile: { roles?: unknown; notificationPrefs?: Record<string, unknown> } | undefined
): InterruptionLevel | undefined {
  if (type !== 'securityReport') return undefined
  if (!profile || !isSecurityUser(profile.roles)) return undefined
  if (profile.notificationPrefs?.securityReportUrgent === false) return undefined
  return 'time-sensitive'
}

function nanoid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

/** Extract a usable Expo push token whether pushTokens.<platform> is stored
 * as a flat string (the actual shape registerPushToken.ts writes) or as an
 * object (the shape UserProfile's TS type claims) — mirrors the defensive
 * handling already used in publicNotifications.ts. */
function extractTokens(pushTokens: unknown): string[] {
  if (!pushTokens || typeof pushTokens !== 'object') return []
  const tokens: string[] = []
  for (const val of Object.values(pushTokens as Record<string, unknown>)) {
    const token = typeof val === 'string' ? val : (val as { token?: string } | null)?.token
    if (token && token.startsWith('ExponentPushToken')) tokens.push(token)
  }
  return tokens
}

export function inAppMessage(type: NotificationType, data: Record<string, unknown>): string {
  switch (type) {
    case 'newAssignment':
      return `You've been assigned a task: ${data.taskTitle ?? 'New task'}`
    case 'eventRsvp':
      return `${data.userName ?? 'Someone'} RSVP'd for ${data.eventTitle ?? 'an event'}`
    case 'taskComplete':
      return `Task completed: ${data.taskTitle ?? 'A task'}`
    case 'newMessage':
      return `New message in ${data.roomName ?? 'a room'}${data.senderName ? ` from ${data.senderName}` : ''}`
    case 'eventReminder':
      return `Reminder: ${data.eventTitle ?? 'An event'} is coming up`
    case 'announcement':
      return `New announcement: ${data.title ?? ''}`
    case 'issueAssigned':
      return `An issue was assigned to you: ${data.title ?? ''}`
    case 'eventJoin':
      return `You've been added to ${data.eventTitle ?? 'an event'}`
    case 'eventRemoved':
      return `You've been removed from ${data.eventTitle ?? 'an event'}`
    case 'worshipSetAssigned':
      return `A worship set list was assigned to ${data.eventTitle ?? 'an event'}: ${data.setListTitle ?? ''}`
    case 'taskDueSoon':
      return data.dueToday
        ? `Task due today: ${data.taskTitle ?? 'A task'}`
        : `Task due in 1 week: ${data.taskTitle ?? 'A task'}`
    case 'rsvpNonAvailable':
      return `${data.userName ?? 'Someone'} responded ${data.statusLabel ?? 'not available'} for ${data.eventTitle ?? 'an event'}`
    case 'kaizenSubmission':
      return `New Kaizen idea submitted: ${data.title ?? ''}`
    case 'issueSubmission':
      return `New issue submitted: ${data.title ?? ''}`
    case 'eventHealthBehind':
      return `${data.eventTitle ?? 'An event'} has fallen behind schedule`
    case 'chatFlagged':
      return `Chat "${data.roomName ?? ''}" was flagged for review`
    case 'securityReport':
      return String(data.message ?? 'Security report update')
    case 'weatherAlertAdmin':
      return `${data.alertEvent ?? 'Weather alert'} for ${data.eventTitle ?? 'an event'}: ${data.headline ?? ''}`
    case 'eventLogistics':
      return `${data.itemLabel ?? 'A travel detail'} was assigned to you for ${data.eventTitle ?? 'an event'}`
    case 'foodSignupOpen':
      return `${data.eventTitle ?? 'An event'} has a food sign-up — pick what you'll bring`
    case 'foodSignupReminder':
      return `${data.openCount ?? 'Some'} food items are still unclaimed for ${data.eventTitle ?? 'an event'}`
    case 'flightReminder':
      return `Your ${data.legLabel ?? 'flight'} for ${data.eventTitle ?? 'an event'} departs at ${data.departsAt ?? 'soon'}`
    default:
      return 'New notification from Mission Portal'
  }
}

function subjectFor(type: NotificationType, _data: Record<string, unknown>): string {
  const subjects: Record<NotificationType, string> = {
    newAssignment: 'You have a new assignment — Mission Portal',
    newMessage: 'New message — Mission Portal',
    eventReminder: 'Event reminder — Mission Portal',
    announcement: 'New announcement — Mission Portal',
    issueAssigned: 'An issue was assigned to you — Mission Portal',
    eventRsvp: 'RSVP confirmation — Mission Portal',
    taskComplete: 'Task completed — Mission Portal',
    eventJoin: "You've been added to an event — Mission Portal",
    eventRemoved: "You've been removed from an event — Mission Portal",
    worshipSetAssigned: 'New worship set list — Mission Portal',
    taskDueSoon: 'Task due soon — Mission Portal',
    rsvpNonAvailable: 'RSVP response — Mission Portal',
    kaizenSubmission: 'New Kaizen submission — Mission Portal',
    issueSubmission: 'New issue submission — Mission Portal',
    eventHealthBehind: 'Event health alert — Mission Portal',
    chatFlagged: 'Chat flagged — Mission Portal',
    eventLogistics: 'Travel details assigned — Mission Portal',
    flightReminder: 'Flight reminder — Mission Portal',
    foodSignupOpen: 'Food sign-up open — Mission Portal',
    foodSignupReminder: 'Food items still open — Mission Portal',
    securityReport: 'Security report — Mission Portal',
    weatherAlertAdmin: 'Weather alert — Mission Portal',
  }
  return subjects[type] ?? 'Mission Portal notification'
}

function bodyFor(type: NotificationType, data: Record<string, unknown>): string {
  return `
    <p>You have a new notification from Mission Portal.</p>
    <p><strong>${inAppMessage(type, data)}</strong></p>
    <hr>
    <p style="color: #888; font-size: 12px;">
      You're receiving this because you have email notifications enabled for this event type.
      <br>
      <a href="#">Manage notification preferences</a>
    </p>
  `
}

interface DeliverOptions {
  /** Skip the push/email send — used for batched types arriving mid-window,
   * which still need to land in the in-app list right away. */
  suppressPush?: boolean
}

/**
 * Core delivery: always writes the in-app notifs/{uid} entry; conditionally
 * emails/pushes per the user's notificationPrefs, unless suppressPush is set
 * (the batched-mid-window case, where push is deferred to the next flush).
 */
export async function deliverNotification(
  uid: string,
  type: NotificationType,
  data: Record<string, unknown>,
  options: DeliverOptions = {}
): Promise<void> {
  const db = admin.firestore()
  const userSnap = await db.doc(`users/${uid}`).get()
  const profile = userSnap.data()
  if (!profile) return

  const prefs = profile.notificationPrefs?.[type]
  const notifMsg = inAppMessage(type, data)

  await db.doc(`notifs/${uid}`).set(
    {
      items: admin.firestore.FieldValue.arrayUnion({
        id: nanoid(),
        msg: notifMsg,
        ts: Date.now(),
        type,
        read: false,
      }),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  )

  if (options.suppressPush) return

  if (prefs?.email && profile.email) {
    try {
      await resend().emails.send({
        from: MAIL_FROM.value(),
        to: profile.email as string,
        subject: subjectFor(type, data),
        html: bodyFor(type, data),
      })
    } catch (err) {
      logger.error('Email send failed', err)
    }
  }

  if (prefs?.push) {
    const tokens = extractTokens(profile.pushTokens)
    if (tokens.length > 0) {
      try {
        await sendExpoPush(
          tokens,
          subjectFor(type, data),
          notifMsg,
          {
            type,
            ...Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v ?? '')])),
          },
          { interruptionLevel: interruptionLevelFor(type, profile) }
        )
      } catch (err) {
        logger.error('Push send failed', err)
      }
    }
  }
}

/**
 * Single entry point every trigger should call. Transparently routes through
 * the batching engine for BATCHED_TYPES; everything else delivers immediately.
 */
export async function notifyUser(
  uid: string,
  type: NotificationType,
  data: Record<string, unknown> = {}
): Promise<void> {
  if (!BATCHED_TYPES.has(type)) {
    await deliverNotification(uid, type, data)
    return
  }

  const db = admin.firestore()
  const batchRef = db.doc(`notifBatches/${uid}`)
  const now = Date.now()

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(batchRef)
    const state = snap.data() as { windowEndAt?: number; pending?: Array<Record<string, unknown>> } | undefined
    const windowActive = !!state?.windowEndAt && state.windowEndAt > now

    if (!windowActive) {
      // Fresh window: send the real push/email now, open a new window.
      tx.set(batchRef, { windowEndAt: now + BATCH_WINDOW_MS, pending: [] })
    } else {
      // Mid-window: queue a short summary of this item; no push yet.
      tx.set(
        batchRef,
        {
          pending: admin.firestore.FieldValue.arrayUnion({
            type,
            summary: inAppMessage(type, data),
            ts: now,
          }),
        },
        { merge: true }
      )
    }
  })

  // Re-read to decide whether THIS call should deliver a real push (only the
  // call that just opened the window does) — the transaction above already
  // committed the window-open state, so a plain get is sufficient here.
  const after = (await batchRef.get()).data() as { windowEndAt?: number } | undefined
  const justOpenedWindow = after?.windowEndAt === now + BATCH_WINDOW_MS
  await deliverNotification(uid, type, data, { suppressPush: !justOpenedWindow })
}

/** Runs on a schedule: sends one summary push per user whose batch window
 * has elapsed and has queued items, then closes the window. */
export async function flushDueBatches(): Promise<void> {
  const db = admin.firestore()
  const now = Date.now()
  const snap = await db.collection('notifBatches').where('windowEndAt', '<=', now).get()

  for (const doc of snap.docs) {
    const data = doc.data() as { pending?: Array<{ type: string; summary: string; ts: number }> }
    const pending = data.pending ?? []
    if (pending.length === 0) {
      await doc.ref.delete()
      continue
    }

    const uid = doc.id
    const userSnap = await db.doc(`users/${uid}`).get()
    const profile = userSnap.data()
    if (profile) {
      const tokens = extractTokens(profile.pushTokens)
      if (tokens.length > 0) {
        const title =
          pending.length === 1 ? 'Mission Portal' : `Mission Portal — ${pending.length} updates`
        const body =
          pending.length <= 3
            ? pending.map((p) => p.summary).join('\n')
            : `${pending
                .slice(0, 2)
                .map((p) => p.summary)
                .join('\n')}\n…and ${pending.length - 2} more`
        try {
          await sendExpoPush(tokens, title, body, { type: 'batchSummary' })
        } catch (err) {
          logger.error('Batch flush push failed', err)
        }
      }
    }

    await doc.ref.delete()
  }
}
