/**
 * Phone numbers for the event and meeting texting list.
 *
 * Nobody is subscribed by this app. What it collects is a request: a name and
 * a number handed to the Connections Coordinator, who adds the person to the
 * list in whatever service actually sends the texts. That is why the number is
 * only ever validated and stored, never messaged from here.
 */

/** Digits only, so formatting a person typed in does not fail the check. */
function digitsOf(input: string): string {
  return input.replace(/\D/g, '')
}

/**
 * A US number in E.164, or null if it is not one.
 *
 * Ten digits, or eleven beginning with the country code. Anything else is
 * rejected rather than guessed at — a wrong number in this list means the
 * coordinator texts a stranger, and someone who mistyped their own number gets
 * nothing and never learns why.
 *
 * The area code and exchange cannot begin with 0 or 1 in the North American
 * plan, which catches most of the ways a number gets mangled on the way in.
 */
export function normalizePhone(input: string): string | null {
  const digits = digitsOf(input)
  const national = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
  if (national.length !== 10) return null
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(national)) return null
  return `+1${national}`
}

/** Is this something we could put in front of the coordinator? */
export function isValidPhone(input: string): boolean {
  return normalizePhone(input) !== null
}

/**
 * E.164 back to how a person writes it, for the coordinator's notification.
 *
 * Anything not in the shape this module stores is passed through untouched
 * rather than mangled — a number from before this existed should still be
 * readable in the message.
 */
export function formatPhone(e164: string): string {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164)
  if (!m) return e164
  return `(${m[1]}) ${m[2]}-${m[3]}`
}

/** One person's request, as the coordinator's message lists them. */
export function signupLine(displayName: string, phone: string): string {
  const name = displayName.trim() || 'Someone'
  return `${name} — ${formatPhone(phone)}`
}

/**
 * The message the Connections Coordinator receives.
 *
 * Names and numbers in full rather than a count: the whole point of the
 * message is that it can be acted on without opening anything.
 */
export function signupDigestMessage(signups: { displayName: string; phone: string }[]): string {
  const who = signups.length === 1 ? '1 person wants' : `${signups.length} people want`
  const lines = signups.map((s) => signupLine(s.displayName, s.phone)).join('\n')
  return `${who} to join the texting list:\n${lines}`
}
