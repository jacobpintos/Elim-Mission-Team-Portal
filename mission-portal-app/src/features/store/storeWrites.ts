import { collection, deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { getDocs } from '@/lib/liveFirestore'
import type { StoreContent } from './storeContent'

/** Save the store's wording and shelves, replacing what was there. */
export async function saveStore(content: StoreContent): Promise<void> {
  await updateDoc(doc(db, 'config', 'main'), { elimStore: content })
}

/**
 * Post a new sale.
 *
 * Whatever sales are stored — the one being replaced, ones long ended — are
 * removed first, so the collection only ever holds the sale that is on. The
 * new one is created rather than written over an old id, because creation is
 * what tells the people who asked to hear about sales.
 */
export async function postSale(sale: {
  message: string
  endsOn: string
  endsAt: number
  createdBy?: string
}): Promise<void> {
  const old = await getDocs(collection(db, 'storeSales'))
  await Promise.all(old.docs.map((d) => deleteDoc(d.ref)))
  const id = `sale-${Date.now().toString(36)}`
  await setDoc(doc(db, 'storeSales', id), { ...sale, createdAt: Date.now() })
}

/** Correct the sale that is on. An update, so nobody is notified again. */
export async function updateSale(
  id: string,
  changes: { message: string; endsOn: string; endsAt: number }
): Promise<void> {
  await updateDoc(doc(db, 'storeSales', id), changes)
}

/** Take the sale down before its last day. */
export async function endSale(id: string): Promise<void> {
  await deleteDoc(doc(db, 'storeSales', id))
}
