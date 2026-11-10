/**
 * A password for one account, until its owner changes it: made at random
 * each time, and handed to the admin who asked, once, to pass on.
 *
 * Every reset used to set the same one — 12345678 — so anyone who knew that,
 * and a colleague's email, could sign in as them after a reset; an admin's
 * account included.
 *
 * Kept free of Firebase, for tests (src/lib/temporaryPassword.test.ts in the app).
 */
import { randomInt } from 'crypto'

/** Without the look-alikes — 0 and O, 1, l and I — since it is read out, or copied by hand. */
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'

/** Three groups of four: "kT7w-Qm3x-9RpA". About 70 bits: not one to be guessed. */
export function temporaryPassword(): string {
  const group = () => Array.from({ length: 4 }, () => LETTERS[randomInt(LETTERS.length)]).join('')
  return [group(), group(), group()].join('-')
}

/**
 * Whether the app asking will show the password it is sent. One from before
 * doesn't know to: it tells the admin the old fixed one, which would no
 * longer be right — so it is refused, with why, rather than left to.
 */
export const showsPassword = (data: unknown): boolean =>
  !!data && typeof data === 'object' && (data as { shown?: unknown }).shown === true

export const UPDATE_TO_RESET =
  'Update the app to do this: the new password is made at random now, and shown to you once.'
