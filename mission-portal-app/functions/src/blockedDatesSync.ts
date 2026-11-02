import * as admin from 'firebase-admin'
import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import { logger } from 'firebase-functions'
import {
  blockAnswer,
  blockOf,
  blockedKeys,
  dateOfKey,
  liftAnswer,
  type Answer,
  type Block,
} from './blockedDates'
import { mergeEvent } from './eventPrivate'
import { iowaToday } from './eventRetention'
import type { EventTemplate, Group } from './miriam/data'

if (!admin.apps.length) admin.initializeApp()

type Db = admin.firestore.Firestore
const { FieldPath, FieldValue } = admin.firestore

async function readGroups(db: Db): Promise<Group[]> {
  const snap = await db.collection('groups').get()
  return snap.docs.map((d) => {
    const g = d.data() as { name?: string; members?: unknown[] }
    return { id: d.id, name: String(g.name ?? ''), members: (g.members ?? []).map(String) }
  })
}

/** Blocks not yet over: those whose last day is today or later. */
export async function activeBlocks(db: Db, today = iowaToday()): Promise<Block[]> {
  const snap = await db.collection('blockedDates').where('to', '>=', today).get()
  return snap.docs.flatMap((d) => blockOf(d.id, d.data()) ?? [])
}

type EventRead = {
  ev: EventTemplate & { overrides?: Record<string, Partial<EventTemplate>> }
  seenBy: string[]
}

/** An event as the app reads it — its private record over its own — or null when gone. */
async function readEvent(db: Db, id: string): Promise<EventRead | null> {
  const [open, closed] = await db.getAll(db.doc(`events/${id}`), db.doc(`eventPrivate/${id}`))
  if (!open.exists) return null
  const data = open.data() ?? {}
  const ev = { ...mergeEvent(data, closed.exists ? closed.data() : null), id } as EventRead['ev']
  return { ev, seenBy: Array.isArray(data.seenBy) ? (data.seenBy as string[]) : [] }
}

/**
 * A block's answers written on one event's dates (./blockedDates
 * blockAnswer): each in a transaction of its own, so an answer they give
 * at the same moment is never written over. Told who may see the event,
 * as ./eventPrivateSync stamps its records. How many were written.
 */
async function answerFor(
  db: Db,
  block: Block,
  keys: string[],
  seenBy: string[],
  replace: boolean
): Promise<number> {
  let written = 0
  for (const key of keys) {
    const ref = db.doc(`avail/${key}`)
    const wrote = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref)
      const responses = (snap.data()?.responses ?? {}) as Record<string, Answer>
      const answer = blockAnswer(block, responses[block.uid], replace, Date.now())
      if (!answer) return false
      tx.set(
        ref,
        { responses: { [block.uid]: answer }, updatedAt: FieldValue.serverTimestamp(), seenBy },
        { mergeFields: [new FieldPath('responses', block.uid), 'updatedAt', 'seenBy'] }
      )
      return true
    })
    if (wrote) written++
  }
  return written
}

/**
 * A new block: "Not available" on every event of theirs in its days, from
 * today on — over whatever they had said, which is kept to put back.
 */
export async function applyBlock(db: Db, block: Block, today = iowaToday()): Promise<number> {
  const [events, groups] = await Promise.all([db.collection('events').get(), readGroups(db)])
  let written = 0
  for (const d of events.docs) {
    const read = await readEvent(db, d.id)
    if (!read) continue
    const keys = blockedKeys(read.ev, block, groups, today)
    if (keys.length) written += await answerFor(db, block, keys, read.seenBy, true)
  }
  return written
}

/**
 * One event made, changed, or its teams or groups changed: the blocks of
 * those on it answered for its dates in them — where they have not said
 * otherwise. Quick when nobody has blocked anything off.
 */
export async function applyBlocksToEvent(
  db: Db,
  eventId: string,
  opts: { blocks?: Block[]; groups?: Group[]; today?: string } = {}
): Promise<number> {
  const today = opts.today ?? iowaToday()
  const blocks = opts.blocks ?? (await activeBlocks(db, today))
  if (!blocks.length) return 0
  const read = await readEvent(db, eventId)
  if (!read) return 0
  const groups = opts.groups ?? (await readGroups(db))
  let written = 0
  for (const block of blocks) {
    const keys = blockedKeys(read.ev, block, groups, today)
    if (keys.length) written += await answerFor(db, block, keys, read.seenBy, false)
  }
  return written
}

/**
 * A block removed: its answers, from today on, taken back — what it replaced
 * put back, or cleared — but not one they have changed since. Days gone by
 * are left as they were.
 */
export async function liftBlock(
  db: Db,
  blockId: string,
  uid: string,
  today = iowaToday()
): Promise<number> {
  const snap = await db
    .collection('avail')
    .where(new FieldPath('responses', uid, 'block'), '==', blockId)
    .get()
  let lifted = 0
  for (const d of snap.docs) {
    const day = dateOfKey(d.id)
    if (!day || day < today) continue
    const done = await db.runTransaction(async (tx) => {
      const now = await tx.get(d.ref)
      const existing = (now.data()?.responses ?? {})[uid] as Answer | undefined
      const after = liftAnswer(blockId, existing)
      if (!after) return false
      tx.update(
        d.ref,
        new FieldPath('responses', uid),
        after === 'clear' ? FieldValue.delete() : after,
        'updatedAt',
        FieldValue.serverTimestamp()
      )
      return true
    })
    if (done) lifted++
  }
  return lifted
}

/** Dates blocked off, or a block removed: its answers given, or taken back. */
export const onBlockedDatesWritten = onDocumentWritten('blockedDates/{id}', async (event) => {
  const db = admin.firestore()
  const id = event.params.id
  const before = event.data?.before?.exists ? blockOf(id, event.data.before.data()) : null
  const after = event.data?.after?.exists ? blockOf(id, event.data.after.data()) : null
  if (before && !after) {
    const lifted = await liftBlock(db, id, before.uid)
    logger.info('onBlockedDatesWritten: lifted', { id, lifted })
  } else if (after && !before) {
    const written = await applyBlock(db, after)
    logger.info('onBlockedDatesWritten: applied', { id, written })
  }
})
