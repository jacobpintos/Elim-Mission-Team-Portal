/**
 * Someone as a picker shows them: their name, else their email — else, for
 * an account with neither, "Unnamed account" and the end of its id, to match
 * against the account check (Admin → Users → Auth Sync Audit), rather than
 * a bare id that says nothing.
 */
export function personLabel(u: { uid: string | number; displayName?: string; email?: string }) {
  const name = u.displayName?.trim() || u.email?.trim()
  return name || `Unnamed account (…${String(u.uid).slice(-6)})`
}
