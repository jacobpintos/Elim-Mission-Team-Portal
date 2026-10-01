import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The native app's offline copy (offlineCache.ts): each store starts from the
 * copy kept on the phone, keeps it when Firestore — offline, with nothing of
 * its own to go on — reports "nothing here", and keeps the copy up to date
 * from what the server sends.
 *
 * Firestore and the device storage are stand-ins: the listener callbacks are
 * captured and driven by hand, and the kept copies live in a Map.
 */

const kept = new Map<string, unknown>()
let held: Promise<void> = Promise.resolve()
vi.mock('@/lib/offlineCache', () => ({
  loadOffline: async (key: string) => {
    await held
    return kept.get(key) ?? null
  },
  saveOffline: (key: string, value: unknown) => kept.set(key, value),
  forgetOfflineData: async () => kept.clear(),
}))

type Snap = {
  metadata: { fromCache: boolean }
  empty?: boolean
  docs?: { id: string; data: () => unknown }[]
  exists?: () => boolean
  data?: () => unknown
}
const listeners: Record<string, (snap: Snap) => void> = {}
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, name: string) => name,
  doc: (_db: unknown, ...path: string[]) => path.join('/'),
  onSnapshot: (ref: string, next: (snap: Snap) => void) => {
    listeners[ref] = next
    return () => delete listeners[ref]
  },
  setDoc: vi.fn(),
  updateDoc: vi.fn(async () => {}),
  deleteDoc: vi.fn(),
  serverTimestamp: () => null,
}))
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }))
vi.mock('@/lib/counters', () => ({ nextId: async () => 1 }))

let authListener: (user: unknown) => void = () => {}
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_auth: unknown, cb: (user: unknown) => void) => {
    authListener = cb
    return () => {}
  },
  signOut: vi.fn(async () => {}),
  signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  sendEmailVerification: vi.fn(),
}))
vi.mock('@/lib/notifications', () => ({
  registerForPushNotifications: async () => null,
  persistPushToken: async () => {},
  clearPushToken: async () => {},
  platformKey: () => 'web',
}))

const { useChordSheetsStore } = await import('./chordSheetsStore')
const { useWorshipStore } = await import('./worshipStore')
const { useAuthStore } = await import('./authStore')

const tick = () => new Promise((r) => setTimeout(r, 0))
const sheet = (id: string, title: string) => ({
  id,
  data: () => ({ title, sections: [], createdBy: 'u' }),
})
const collectionSnap = (fromCache: boolean, docs: ReturnType<typeof sheet>[]): Snap => ({
  metadata: { fromCache },
  empty: docs.length === 0,
  docs,
})

beforeEach(() => {
  kept.clear()
  held = Promise.resolve()
  useChordSheetsStore.setState({ chordSheets: [], loading: false, _unsub: null, _refCount: 0 })
  useWorshipStore.setState({ setLists: [], loading: false, _unsub: null, _refCount: 0 })
})

describe('chord sheets offline', () => {
  it('opens with the sheets kept on the phone, before the server answers', async () => {
    kept.set('chordSheets', [{ id: '1', title: 'Kept', sections: [] }])
    useChordSheetsStore.getState().subscribe()
    await tick()
    const s = useChordSheetsStore.getState()
    expect(s.chordSheets.map((c) => c.title)).toEqual(['Kept'])
    expect(s.loading).toBe(false)
  })

  it('keeps them when Firestore, offline, says there are none', async () => {
    kept.set('chordSheets', [{ id: '1', title: 'Kept', sections: [] }])
    useChordSheetsStore.getState().subscribe()
    await tick()
    listeners.chordSheets(collectionSnap(true, []))
    expect(useChordSheetsStore.getState().chordSheets.map((c) => c.title)).toEqual(['Kept'])
  })

  it("takes the server's sheets over them, and keeps those for next time", async () => {
    kept.set('chordSheets', [{ id: '1', title: 'Kept', sections: [] }])
    useChordSheetsStore.getState().subscribe()
    await tick()
    listeners.chordSheets(collectionSnap(false, [sheet('2', 'Live')]))
    expect(useChordSheetsStore.getState().chordSheets.map((c) => c.title)).toEqual(['Live'])
    expect((kept.get('chordSheets') as { title: string }[]).map((c) => c.title)).toEqual(['Live'])
  })

  it("does not keep Firestore's own cached copy as if it came from the server", async () => {
    useChordSheetsStore.getState().subscribe()
    listeners.chordSheets(collectionSnap(true, [sheet('3', 'Cached')]))
    expect(kept.has('chordSheets')).toBe(false)
  })

  it('a kept copy read after the server has answered does not replace the answer', async () => {
    kept.set('chordSheets', [{ id: '1', title: 'Old', sections: [] }])
    let go!: () => void
    held = new Promise((r) => (go = r))
    useChordSheetsStore.getState().subscribe()
    listeners.chordSheets(collectionSnap(false, [sheet('2', 'Live')]))
    go()
    await tick()
    expect(useChordSheetsStore.getState().chordSheets.map((c) => c.title)).toEqual(['Live'])
  })

  it('a deletion on the server still empties the list', async () => {
    kept.set('chordSheets', [{ id: '1', title: 'Kept', sections: [] }])
    useChordSheetsStore.getState().subscribe()
    await tick()
    listeners.chordSheets(collectionSnap(false, []))
    expect(useChordSheetsStore.getState().chordSheets).toEqual([])
  })
})

describe('set lists offline', () => {
  it('opens with the set lists kept on the phone and keeps them offline', async () => {
    kept.set('setLists', [{ id: '1', title: 'Sunday', songs: [] }])
    useWorshipStore.getState().subscribe()
    await tick()
    expect(useWorshipStore.getState().setLists.map((s) => s.title)).toEqual(['Sunday'])
    listeners.setLists(collectionSnap(true, []))
    expect(useWorshipStore.getState().setLists.map((s) => s.title)).toEqual(['Sunday'])
  })
})

describe('signed in, offline', () => {
  const user = { uid: 'u1', emailVerified: true }
  const profile = { uid: 'u1', displayName: 'Band', roles: ['worship'] }
  const docSnap = (fromCache: boolean, data: unknown): Snap => ({
    metadata: { fromCache },
    exists: () => data != null,
    data: () => data,
  })

  it('opens with the profile kept on the phone instead of sending them to sign in', async () => {
    kept.set('profile:u1', profile)
    useAuthStore.getState().init()
    authListener(user)
    await tick()
    expect(useAuthStore.getState().profile?.displayName).toBe('Band')
    expect(useAuthStore.getState().loading).toBe(false)
    // Firestore, offline with nothing cached, reports no profile: not news.
    listeners['users/u1'](docSnap(true, null))
    expect(useAuthStore.getState().profile?.displayName).toBe('Band')
  })

  it('keeps the profile the server sends for next time', async () => {
    useAuthStore.getState().init()
    authListener(user)
    listeners['users/u1'](docSnap(false, { ...profile, displayName: 'Live' }))
    expect(useAuthStore.getState().profile?.displayName).toBe('Live')
    expect((kept.get('profile:u1') as { displayName: string }).displayName).toBe('Live')
  })

  it('signing out forgets everything kept', async () => {
    kept.set('profile:u1', profile)
    kept.set('chordSheets', [])
    await useAuthStore.getState().signOutNow()
    expect(kept.size).toBe(0)
  })
})
