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
  const body = Buffer.from(JSON.stringify(paused)).toString('base64url')
  return `${body}.${createHmac('sha256', key).update(body).digest('base64url')}`
}

export function unseal(state: unknown, key: string): Paused | null {
  if (typeof state !== 'string') return null
  const [body, mark] = state.split('.')
  if (!body || !mark) return null
  const want = Buffer.from(createHmac('sha256', key).update(body).digest('base64url'))
  const got = Buffer.from(mark)
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString()) as Paused
  } catch {
    return null
  }
}
