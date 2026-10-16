/**
 * How often one person may call something that costs money to run (Claude):
 * counted in Firestore, so every copy of the server shares one count and a
 * restart doesn't reset it. Only the times of their latest calls are kept,
 * never what was asked; each record is cleared once those times have passed
 * (../cleanup).
 *
 * Free of Firebase imports, so the app's tests can import it.
 */

export const USAGE_LIMITS = 'usageLimits'

export interface UsageLimit {
  /** Which call it counts: part of each record's id. */
  name: string
  /** Calls allowed in any stretch of `windowMs`. */
  perWindow: number
  windowMs: number
}

/** What it needs of Firestore: the admin SDK's, or one in memory for tests. */
export interface LimitDb {
  doc(path: string): unknown
  runTransaction<T>(fn: (tx: LimitTx) => Promise<T>): Promise<T>
}
export interface LimitTx {
  get(ref: ReturnType<LimitDb['doc']>): Promise<{ data(): Record<string, unknown> | undefined }>
  set(ref: ReturnType<LimitDb['doc']>, data: Record<string, unknown>): unknown
}

/**
 * The calls still in the window, with this one: null when there's no room
 * for it. Anything stored that isn't a time is passed over.
 */
export function counted(calls: unknown, now: number, limit: UsageLimit): number[] | null {
  const recent = (Array.isArray(calls) ? calls : []).filter(
    (t): t is number => typeof t === 'number' && now - t < limit.windowMs
  )
  if (recent.length >= limit.perWindow) return null
  return [...recent, now]
}

/** This copy's own count: used only when Firestore can't be reached. */
const here = new Map<string, number[]>()

/**
 * Whether one more call is allowed for this person, counted if it is. When
 * Firestore can't be reached, this copy of the server's own count decides,
 * as it did before the count was shared; `onError` is told why.
 */
export async function withinLimit(
  db: LimitDb,
  uid: string,
  limit: UsageLimit,
  { now = Date.now(), onError }: { now?: number; onError?: (err: unknown) => void } = {}
): Promise<boolean> {
  const key = `${limit.name}_${uid}`
  let calls: number[] | null
  try {
    const ref = db.doc(`${USAGE_LIMITS}/${key}`)
    calls = await db.runTransaction(async (tx) => {
      const next = counted((await tx.get(ref)).data()?.calls, now, limit)
      // When the last of these leaves the window: cleared after that.
      if (next) tx.set(ref, { calls: next, until: now + limit.windowMs })
      return next
    })
  } catch (err) {
    onError?.(err)
    calls = counted(here.get(key), now, limit)
  }
  if (calls) here.set(key, calls)
  return calls !== null
}
