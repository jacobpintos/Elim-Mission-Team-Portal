import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { askedQuestion, audienceOf } from '@/lib/miriamAsked'
import type { UserProfile } from '@/types/user'

/**
 * A question asked of Miriam, kept for Admin → Analytics (lib/miriamAsked):
 * its words and what kind of account asked — never who. Written behind,
 * never waited on, and nothing said if it can't be.
 */
export function recordAsked(text: string, profile: UserProfile | null): void {
  const question = askedQuestion(text)
  if (!question || !profile) return
  addDoc(collection(db, 'miriamAsked'), {
    text: question,
    audience: audienceOf(profile),
    at: serverTimestamp(),
  }).catch(() => {})
}
