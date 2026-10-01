import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The native app's offline copy: every Firestore listener and read keeps the
 * server's last answer on the phone and is handed it back with no signal.
 *
 * Firestore's own onSnapshot, getDoc and getDocs are stand-ins driven by hand;
 * everything else of Firestore's is real, so what comes back is checked in
 * the shape screens use. The phone's storage is a Map.
 */

const kept = new Map<string, unknown>()
let readGate: Promise<void> = Promise.resolve()
vi.mock('@/lib/offlineCache', () => ({
  loadOffline: async (key: string) => {
    await readGate
    return kept.get(key) ?? null
  },
  saveOffline: (key: string, value: unknown) => kept.set(key, JSON.parse(JSON.stringify(value))),
  forgetOfflineData: async () => kept.clear(),
}))

type Snap = Record<string, unknown>
const live: {
  args: unknown[]
  next: (s: Snap) => void
  stopped: boolean
}[] = []
const reads = { getDoc: vi.fn(), getDocs: vi.fn() }

vi.mock('firebase/firestore', async (importOriginal) => {
  const real = await importOriginal<typeof import('firebase/firestore')>()
  return {
    ...real,
    onSnapshot: (...args: unknown[]) => {
      const entry = { args, next: args[2] as (s: Snap) => void, stopped: false }
      live.push(entry)
      return () => (entry.stopped = true)
    },
    getDoc: (...a: unknown[]) => reads.getDoc(...a),
    getDocs: (...a: unknown[]) => reads.getDocs(...a),
  }
})

const { initializeApp } = await import('firebase/app')
const { getFirestore, collection, doc, Timestamp } = await import('firebase/firestore')
const db = getFirestore(initializeApp({ projectId: 'live-test', apiKey: 'x', appId: 'x' }, 'live'))
vi.mock('@/lib/firebase', async () => {
  const { initializeApp } = await import('firebase/app')
  const { getFirestore } = await import('firebase/firestore')
  return {
    db: getFirestore(initializeApp({ projectId: 'live-test', apiKey: 'x', appId: 'x' }, 'live-db')),
  }
})

const { onSnapshot, getDoc, getDocs } = await import('./liveFirestore')

const tick = () => new Promise((r) => setTimeout(r, 0))
const sheets = collection(db, 'chordSheets')
const profile = doc(db, 'users', 'u1')

const docOf = (path: string, data: Record<string, unknown> | null) => ({
  ref: { path },
  id: path.split('/').pop(),
  exists: () => data !== null,
  data: () => data ?? undefined,
})
const querySnap = (
  fromCache: boolean,
  docs: { path: string; data: Record<string, unknown> }[]
) => ({
  metadata: { fromCache, hasPendingWrites: false },
  docs: docs.map((d) => docOf(d.path, d.data)),
  empty: docs.length === 0,
  size: docs.length,
})
const docSnap = (fromCache: boolean, data: Record<string, unknown> | null) => ({
  metadata: { fromCache, hasPendingWrites: false },
  ...docOf('users/u1', data),
})
const titles = (s: Snap) =>
  (s.docs as { data: () => { title: string } }[]).map((d) => d.data().title)

/** Keep an answer from the server, as an earlier session would have. */
async function keepFromServer(ref: unknown, snap: Snap) {
  const stop = onSnapshot(ref as never, () => {})
  live[live.length - 1].next(snap)
  stop()
  await tick()
}

beforeEach(() => {
  kept.clear()
  live.length = 0
  readGate = Promise.resolve()
  reads.getDoc.mockReset()
  reads.getDocs.mockReset()
})

