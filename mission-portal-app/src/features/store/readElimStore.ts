import { collection, doc } from 'firebase/firestore'
import { getDoc, getDocs } from '@/lib/liveFirestore'
import { db } from '@/lib/firebase'
import type { PageBlock } from '@/types/pages'
import { resolveStore, type StoreContent } from './storeContent'
import { activeSale, saleFrom, type StoreSale } from './storeSale'

/**
 * The store as the tab shows it, and the sale running now, read once — for
 * Miriam, who answers questions about it from these (lib/miriamStore) rather
 * than guessing. The tab itself keeps them live (./useElimStore).
 */
export async function readElimStore(
  now: number = Date.now()
): Promise<{ store: StoreContent; sale: StoreSale | null }> {
  const [main, sales] = await Promise.all([
    getDoc(doc(db, 'config', 'main')),
    getDocs(collection(db, 'storeSales')),
  ])
  const data = main.data()
  const ourStory = data?.publicPages?.ourstory?.blocks as PageBlock[] | undefined
  return {
    store: resolveStore(data?.elimStore, ourStory),
    sale: activeSale(
      sales.docs.map((d) => saleFrom(d.id, d.data())),
      now
    ),
  }
}
