import { createHmac, timingSafeEqual } from 'crypto'

/**
 * A request part-way through, while the app runs its lookups (APP_TOOLS):
 * the conversation so far, the lookups already done here, and the calls the
 * app was asked to make. Kept by the app between calls, sealed so it comes
 * back as it was sent — and only to the person it was sent to, for a while.
 */
export interface Paused {
  uid: string
  until: number
  round: number
  alone: boolean
  appTools: string[]
  // The conversation and results, as the Messages API takes them.
  messages: any[]
  done: any[]
  waiting: string[]
}
export const PAUSE_MS = 5 * 60 * 1000
/** The most an app lookup may hand back. */
export const MAX_RESULT = 20_000

export function seal(paused: Paused, key: string): string {
  return sealWith(paused, key)
}

export function unseal(state: unknown, key: string): Paused | null {
  return unsealWith(state, key) as Paused | null
}

/**
 * One of her own answers (../own), as the app keeps it a little while in
 * case the person says it wasn't what they meant (./askMiriam: correct):
 * what they asked, how she read it, and what she said. Sealed, so it comes
 * back as it was sent, to the person it was sent to — signed, not hidden:
 * it holds nothing they weren't told, and never anyone else's words.
 */
export interface Check {
  k: 'check'
  uid: string
  until: number
  /** What they asked, as the server read it. */
  text: string
  /** The skill she read it as, when her answer came of her reading; null when not (an event's page). */
  read: string | null
  /** What her answer was, in a word (../stats: ownTag). */
  tag: string
  /** What she said, or did. */
  reply: string
}
/** How long after her answer it can be said not to be what was meant: as long as the app remembers it. */
export const CHECK_MS = 10 * 60 * 1000

/** Its own key: a check never passes for a paused request, nor one for a check. */
const checkKey = (key: string) => `${key}:check`

export function sealCheck(check: Omit<Check, 'k'>, key: string): string {
  return sealWith({ k: 'check', ...check }, checkKey(key))
}

/** The check sent back: null unless it is one, theirs, and not too old. */
export function unsealCheck(state: unknown, key: string, uid: string, now: number): Check | null {
  const c = unsealWith(state, checkKey(key)) as Partial<Check> | null
  if (!c || c.k !== 'check' || c.uid !== uid) return null
  if (typeof c.until !== 'number' || c.until < now) return null
  if (typeof c.text !== 'string' || typeof c.tag !== 'string' || typeof c.reply !== 'string') {
    return null
  }
  if (c.read !== null && typeof c.read !== 'string') return null
  return c as Check
}

function sealWith(value: unknown, key: string): string {
  const body = Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${body}.${createHmac('sha256', key).update(body).digest('base64url')}`
}

function unsealWith(state: unknown, key: string): unknown {
  if (typeof state !== 'string') return null
  const [body, mark] = state.split('.')
  if (!body || !mark) return null
  const want = Buffer.from(createHmac('sha256', key).update(body).digest('base64url'))
  const got = Buffer.from(mark)
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString())
  } catch {
    return null
  }
}