describe('listening, native', () => {
  it('opens with the answer kept on the phone, before the server has said anything', async () => {
    await keepFromServer(
      sheets,
      querySnap(false, [{ path: 'chordSheets/1', data: { title: 'Holy Forever' } }])
    )
    const seen: Snap[] = []
    onSnapshot(sheets, (s) => seen.push(s as never))
    await tick()
    expect(seen.map(titles)).toEqual([['Holy Forever']])
    expect((seen[0].metadata as { fromCache: boolean }).fromCache).toBe(true)
  })

  it("keeps showing it when Firestore, offline with no cache of its own, says there's nothing", async () => {
    await keepFromServer(
      sheets,
      querySnap(false, [{ path: 'chordSheets/1', data: { title: 'Holy Forever' } }])
    )
    const seen: Snap[] = []
    onSnapshot(sheets, (s) => seen.push(s as never))
    await tick()
    live[live.length - 1].next(querySnap(true, []))
    expect(seen.map(titles)).toEqual([['Holy Forever']])
  })

  it("keeps a signed-in user's profile rather than reporting there is none", async () => {
    await keepFromServer(profile, docSnap(false, { displayName: 'Band' }))
    const seen: Snap[] = []
    onSnapshot(profile, (s) => seen.push(s as never))
    await tick()
    live[live.length - 1].next(docSnap(true, null))
    expect(seen).toHaveLength(1)
    expect((seen[0] as { data: () => { displayName: string } }).data().displayName).toBe('Band')
  })

  it("hands on the server's answer when it comes, and keeps that one", async () => {
    await keepFromServer(
      sheets,
      querySnap(false, [{ path: 'chordSheets/1', data: { title: 'Old' } }])
    )
    const seen: Snap[] = []
    onSnapshot(sheets, (s) => seen.push(s as never))
    await tick()
    live[live.length - 1].next(
      querySnap(false, [{ path: 'chordSheets/2', data: { title: 'New' } }])
    )
    expect(seen.map(titles)).toEqual([['Old'], ['New']])
    await tick()
    const again: Snap[] = []
    onSnapshot(sheets, (s) => again.push(s as never))
    await tick()
    expect(again.map(titles)).toEqual([['New']])
  })

  it('a deletion on the server empties the list, and is kept empty', async () => {
    await keepFromServer(
      sheets,
      querySnap(false, [{ path: 'chordSheets/1', data: { title: 'Old' } }])
    )
    const seen: Snap[] = []
    onSnapshot(sheets, (s) => seen.push(s as never))
    await tick()
    live[live.length - 1].next(querySnap(false, []))
    expect(seen.map(titles)).toEqual([['Old'], []])
  })

  it("does not keep Firestore's own offline answer as if it were the server's", async () => {
    onSnapshot(sheets, () => {})
    await tick()
    live[0].next(querySnap(true, [{ path: 'chordSheets/9', data: { title: 'Partial' } }]))
    expect(kept.size).toBe(0)
  })

  it("with nothing kept, passes Firestore's own answer on — once the phone has been checked", async () => {
    let open!: () => void
    readGate = new Promise((r) => (open = r))
    const seen: Snap[] = []
    onSnapshot(sheets, (s) => seen.push(s as never))
    live[0].next(querySnap(true, []))
    expect(seen).toHaveLength(0)
    open()
    await tick()
    expect(seen.map(titles)).toEqual([[]])
  })

  it('a kept answer read after the server has spoken does not replace what it said', async () => {
    await keepFromServer(
      sheets,
      querySnap(false, [{ path: 'chordSheets/1', data: { title: 'Old' } }])
    )
    let open!: () => void
    readGate = new Promise((r) => (open = r))
    const seen: Snap[] = []
    onSnapshot(sheets, (s) => seen.push(s as never))
    live[live.length - 1].next(
      querySnap(false, [{ path: 'chordSheets/2', data: { title: 'Live' } }])
    )
    open()
    await tick()
    expect(seen.map(titles)).toEqual([['Live']])
  })

  it('once the server has spoken, offline answers pass through — a change made since shows', async () => {
    const seen: Snap[] = []
    onSnapshot(sheets, (s) => seen.push(s as never))
    await tick()
    live[0].next(querySnap(false, [{ path: 'chordSheets/1', data: { title: 'A' } }]))
    live[0].next(querySnap(true, [{ path: 'chordSheets/1', data: { title: 'A, edited offline' } }]))
    expect(seen.map(titles)).toEqual([['A'], ['A, edited offline']])
  })

  it('says nothing to a screen that has already closed', async () => {
    await keepFromServer(
      sheets,
      querySnap(false, [{ path: 'chordSheets/1', data: { title: 'Old' } }])
    )
    const seen: Snap[] = []
    const stop = onSnapshot(sheets, (s) => seen.push(s as never))
    stop()
    await tick()
    expect(seen).toHaveLength(0)
    expect(live[live.length - 1].stopped).toBe(true)
  })

  it('takes the observer form and options, and passes errors on', async () => {
    const seen: Snap[] = []
    const errors: Error[] = []
    onSnapshot(
      sheets,
      { includeMetadataChanges: true },
      {
        next: (s) => seen.push(s as never),
        error: (e) => errors.push(e),
      }
    )
    expect(live[0].args[1]).toEqual({ includeMetadataChanges: true })
    live[0].next(querySnap(false, []))
    ;(live[0].args[3] as (e: Error) => void)(new Error('permission-denied'))
    expect(seen).toHaveLength(1)
    expect(errors.map((e) => e.message)).toEqual(['permission-denied'])
  })

  it('gives times back as Timestamps', async () => {
    const at = new Timestamp(1767225600, 0)
    await keepFromServer(profile, docSnap(false, { lastLoginAt: at }))
    const seen: Snap[] = []
    onSnapshot(profile, (s) => seen.push(s as never))
    await tick()
    const data = (seen[0] as { data: () => { lastLoginAt: InstanceType<typeof Timestamp> } }).data()
    expect(data.lastLoginAt.toMillis()).toBe(at.toMillis())
  })
})

describe('reading once, native', () => {
  it("keeps what getDoc reads, and answers from it when there's no signal", async () => {
    reads.getDoc.mockResolvedValueOnce(docSnap(false, { title: 'Music' }))
    await getDoc(profile)
    reads.getDoc.mockRejectedValueOnce(
      new Error('Failed to get document because the client is offline.')
    )
    const snap = await getDoc(profile)
    expect(snap.data()).toEqual({ title: 'Music' })
  })

  it('fails as before when there is nothing kept', async () => {
    reads.getDoc.mockRejectedValueOnce(new Error('offline'))
    await expect(getDoc(profile)).rejects.toThrow('offline')
  })

  it("answers getDocs from what was kept when Firestore's offline answer is all there is", async () => {
    reads.getDocs.mockResolvedValueOnce(
      querySnap(false, [{ path: 'chordSheets/1', data: { title: 'A' } }])
    )
    await getDocs(sheets)
    reads.getDocs.mockResolvedValueOnce(querySnap(true, []))
    expect(titles((await getDocs(sheets)) as never)).toEqual(['A'])
  })
})
