import * as admin from 'firebase-admin'

/** Firestore rejects a batch over 500 writes. */
const BATCH_LIMIT = 450

/**
 * Every conversation told what it is, and whether it is reported — which
 * the rules read (firestore.rules rooms): a direct message (two people) or
 * a group chat, for rooms from before they said; and `reported`, for those
 * flagged for review before reporting marked it. Run by the deploy
 * (scripts/settleAll). How many were told.
 */
export async function stampRooms(db: admin.firestore.Firestore): Promise<number> {
  const rooms = await db.collection('rooms').get()
  const stale = rooms.docs.flatMap((d) => {
    const r = d.data()
    const members: unknown[] = Array.isArray(r.members) ? r.members : []
    const flagged = Array.isArray(r.reviewers) && r.reviewers.length > 0
    const patch: Record<string, unknown> = {}
    if (r.kind !== 'dm' && r.kind !== 'group') patch.kind = members.length === 2 ? 'dm' : 'group'
    if (typeof r.reported !== 'boolean' || (flagged && !r.reported)) patch.reported = flagged
    return Object.keys(patch).length ? [{ ref: d.ref, patch }] : []
  })
  for (let i = 0; i < stale.length; i += BATCH_LIMIT) {
    const batch = db.batch()
    stale.slice(i, i + BATCH_LIMIT).forEach((x) => batch.update(x.ref, x.patch))
    await batch.commit()
  }
  return stale.length
}
