import { FieldPath, deleteField, doc, runTransaction } from 'firebase/firestore'
import { db } from '@/lib/firebase'

/**
 * Taking an item on an event's food sheet, and giving one up — the only ways
 * any screen or Miriam changes a sheet.
 *
 * A sheet used to be saved by writing the whole of it back from a copy read
 * earlier: the event page held its copy open behind "Sign up to bring…?", so
 * two people signing up at once could each write over the other, and a
 * sign-up for another dish made in between was erased with no one told.
 * Here the item is read and written together (a transaction): taken if it is
 * still open, and only that item touched. firestore.rules holds anything else
 * to the same, so an old copy of the app can't write over a sign-up either.
 */

/** One person's sign-up for an item, by the item's place on the event's list. */
export interface FoodSignupEntry {
  uid: string
  displayName: string
}

/** An event date's sheet: who is bringing what, keyed by the item's place on the list. */
export type FoodSignups = Record<string, FoodSignupEntry>

export type Claimed =
  | { ok: true; signups: FoodSignups }
  /** Someone has it: who, and the sheet as it is now. */
  | { ok: false; by: FoodSignupEntry; signups: FoodSignups }

/** Take an item, only if it is still open. Throws when it can't be read or written (no signal). */
export async function claimFoodItem(
  key: string,
  index: number,
  entry: FoodSignupEntry
): Promise<Claimed> {
  const ref = doc(db, 'foodSignups', key)
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    const signups = (snap.data()?.signups ?? {}) as FoodSignups
    const by = signups[String(index)]
    if (by) return { ok: false, by, signups }
    if (snap.exists()) tx.update(ref, new FieldPath('signups', String(index)), entry)
    else tx.set(ref, { signups: { [String(index)]: entry } })
    return { ok: true, signups: { ...signups, [String(index)]: entry } }
  })
}

/** Give up one's own item — only while it is still theirs. False when it isn't. */
export async function releaseFoodItem(key: string, index: number, uid: string): Promise<boolean> {
  const ref = doc(db, 'foodSignups', key)
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    const by = (snap.data()?.signups as FoodSignups | undefined)?.[String(index)]
    if (!by || String(by.uid) !== uid) return false
    tx.update(ref, new FieldPath('signups', String(index)), deleteField())
    return true
  })
}
