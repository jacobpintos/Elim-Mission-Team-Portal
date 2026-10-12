/**
 * What was said to Miriam and what she answered, kept for a little while so
 * that what comes next can be understood with it: "what time is it?" after
 * asking about Revival, or "Bob Jones" answering "who should it go to?".
 *
 * Sent with each request Claude works out (functions/src/miriam/askMiriam:
 * MAX_HISTORY). Kept on this device only, in memory; forgotten once a while
 * has gone by with nothing said.
 */
export interface Exchange {
  said: string
  reply: string
  at: number
}

/** The most kept. */
export const KEEP = 6
/** Quiet this long, and what came before is forgotten: what is said next starts afresh. */
export const FORGET_MS = 10 * 60 * 1000

/** The conversation with one more exchange: the oldest let go past KEEP, and all of it if gone quiet. */
export function withExchange(list: Exchange[], next: Exchange): Exchange[] {
  const last = list[list.length - 1]
  const kept = last && next.at - last.at < FORGET_MS ? list : []
  // The same answer again (shown, then said again on a re-render): kept once.
  if (last && kept === list && last.said === next.said && last.reply === next.reply) return list
  return [...kept, next].slice(-KEEP)
}

/** What is still remembered now, oldest first, to send with a request. */
export function recentExchanges(list: Exchange[], now: number): { said: string; reply: string }[] {
  const last = list[list.length - 1]
  if (!last || now - last.at >= FORGET_MS) return []
  return list.map(({ said, reply }) => ({ said, reply }))
}
