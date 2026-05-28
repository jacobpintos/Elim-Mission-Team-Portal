import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'

export async function audit(action: string, detail?: string, name?: string) {
  await addDoc(collection(db, 'auditLog'), {
    action,
    detail: detail ?? '',
    name: name ?? '',
    ts: serverTimestamp(),
  })
}
