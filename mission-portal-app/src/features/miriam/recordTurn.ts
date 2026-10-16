import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { EVENTS } from '../../../functions/src/miriam/stats'

/**
 * How Miriam is doing, for Admin → Miriam (functions/src/miriam/stats): that
 * the phone handled a request itself, or that a change she showed was
 * confirmed or cancelled. Never the words, never who. Written behind, never
 * waited on, and nothing said if it can't be (firestore.rules: miriamEvents).
 */
function record(fields: Record<string, string>): void {
  addDoc(collection(db, EVENTS), { ...fields, at: serverTimestamp() }).catch(() => {})
}

/** A request, or a reply, the phone worked out itself: nothing sent to the server. */
export const recordTurn = () => record({ kind: 'turn', tier: 'phone', outcome: 'handled' })

/** A change she showed, confirmed or cancelled. */
export const recordCard = (outcome: 'confirmed' | 'cancelled') => record({ kind: 'card', outcome })
