import {
  collection,
  doc,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from './firebase'
import { getDoc, onSnapshot } from './liveFirestore'
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
  /**
   * Waiting for the day's list ('pending'); on it, sent to the Connections
   * Coordinator ('sent'); or added to the texting list, by them ('added').
   */
  status: 'pending' | 'sent' | 'added'
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
    const status = d.status === 'added' ? 'added' : d.status === 'sent' ? 'sent' : 'pending'
    return {
      phone: String(d.phone ?? ''),
      status,
      at: millis(status === 'added' ? d.addedAt : status === 'sent' ? d.sentAt : d.createdAt),
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

/** Someone still to be added to the texting list, as the Connections Coordinator's Tasks show them. */
export interface TextingRequest {
  uid: string
  displayName: string
  /** E.164. */
  phone: string
  status: 'pending' | 'sent'
  /** When they asked. */
  at: number
}

/**
 * Everyone still to be added — asked, whether or not the day's list has
 * gone yet — oldest first, as it changes. For the Connections Coordinator
 * (and an admin). Returns the way to stop listening.
 */
export function watchRequests(
  onChange: (requests: TextingRequest[]) => void,
  onError?: () => void
): () => void {
  return onSnapshot(
    query(collection(db, 'textingListSignups'), where('status', 'in', ['pending', 'sent'])),
    (snap) =>
      onChange(
        snap.docs
          .map((d) => {
            const r = d.data() as Record<string, unknown>
            return {
              uid: String(r.uid ?? d.id),
              displayName: String(r.displayName ?? ''),
              phone: String(r.phone ?? ''),
              status: r.status === 'sent' ? ('sent' as const) : ('pending' as const),
              at: millis(r.createdAt),
            }
          })
          .sort((a, b) => a.at - b.at)
      ),
    () => onError?.()
  )
}

/** Added to the texting list, by `by`: off the Coordinator's Tasks. */
export async function markAdded(uid: string, by: string): Promise<void> {
  await updateDoc(doc(db, 'textingListSignups', uid), {
    status: 'added',
    addedAt: serverTimestamp(),
    addedBy: by,
  })
}

/** Marked added by mistake: back as it was. */
export async function unmarkAdded(uid: string, was: TextingRequest['status']): Promise<void> {
  await updateDoc(doc(db, 'textingListSignups', uid), { status: was })
}
