import { onSchedule } from 'firebase-functions/v2/scheduler'
import * as admin from 'firebase-admin'

if (!admin.apps.length) admin.initializeApp()

function daysAgoStr(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().split('T')[0]
}

async function batchDelete(refs: FirebaseFirestore.DocumentReference[]): Promise<void> {
  const db = admin.firestore()
  for (let i = 0; i < refs.length; i += 500) {
    const batch = db.batch()
    refs.slice(i, i + 500).forEach((ref) => batch.delete(ref))
    await batch.commit()
  }
}

export const dailyCleanup = onSchedule('0 2 * * *', async () => {
  const db = admin.firestore()
  const toDelete: FirebaseFirestore.DocumentReference[] = []

  // ── Audit log: delete entries older than 6 months ──────────────────────────
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

  let auditSnap = await db
    .collection('auditLog')
    .where('ts', '<', sixMonthsAgo)
    .limit(500)
    .get()
  while (!auditSnap.empty) {
    const batch = db.batch()
    auditSnap.docs.forEach((d) => batch.delete(d.ref))
    await batch.commit()
    auditSnap = await db
      .collection('auditLog')
      .where('ts', '<', sixMonthsAgo)
      .limit(500)
      .get()
  }

  // ── Tasks ───────────────────────────────────────────────────────────────────
  const thirtyDaysAgoStr = daysAgoStr(30)
  const sixtyDaysAgo = new Date()
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

  // Collect completed kaizen and resolved/closed issue IDs for cross-reference
  const [kaizenSnap, issueSnap, tasksSnap] = await Promise.all([
    db.collection('kaizen').where('status', '==', 'completed').get(),
    db.collection('issues').where('status', 'in', ['resolved', 'closed']).get(),
    db.collection('tasks').get(),
  ])

  const completedKaizenIds = new Set(kaizenSnap.docs.map((d) => d.id))
  const resolvedIssueIds = new Set(issueSnap.docs.map((d) => d.id))

  for (const taskDoc of tasksSnap.docs) {
    const t = taskDoc.data()

    // Kaizen-linked: delete when parent kaizen is completed
    if (t.kaizenId && completedKaizenIds.has(String(t.kaizenId))) {
      toDelete.push(taskDoc.ref)
      continue
    }

    // Issue-linked: delete when parent issue is resolved/closed
    if (t.issueId && resolvedIssueIds.has(String(t.issueId))) {
      toDelete.push(taskDoc.ref)
      continue
    }

    // Event-linked with a specific date
    if (t.evDate) {
      if (t.isPostEvent) {
        // Post-event tasks: delete 30 days after their own due date
        if (t.dueDate && t.dueDate < thirtyDaysAgoStr) {
          toDelete.push(taskDoc.ref)
        }
      } else {
        // Pre-event tasks: delete 30 days after the event date
        if (t.evDate < thirtyDaysAgoStr) {
          toDelete.push(taskDoc.ref)
        }
      }
      continue
    }

    // Standalone (or recurring-event tasks with no evDate): delete 60 days after done
    if (t.status === 'done' && t.doneAt) {
      const doneAt: Date = t.doneAt.toDate ? t.doneAt.toDate() : new Date(t.doneAt)
      if (doneAt < sixtyDaysAgo) {
        toDelete.push(taskDoc.ref)
      }
    }
  }

  await batchDelete(toDelete)
})
