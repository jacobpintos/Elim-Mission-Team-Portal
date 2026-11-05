import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from './firebase'
import { getDoc } from './liveFirestore'
import { normalizePhone } from './textingList'
import { ORG } from '@/custom'

/**
 * A person's own request to join the texting list, read and made: the
 * Connect tab's sign-up and Miriam's both (see ./textingList for why it is
 * a request, and functions/src/push/textingListDigest for where it goes).
 */

export interface MySignup {
  /** E.164, as kept. */
  phone: string
  /** Waiting for the day's list ('pending'), or on it, sent to the Connections Coordinator ('sent'). */
  status: 'pending' | 'sent'
  /** When it was asked for, or sent on; 0 when not known. */
  at: number
}

/** How long a read is waited for: no signal, and the sign-up is shown as though none was made. */
const READ_MS = 4000

const inTime = <T>(p: Promise<T>): Promise<T | undefined> =>
  Promise.race([p, new Promise<undefined>((done) => setTimeout(() => done(undefined), READ_MS))])

const millis = (v: unknown) => {
  const t = v as { toMillis?: () => number } | null
  return t?.toMillis ? t.toMillis() : 0
}

/** Their own request: null when they haven't made one, undefined when it can't be read. */
export async function mySignup(uid: string): Promise<MySignup | null | undefined> {
  if (!uid) return null
  try {
    const snap = await inTime(getDoc(doc(db, 'textingListSignups', uid)))
    if (!snap) return undefined
    if (!snap.exists()) return null
    const d = snap.data() as Record<string, unknown>
    const sent = d.status === 'sent'
    return {
      phone: String(d.phone ?? ''),
      status: sent ? 'sent' : 'pending',
      at: millis(sent ? d.sentAt : d.createdAt),
    }
  } catch {
    return undefined
  }
}

/**
 * Asked to be added, with this number: pending, for the day's list to the
 * Connections Coordinator. A number asked with before is replaced, and asked
 * for again.
 */
export async function askToJoin(uid: string, displayName: string, phone: string): Promise<void> {
  const normalized = normalizePhone(phone)
  if (!normalized) throw new Error('That isn’t a US phone number.')
  await setDoc(doc(db, 'textingListSignups', uid), {
    uid,
    displayName,
    phone: normalized,
    status: 'pending',
    createdAt: serverTimestamp(),
  })
}

/** The number the texts come from as this build has it (src/custom), until an admin sets another. */
export const DEFAULT_TEXTING_NUMBER = ORG.textingNumber ?? ''

/** The number the texts come from: the one an admin set, else this build's own. */
export const textingNumberOf = (configured: string) => configured || DEFAULT_TEXTING_NUMBER

/** The number the texts come from (Admin → Leadership Team, else this build's), or '' when there's none. */
export async function textingNumber(): Promise<string> {
  try {
    const snap = await inTime(getDoc(doc(db, 'config', 'main')))
    const n = (snap?.data() as { connectConfig?: { textingNumber?: unknown } } | undefined)
      ?.connectConfig?.textingNumber
    return textingNumberOf(typeof n === 'string' ? n : '')
  } catch {
    return DEFAULT_TEXTING_NUMBER
  }
}
