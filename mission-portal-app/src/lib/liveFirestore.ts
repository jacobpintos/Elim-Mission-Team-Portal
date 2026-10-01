import {
  onSnapshot as firestoreOnSnapshot,
  getDoc as firestoreGetDoc,
  getDocs as firestoreGetDocs,
  type DocumentSnapshot,
  type QuerySnapshot,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { loadOffline, saveOffline } from '@/lib/offlineCache'
import { fromKept, snapshotKey, toKept, type Kept } from '@/lib/keptSnapshot'

/**
 * Firestore's onSnapshot, getDoc and getDocs for the native app, with a copy
 * of every answer kept on the phone so the whole app opens and reads with no
 * signal — as the web app does from Firestore's own cache, which React Native
 * has no IndexedDB for (firebase.ts).
 *
 * Every screen imports these instead of Firestore's, and nothing else changes:
 * - Each answer from the server is kept (offlineCache.ts), under the path or
 *   query it answers (keptSnapshot.ts).
 * - A listener is handed the kept answer as soon as it is read, and the live
 *   one when it comes — so screens fill straight away, signal or not.
 * - Until the server has answered, Firestore's own offline answers are not
 *   passed on over a kept one: with no cache of its own on native, they are
 *   "nothing here" or a part of it, and would empty the screen — or, for the
 *   signed-in user's profile, sign them out.
 * - A read with no signal is answered from the kept copy instead of failing.
 *
 * What it does not do: show a change made with no signal before the server
 * has answered once, since the kept answer is all that is shown until then.
 * The change itself is sent when the signal returns, as before.
 */

type Ref = Parameters<typeof firestoreGetDoc>[0] | Parameters<typeof firestoreGetDocs>[0]
type Snap = DocumentSnapshot | QuerySnapshot
type Next = (snap: Snap) => void
type Fail = (error: Error) => void

const keep = (key: string, snap: Snap) =>
  saveOffline(key, toKept(snap as unknown as Parameters<typeof toKept>[0]))
const restore = (kept: Kept, ref: Ref) => fromKept(kept, db, ref) as unknown as Snap

function listen(ref: Ref, ...args: unknown[]): () => void {
  // (ref, next, error?, done?), (ref, options, next, error?, done?), or either
  // with an observer object in place of the callbacks.
  const options =
    args[0] && typeof args[0] === 'object' && !('next' in (args[0] as object))
      ? (args.shift() as object)
      : {}
  let next: Next | undefined
  let fail: Fail | undefined
  let done: (() => void) | undefined
  if (typeof args[0] === 'function') {
    ;[next, fail, done] = args as [Next, Fail?, (() => void)?]
  } else {
    const observer = (args[0] ?? {}) as { next?: Next; error?: Fail; complete?: () => void }
    next = observer.next?.bind(observer)
    fail = observer.error?.bind(observer)
    done = observer.complete?.bind(observer)
  }

  const key = snapshotKey(ref as never)
  const live = (onNext: Next) =>
    (firestoreOnSnapshot as (...a: unknown[]) => () => void)(
      ref,
      options,
      onNext,
      (error: Error) => fail?.(error),
      () => done?.()
    )
  if (!key) return live((snap) => next?.(snap))

  let closed = false
  let heard = false // from the server
  let kept: Kept | null | undefined // undefined: still being read
  let held: Snap | null = null // Firestore's offline answer, while the kept one is read

  loadOffline<Kept>(key).then((found) => {
    kept = found
    if (closed || heard) return
    if (found) next?.(restore(found, ref))
    else if (held) next?.(held)
    held = null
  })

  const stop = live((snap) => {
    if (!snap.metadata.fromCache) {
      heard = true
      held = null
      next?.(snap)
      keep(key, snap)
      return
    }
    if (heard) return next?.(snap)
    if (kept === undefined) held = snap
    else if (!kept) next?.(snap)
    // With a kept answer showing, Firestore's offline one is no better.
  })
  return () => {
    closed = true
    stop()
  }
}

/** Firestore's onSnapshot, kept on the phone. */
export const onSnapshot = listen as unknown as typeof firestoreOnSnapshot

/** Firestore's getDoc, answered from the phone's copy when there is no signal. */
export const getDoc = (async (ref: Ref) => {
  const key = snapshotKey(ref as never)
  try {
    const snap = await (firestoreGetDoc as (r: Ref) => Promise<Snap>)(ref)
    if (key && !snap.metadata.fromCache) keep(key, snap)
    return snap
  } catch (error) {
    // "Failed to get document because the client is offline."
    const kept = key ? await loadOffline<Kept>(key) : null
    if (kept) return restore(kept, ref)
    throw error
  }
}) as unknown as typeof firestoreGetDoc

/**
 * Firestore's getDocs, likewise. Offline, Firestore answers from its own
 * cache rather than failing — on native that is nothing, so the kept answer is
 * given instead whenever there is one.
 */
export const getDocs = (async (ref: Ref) => {
  const key = snapshotKey(ref as never)
  let snap: Snap
  try {
    snap = await (firestoreGetDocs as (r: Ref) => Promise<Snap>)(ref)
  } catch (error) {
    const kept = key ? await loadOffline<Kept>(key) : null
    if (kept) return restore(kept, ref)
    throw error
  }
  if (!key) return snap
  if (!snap.metadata.fromCache) {
    keep(key, snap)
    return snap
  }
  const kept = await loadOffline<Kept>(key)
  return kept ? restore(kept, ref) : snap
}) as unknown as typeof firestoreGetDocs
