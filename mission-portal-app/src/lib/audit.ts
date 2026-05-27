// Helper to write audit log entries
import { addDoc, collection } from 'firebase/firestore'
import { db } from '@/lib/firebase'

export async function addAuditEntry(
  uid: string,
  action: string,
  detail?: string
): Promise<void> {
  await addDoc(collection(db, 'auditLog'), {
    uid,
    action,
    detail: detail ?? '',
    ts: Date.now(),
  })
}
