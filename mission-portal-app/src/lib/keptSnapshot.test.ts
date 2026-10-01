import { describe, it, expect } from 'vitest'
import { initializeApp } from 'firebase/app'
import {
  getFirestore,
  collection,
  doc,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  DocumentReference,
} from 'firebase/firestore'
import { snapshotKey, toKept, fromKept, type Kept } from './keptSnapshot'

const db = getFirestore(initializeApp({ projectId: 'kept-test', apiKey: 'x', appId: 'x' }, 'kept'))

/** A snapshot as Firestore hands one over, near enough. */
const docSnap = (path: string, data: Record<string, unknown> | null) => ({
  ref: { path },
  exists: () => data !== null,
  data: () => data ?? undefined,
})

/** Kept and read back through JSON, as the phone does. */
const roundTrip = (kept: Kept) => JSON.parse(JSON.stringify(kept)) as Kept

describe('snapshotKey', () => {
  it('names a document and a collection by their paths', () => {
    expect(snapshotKey(doc(db, 'users', 'u1'))).toBe('doc:users/u1')
    expect(snapshotKey(collection(db, 'chordSheets'))).toBe('col:chordSheets')
  })

  it('names the same query the same way every time it is built', () => {
    const build = () =>
      query(
        collection(db, 'rooms', 'r1', 'messages'),
        where('members', 'array-contains', 'u1'),
        orderBy('ts', 'desc'),
        limit(30)
      )
    expect(snapshotKey(build())).toBe(snapshotKey(build()))
    expect(snapshotKey(build())).toMatch(/^query:.*rooms\/r1\/messages/)
  })

  it('names different queries differently', () => {
    const base = collection(db, 'securityReports')
    expect(snapshotKey(query(base, where('status', '==', 'resolved')))).not.toBe(
      snapshotKey(query(base, where('status', '==', 'open')))
    )
    expect(snapshotKey(query(base, limit(10)))).not.toBe(snapshotKey(query(base, limit(20))))
  })

  it('has no name for something it does not know', () => {
    expect(snapshotKey({ type: 'aggregate' })).toBeNull()
  })
})

describe('toKept / fromKept', () => {
  it('gives back a document as Firestore would: id, ref, exists, data', () => {
    const kept = roundTrip(toKept(docSnap('users/u1', { displayName: 'Band', roles: ['worship'] })))
    const snap = fromKept(kept, db, null) as unknown as ReturnType<typeof fromKept> & {
      id: string
      ref: DocumentReference
      exists: () => boolean
      data: () => Record<string, unknown>
    }
    expect(snap.id).toBe('u1')
    expect(snap.ref.path).toBe('users/u1')
    expect(snap.exists()).toBe(true)
    expect(snap.data()).toEqual({ displayName: 'Band', roles: ['worship'] })
    expect(snap.metadata.fromCache).toBe(true)
  })

  it('keeps a document that does not exist as one that does not exist', () => {
    const snap = fromKept(roundTrip(toKept(docSnap('users/none', null))), db, null) as {
      exists: () => boolean
      data: () => unknown
    }
    expect(snap.exists()).toBe(false)
    expect(snap.data()).toBeUndefined()
  })

  it('gives back times as Timestamps and references as references, however deep', () => {
    const when = new Timestamp(1767225600, 123000000)
    const kept = roundTrip(
      toKept(
        docSnap('events/e1', {
          createdAt: when,
          days: [{ starts: when }],
          owner: doc(db, 'users', 'u1'),
        })
      )
    )
    const data = (
      fromKept(kept, db, null) as unknown as { data: () => Record<string, unknown> }
    ).data()
    expect(data.createdAt).toBeInstanceOf(Timestamp)
    expect((data.createdAt as Timestamp).toMillis()).toBe(when.toMillis())
    const days = data.days as { starts: Timestamp }[]
    expect(days[0].starts.isEqual(when)).toBe(true)
    expect(data.owner).toBeInstanceOf(DocumentReference)
    expect((data.owner as DocumentReference).path).toBe('users/u1')
  })

  it('gives back a query as Firestore would: docs, size, empty, forEach, each with its ref', () => {
    const kept = roundTrip(
      toKept({
        docs: [
          docSnap('setLists/1', { title: 'Sunday' }),
          docSnap('setLists/2', { title: 'Friday' }),
        ],
      })
    )
    const snap = fromKept(kept, db, 'the query') as unknown as {
      docs: { id: string; ref: DocumentReference; data: () => { title: string } }[]
      size: number
      empty: boolean
      query: unknown
      forEach: (cb: (d: { id: string }) => void) => void
      docChanges: () => { type: string }[]
    }
    expect(snap.docs.map((d) => [d.id, d.data().title])).toEqual([
      ['1', 'Sunday'],
      ['2', 'Friday'],
    ])
    expect(snap.docs[1].ref.path).toBe('setLists/2')
    expect(snap.size).toBe(2)
    expect(snap.empty).toBe(false)
    expect(snap.query).toBe('the query')
    const ids: string[] = []
    snap.forEach((d) => ids.push(d.id))
    expect(ids).toEqual(['1', '2'])
    expect(snap.docChanges().map((c) => c.type)).toEqual(['added', 'added'])
  })

  it('hands out a fresh copy each time, so a screen changing it changes nothing kept', () => {
    const snap = fromKept(
      roundTrip(toKept(docSnap('users/u1', { roles: ['worship'] }))),
      db,
      null
    ) as unknown as {
      data: () => { roles: string[] }
    }
    snap.data().roles.push('admin')
    expect(snap.data().roles).toEqual(['worship'])
  })
})
