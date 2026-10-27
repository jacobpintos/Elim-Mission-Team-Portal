import { doc, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'

export {
  ALLOW_CLAUDE,
  CAN_ASK_CLAUDE,
  claudeAllowed,
  type ClaudeConsent,
} from '../../functions/src/miriam/consent'

/** Their say on Miriam sending requests on to Claude, kept on their account (functions/src/miriam/consent). */
export async function setClaudeAllowed(uid: string, allowed: boolean): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { claudeConsent: { allowed, at: Date.now() } })
}
