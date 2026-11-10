import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase'

/**
 * Something an admin did, written to the audit log (Admin → Audit): what,
 * to what, and by whom — their name as they are known, and their uid, which
 * the database's rule holds to whoever is signed in (firestore.rules
 * auditLog: admins alone write it).
 */
export async function audit(action: string, detail?: string, name?: string) {
  const uid = auth.currentUser?.uid
  await addDoc(collection(db, 'auditLog'), {
    action,
    detail: detail ?? '',
    name: name ?? '',
    ts: serverTimestamp(),
    ...(uid ? { uid } : {}),
  })
}
