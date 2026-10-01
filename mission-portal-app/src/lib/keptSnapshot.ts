import { DocumentReference, Timestamp, doc, type Firestore } from 'firebase/firestore'

/**
 * Firestore results as plain data to keep on the device, and back.
 *
 * The native app's offline copy (liveFirestore.ts): every listener and read
 * keeps the last answer the server gave, and with no signal is handed that
 * answer back in the shape Firestore gives — docs, data(), exists(), ref,
 * metadata — so no screen needs to know where it came from.
 *
 * Pure, so it can be tested without a device.
 */

/** A value Firestore hands back that JSON would lose: a time, or a reference. */
type Tagged = { __kept: 'ts'; s: number; ns: number } | { __kept: 'ref'; path: string }

export interface KeptDoc {
  path: string
  exists: boolean
  data: unknown
}

export type Kept = { kind: 'doc'; doc: KeptDoc } | { kind: 'query'; docs: KeptDoc[] }

/** The shape of a Firestore reference or query this needs. */
interface RefLike {
  type: string
  path?: string
  _query?: unknown
}

/**
 * The name a listener's answer is kept under: the document or collection's
 * path, or for a query, the query itself spelled out — the same query from
 * the same screen gets the same name each time the app opens.
 *
 * A query is spelled out from Firestore's own description of it, which is not
 * a public interface: if a later version changes it, the names change and the
 * copies kept under the old ones are simply not found. Null when there is no
 * name to give, and that listener goes uncopied.
 */
export function snapshotKey(ref: RefLike): string | null {
  try {
    if (ref.type === 'document') return `doc:${ref.path}`
    if (ref.type === 'collection') return `col:${ref.path}`
    if (ref.type === 'query' && ref._query) {
      return (
        'query:' +
        JSON.stringify(ref._query, function (name, value) {
          if (name.startsWith('memoized')) return undefined
          if (value && typeof value.canonicalString === 'function') return value.canonicalString()
          return value
        })
      )
    }
  } catch {
    // Nothing to name it by.
  }
  return null
}

function pack(value: unknown): unknown {
  if (value instanceof Timestamp) {
    return { __kept: 'ts', s: value.seconds, ns: value.nanoseconds } satisfies Tagged
  }
  if (value instanceof DocumentReference)
    return { __kept: 'ref', path: value.path } satisfies Tagged
  if (Array.isArray(value)) return value.map(pack)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, pack(v)]))
  }
  return value
}

function unpack(value: unknown, db: Firestore): unknown {
  if (Array.isArray(value)) return value.map((v) => unpack(v, db))
  if (value && typeof value === 'object') {
    const tagged = value as Partial<Tagged> & Record<string, unknown>
    if (tagged.__kept === 'ts') return new Timestamp(tagged.s as number, tagged.ns as number)
    if (tagged.__kept === 'ref') return doc(db, tagged.path as string)
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, unpack(v, db)]))
  }
  return value
}

interface DocSnapLike {
  ref: { path: string }
  exists(): boolean
  data(): unknown
}

function keepDoc(snap: DocSnapLike): KeptDoc {
  const exists = snap.exists()
  return { path: snap.ref.path, exists, data: exists ? pack(snap.data()) : null }
}

/** A snapshot from the server, as data to keep. */
export function toKept(snap: DocSnapLike | { docs: DocSnapLike[] }): Kept {
  return 'docs' in snap
    ? { kind: 'query', docs: snap.docs.map(keepDoc) }
    : { kind: 'doc', doc: keepDoc(snap) }
}

const METADATA = {
  fromCache: true,
  hasPendingWrites: false,
  isEqual: (other: { fromCache: boolean; hasPendingWrites: boolean }) =>
    other.fromCache && !other.hasPendingWrites,
}

function docSnapshot(kept: KeptDoc, db: Firestore) {
  const ref = doc(db, kept.path)
  // A fresh copy each call, as Firestore gives: a screen that changes what it
  // was handed does not change what is kept.
  const data = () => (kept.exists ? (unpack(kept.data, db) as Record<string, unknown>) : undefined)
  return {
    id: ref.id,
    ref,
    metadata: METADATA,
    exists: () => kept.exists,
    data,
    get: (field: string) => data()?.[field],
  }
}

/** What was kept, as the snapshot Firestore would have given. */
export function fromKept(kept: Kept, db: Firestore, query: unknown) {
  if (kept.kind === 'doc') return docSnapshot(kept.doc, db)
  const docs = kept.docs.map((d) => docSnapshot(d, db))
  return {
    docs,
    size: docs.length,
    empty: docs.length === 0,
    metadata: METADATA,
    query,
    forEach: (callback: (d: (typeof docs)[number]) => void) => docs.forEach(callback),
    docChanges: () =>
      docs.map((d, newIndex) => ({ type: 'added' as const, doc: d, oldIndex: -1, newIndex })),
  }
}
