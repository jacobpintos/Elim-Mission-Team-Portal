import { create } from 'zustand'
import { collection, onSnapshot } from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'
import { db, auth } from '@/lib/firebase'
import { sameId } from '@/lib/ids'
import { mergeUsers } from '@/lib/userDirectory'
import type { PublicProfile, UserProfile } from '@/types/user'

/**
 * Who everyone is.
 *
 * Two sources, because one collection cannot serve both readers. `users` holds
 * push tokens, emails, locations, block lists and report history, so its rules
 * admit only its owner and admins — and a collection query is refused outright
 * when it could return a document the caller may not read, rather than being
 * filtered down. So every non-admin's listener was denied, `users` stayed
 * empty, and displayName() fell through to the raw uid. That is what members
 * saw wherever a name belonged: team rosters, message authors, assignments.
 *
 * `publicProfiles` answers only "who is this uid?" and any signed-in user may
 * read it. It is mirrored from `users` by mirrorPublicProfile.
 *
 * Both feed the one `users` array the app reads. An admin gets full records;
 * everyone else gets entries carrying uid, displayName and photoURL and
 * nothing else — which is all the screens that render a name ever touch.
 * Callers that need roles or email are admin screens, and they had an empty
 * array before this, so no reader loses anything it used to have.
 */

interface UsersStore {
  users: UserProfile[]
  loading: boolean
  _full: UserProfile[]
  _directory: PublicProfile[]
  _unsub: (() => void) | null
  _dirUnsub: (() => void) | null
  _authUnsub: (() => void) | null
  _refCount: number
  subscribe: () => void
  unsubscribe: () => void
  getUser: (uid: string | number) => UserProfile | undefined
  displayName: (uid: string | number) => string
}

export const useUsersStore = create<UsersStore>((set, get) => ({
  users: [],
  loading: false,
  _full: [],
  _directory: [],
  _unsub: null,
  _dirUnsub: null,
  _authUnsub: null,
  _refCount: 0,

  subscribe: () => {
    const { _refCount, _authUnsub } = get()
    set({ _refCount: _refCount + 1 })
    if (_authUnsub) return

    const authUnsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        get()._unsub?.()
        get()._dirUnsub?.()
        set({
          _unsub: null,
          _dirUnsub: null,
          _full: [],
          _directory: [],
          users: [],
          loading: false,
        })
        return
      }

      // A sign-in with listeners already attached is a switch of account, and
      // the previous user's records must not survive it. Clearing here rather
      // than only on sign-out is deliberate: Firebase can go straight from one
      // user to another without an intervening null, and the stale array was
      // why testing a member's account inside an admin's running app showed
      // names that member could not actually see.
      get()._unsub?.()
      get()._dirUnsub?.()
      set({ _unsub: null, _dirUnsub: null, _full: [], _directory: [], users: [], loading: true })

      const dirUnsub = onSnapshot(
        collection(db, 'publicProfiles'),
        (snap) => {
          const directory = snap.docs.map((d) => ({ ...(d.data() as PublicProfile), uid: d.id }))
          set({
            _directory: directory,
            users: mergeUsers(directory, get()._full),
            loading: false,
          })
        },
        (err) => {
          console.error('[usersStore] publicProfiles error:', err)
          set({ loading: false })
        }
      )
      set({ _dirUnsub: dirUnsub })

      // Full records for admins. A non-admin is refused, which is expected and
      // not a failure — the directory above already carries the names, so the
      // error is logged at debug rather than raised.
      const fullUnsub = onSnapshot(
        collection(db, 'users'),
        (snap) => {
          const full = snap.docs.map((d) => ({ ...(d.data() as UserProfile), uid: d.id }))
          set({ _full: full, users: mergeUsers(get()._directory, full) })
        },
        (err) => {
          if ((err as { code?: string }).code !== 'permission-denied') {
            console.error('[usersStore] users error:', err)
          }
          set({ _unsub: null })
        }
      )
      set({ _unsub: fullUnsub })
    })
    set({ _authUnsub: authUnsub })
  },

  unsubscribe: () => {
    const newCount = Math.max(0, get()._refCount - 1)
    set({ _refCount: newCount })
    if (newCount === 0) {
      get()._unsub?.()
      get()._dirUnsub?.()
      get()._authUnsub?.()
      set({
        _unsub: null,
        _dirUnsub: null,
        _authUnsub: null,
        _full: [],
        _directory: [],
        users: [],
      })
    }
  },

  getUser: (uid) => get().users.find((u) => sameId(u.uid, uid)),

  displayName: (uid) => {
    const u = get().getUser(uid)
    return u?.displayName || u?.email || String(uid)
  },
}))
