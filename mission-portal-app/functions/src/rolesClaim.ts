/**
 * A person's roles as their sign-in token carries them: the `roles` custom
 * claim, kept the same as users/{uid}.roles by ./syncRoleClaims.
 *
 * The database's rules read roles from the token when it has them, rather
 * than reading the person's record on every request (firestore.rules
 * myRoles). Admin power is the exception: a token can take it away but
 * never give it — the record is read to confirm it each time — so taking
 * someone's admin role away works at once, whatever their token says.
 *
 * Kept free of Firebase: the app imports it, to tell when its token is
 * behind its record (src/lib/tokenRoles).
 */

/** More than anyone holds; a claim is kept small (Firebase allows 1,000 bytes for all of them). */
const MAX_ROLES = 20
const MAX_ROLE_LENGTH = 40

/** The claim for a record's roles: its role names, each once, in order. */
export function rolesClaim(roles: unknown): string[] {
  if (!Array.isArray(roles)) return []
  const kept = roles.filter(
    (r): r is string => typeof r === 'string' && r.length > 0 && r.length <= MAX_ROLE_LENGTH
  )
  return [...new Set(kept)].sort().slice(0, MAX_ROLES)
}

/** Whether a token's claim says the same as a record's roles. A claim not there says nothing. */
export function sameRoles(claim: unknown, roles: unknown): boolean {
  if (!Array.isArray(claim)) return false
  const a = rolesClaim(claim)
  const b = rolesClaim(roles)
  return a.length === b.length && a.every((r, i) => r === b[i])
}
