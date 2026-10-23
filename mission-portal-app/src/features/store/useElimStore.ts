import { useEffect, useMemo, useState } from 'react'
import { collection, doc } from 'firebase/firestore'
import { onSnapshot } from '@/lib/liveFirestore'
import { db } from '@/lib/firebase'
import type { PageBlock } from '@/types/pages'
import { resolveStore, type StoreContent } from './storeContent'
import { activeSale, type StoreSale } from './storeSale'

/**
 * The store as it stands, and the sale running in it, kept live.
 *
 * The content and Our Story share config/main, so one listener gives both:
 * the books shelf follows Our Story's covers until an admin saves the store.
 * The sale has a listener of its own, and a timer that takes it down at the
 * end of its last day for anyone who has the tab open at the time.
 */
export function useElimStore(): {
  store: StoreContent | null
  /** Whether an admin has saved the store yet, rather than it showing its defaults. */
  saved: boolean
  /** Our Story's blocks, for putting its covers back on the books shelf. */
  ourStory: PageBlock[]
  sales: StoreSale[]
  sale: StoreSale | null
} {
  const [raw, setRaw] = useState<{ saved: unknown; ourStory: PageBlock[] } | null>(null)
  const [sales, setSales] = useState<StoreSale[]>([])
  const [, setTick] = useState(0)

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'config', 'main'), (snap) => {
      const data = snap.data()
      setRaw({
        saved: data?.elimStore,
        ourStory: (data?.publicPages?.ourstory?.blocks as PageBlock[] | undefined) ?? [],
      })
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'storeSales'), (snap) => {
      setSales(
        snap.docs.map((d) => {
          const x = d.data()
          return {
            id: d.id,
            message: String(x.message ?? ''),
            endsOn: String(x.endsOn ?? ''),
            endsAt: Number(x.endsAt ?? 0),
            createdAt: Number(x.createdAt ?? 0),
            createdBy: x.createdBy ? String(x.createdBy) : undefined,
          }
        })
      )
    })
    return () => unsub()
  }, [])

  const store = useMemo(() => (raw ? resolveStore(raw.saved, raw.ourStory) : null), [raw])
  const sale = activeSale(sales)
  const endsAt = sale?.endsAt ?? 0

  // Date.now() is only read while rendering, so without this a sale would
  // stay up past its end for anyone who left the tab open.
  useEffect(() => {
    if (!endsAt) return
    const ms = endsAt - Date.now()
    // setTimeout holds a signed 32-bit delay; a sale weeks out is re-checked
    // on the next render instead of overflowing into an immediate fire.
    if (ms <= 0 || ms > 2 ** 31 - 1) return
    const t = setTimeout(() => setTick((n) => n + 1), ms + 1000)
    return () => clearTimeout(t)
  }, [endsAt])

  return {
    store,
    saved: !!raw?.saved,
    ourStory: raw?.ourStory ?? [],
    sales,
    sale,
  }
}
