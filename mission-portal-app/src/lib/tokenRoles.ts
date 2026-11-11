import { sameRoles } from '../../functions/src/rolesClaim'

/**
 * Whether this sign-in's token carries the roles its record has, and a new
 * token asked for until it does.
 *
 * The database's rules read roles from the token where it carries them
 * (firestore.rules myRoles), and the server puts them there a moment after a
 * person's roles change (functions/src/syncRoleClaims). Until their token is
 * made again — within the hour, on its own — it says what they were. So when
 * the app sees their roles change, it asks for a new token at once, and the
 * change is shown only once the token agrees (src/stores/authStore): what
 * they are shown and what the rules let them do change together.
 *
 * Kept free of Firebase's own modules, for tests: what it needs of a sign-in
 * is handed in.
 */

/** What is asked of a sign-in: its token's claims, made afresh or not. */
export interface TokenSource {
  getIdTokenResult(forceRefresh?: boolean): Promise<{ claims: Record<string, unknown> }>
}

/**
 * - 'agrees': the token carries these roles.
 * - 'none': it carries no roles, so the rules read the record, which is current.
 * - 'refreshed': it didn't, and a new one does (or carries none now).
 * - 'gave up': no token that agrees came — no signal, or the server slow —
 *   or a newer check took over. The rules may refuse for a while what the
 *   app shows; they read the token again when it is next made.
 */
export type TokenAgreement = 'agrees' | 'none' | 'refreshed' | 'gave up'

export interface AgreeOptions {
  /** New tokens asked for, before giving up. */
  tries?: number
  /** Between them: the server's change takes a few seconds. */
  waitMs?: number
  /** False once a newer check has taken over: this one stops. */
  isCurrent?: () => boolean
  sleep?: (ms: number) => Promise<void>
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export async function tokenAgrees(
  user: TokenSource,
  roles: unknown,
  { tries = 8, waitMs = 1500, isCurrent = () => true, sleep = wait }: AgreeOptions = {}
): Promise<TokenAgreement> {
  try {
    const now = (await user.getIdTokenResult(false)).claims.roles
    if (!Array.isArray(now)) return 'none'
    if (sameRoles(now, roles)) return 'agrees'
    for (let i = 0; i < tries; i++) {
      if (i > 0) await sleep(waitMs)
      if (!isCurrent()) return 'gave up'
      const fresh = (await user.getIdTokenResult(true)).claims.roles
      if (!Array.isArray(fresh) || sameRoles(fresh, roles)) return 'refreshed'
    }
    return 'gave up'
  } catch {
    return 'gave up'
  }
}
