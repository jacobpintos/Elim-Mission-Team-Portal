import { doc, runTransaction } from 'firebase/firestore'
import { db } from '@/lib/firebase'

type CounterKey = 'nEv' | 'nTask' | 'nGroup' | 'nRoom' | 'nReport' | 'nNotif'

export async function nextId(key: CounterKey): Promise<number> {
  const ref = doc(db, 'config', 'main')
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    const current = (snap.data()?.[key] ?? 1) as number
    tx.update(ref, { [key]: current + 1 })
    return current
  })
}
