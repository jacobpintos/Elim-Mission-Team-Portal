import { doc, runTransaction } from 'firebase/firestore'
import { db } from '@/lib/firebase'

type CounterKey = 'nEv' | 'nTask' | 'nGroup' | 'nRoom' | 'nReport' | 'nNotif' | 'nSetlist' | 'nIssue' | 'nKaizen' | 'nBoard'

export async function nextId(key: CounterKey): Promise<number> {
  const ref = doc(db, 'config', 'main')
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    const current = (snap.exists() ? (snap.data()?.[key] ?? 1) : 1) as number
    if (snap.exists()) {
      tx.update(ref, { [key]: current + 1 })
    } else {
      tx.set(ref, { [key]: current + 1 }, { merge: true })
    }
    return current
  })
}
