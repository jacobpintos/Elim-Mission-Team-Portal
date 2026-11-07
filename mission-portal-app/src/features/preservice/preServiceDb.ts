import { collection, deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { onSnapshot } from '@/lib/liveFirestore'
import { db } from '@/lib/firebase'
import { checklistOf, storedChecklist, type Check, type Checklist } from './checklist'

/**
 * The Pre-service Checklist in Firestore (./checklist): the list itself, and
 * each service's checks. Who may change what is in firestore.rules.
 */

const listRef = () => doc(db, 'preService', 'checklist')
const checksOf = (day: string) => collection(db, 'preServiceDays', day, 'checks')

/** The checklist as it changes (empty until one is made). Gives back the way to stop. */
export function listenChecklist(
  onList: (list: Checklist) => void,
  onFail: () => void = () => {}
): () => void {
  return onSnapshot(listRef(), (snap) => onList(checklistOf(snap.data())), onFail)
}

/** A service's checks as they change, by item. Gives back the way to stop. */
export function listenChecks(
  day: string,
  onChecks: (checks: Record<string, Check>) => void,
  onFail: () => void = () => {}
): () => void {
  return onSnapshot(
    checksOf(day),
    (snap) => {
      const out: Record<string, Check> = {}
      for (const d of snap.docs) {
        const data = d.data() as { by?: unknown; at?: { toMillis?: () => number } | null }
        out[d.id] = {
          by: typeof data.by === 'string' ? data.by : '',
          at: data.at?.toMillis?.() ?? null,
        }
      }
      onChecks(out)
    },
    onFail
  )
}

/** Saves the checklist (admins). */
export function saveChecklist(list: Checklist, uid: string): Promise<void> {
  return setDoc(listRef(), {
    ...storedChecklist(list),
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  })
}

/** Checks an item off for a service. */
export function checkItem(day: string, itemId: string, uid: string): Promise<void> {
  return setDoc(doc(checksOf(day), itemId), { by: uid, at: serverTimestamp() })
}

/** Takes an item's check back. */
export function uncheckItem(day: string, itemId: string): Promise<void> {
  return deleteDoc(doc(checksOf(day), itemId))
}
