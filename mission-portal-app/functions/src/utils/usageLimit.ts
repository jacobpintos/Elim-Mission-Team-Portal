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
  const recent = inWindow(calls, now, limit)
  if (recent.length >= limit.perWindow) return null
  return [...recent, now]
}

/** The times still in the window. */
function inWindow(calls: unknown, now: number, limit: UsageLimit): number[] {
  return (Array.isArray(calls) ? calls : []).filter(
    (t): t is number => typeof t === 'number' && now - t < limit.windowMs
  )
}

/** This copy's own count, kept as the shared one is: what decides when that can't be taken. */
const here = new Map<string, number[]>()
/** Calls this copy allowed on its own count alone: added to the shared one when it can next be taken. */
const unshared = new Map<string, number[]>()

/**
 * Whether one more call is allowed for this person, counted if it is. When
 * the shared count can't be taken (Firestore unreachable, or too busy), this
 * copy of the server's own count decides, as it did before the count was
 * shared, and what it allows is added to the shared count once it can be
 * taken again; `onError` is told why.
 */
export async function withinLimit(
  db: LimitDb,
  uid: string,
  limit: UsageLimit,
  { now = Date.now(), onError }: { now?: number; onError?: (err: unknown) => void } = {}
): Promise<boolean> {
  const key = `${limit.name}_${uid}`
  const owed = unshared.get(key) ?? []
  let calls: number[] | null
  try {
    const ref = db.doc(`${USAGE_LIMITS}/${key}`)
    calls = await db.runTransaction(async (tx) => {
      const stored = (await tx.get(ref)).data()?.calls
      const all = [...(Array.isArray(stored) ? stored : []), ...owed]
      const next = counted(all, now, limit)
      // Refused, what this copy allowed on its own is still shared: the latest, as many as count.
      const kept =
        next ??
        inWindow(all, now, limit)
          .sort((a, b) => a - b)
          .slice(-limit.perWindow)
      // Cleared once the last of these leaves the window.
      if (next || owed.length) {
        tx.set(ref, { calls: kept, until: Math.max(...kept) + limit.windowMs })
      }
      return next
    })
    unshared.delete(key)
  } catch (err) {
    onError?.(err)
    calls = counted(here.get(key), now, limit)
    if (calls) unshared.set(key, [...owed.filter((t) => now - t < limit.windowMs), now])
  }
  if (calls) here.set(key, calls)
  return calls !== null
}
