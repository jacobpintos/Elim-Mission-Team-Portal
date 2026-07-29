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

  // ── Security reports: honour the 30-day retention the UI promises ──────────
  // resolveReport() stamps `deleteAt = completedAt + 30 days` and the archive
  // shows "Auto-deletes <date>", but nothing ever acted on it, so resolved
  // reports accumulated indefinitely. These can name individuals and describe
  // incidents involving them, so the stated retention has to be real.
  //
  // Both bounds are on `deleteAt` deliberately: Firestore sorts null before
  // numbers, so a bare `deleteAt <= now` would also match unresolved reports,
  // which carry `deleteAt: null`. The `> 0` bound excludes them.
  const nowMs = Date.now()
  for (;;) {
    const dueSnap = await db
      .collection('securityReports')
      .where('deleteAt', '>', 0)
      .where('deleteAt', '<=', nowMs)
      .limit(400)
      .get()
    if (dueSnap.empty) break

    // Drop any attached photo first — deleting only the document would orphan
    // the image in Storage, where it would outlive the report it belongs to.
    await Promise.all(
      dueSnap.docs.map(async (d) => {
        const photoURL: string | null = d.data().photoURL ?? null
        if (!photoURL) return
        try {
          // Path set by securityStore.createReport()
          await admin.storage().bucket().file(`securityReports/${d.id}/photo`).delete()
        } catch {
          // Already gone — the document still goes, which is the part that
          // carries the incident detail.
        }
      })
    )

    const batch = db.batch()
    dueSnap.docs.forEach((d) => batch.delete(d.ref))
    await batch.commit()
    if (dueSnap.size < 400) break
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
