import { useState } from 'react'
import { ScrollView } from 'react-native'
import { YStack, XStack, Text, Button, Spinner } from 'tamagui'
import { Modal } from '@/components/ui/Modal'
import { useUIStore } from '@/stores/uiStore'
import { useAuthStore } from '@/stores/authStore'
import { audit } from '@/lib/audit'
import { functions, db } from '@/lib/firebase'
import { httpsCallable } from 'firebase/functions'
import { doc, deleteDoc, setDoc, serverTimestamp, writeBatch } from 'firebase/firestore'
import { removeFromLists } from '@/lib/userRemoval'
import { confirmAsync } from '@/lib/confirm'
import { defaultNotificationPrefs } from '@/types/user'

type OrphanFirestoreDoc = {
  uid: string
  displayName?: string
  email?: string
  roles?: string[]
}

type OrphanAuthAccount = {
  uid: string
  email: string
  displayName: string
}

/** A profile with no name and no email, and what its sign-in account says (functions/src/auditAuthUsers). */
type BlankAccount = {
  uid: string
  roles?: string[]
  auth: {
    email: string
    phone: string
    providers: string[]
    created: string
    lastSignIn: string
    disabled: boolean
  } | null
}

/** A uid in groups or common teams with no profile and no account (functions/src/accountAudit). */
type StrayMember = { uid: string; in: string[] }

/** A public account still in groups or common teams: made public since (functions/src/strayMembersSync). */
type PublicMember = { uid: string; name: string; in: string[] }

type AuditResult = {
  orphanFirestore: OrphanFirestoreDoc[]
  orphanAuth: OrphanAuthAccount[]
  // Absent from a server not yet updated.
  blankAccounts?: BlankAccount[]
  strayMembers?: StrayMember[]
  publicMembers?: PublicMember[]
}

/** "Nov 2, 2026" from Auth's date string; "" for none. */
const dateSaid = (s: string) =>
  s
    ? new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : ''

/** How an account signs in, said. */
const providerSaid = (id: string) =>
  ({ password: 'email & password', phone: 'phone', 'google.com': 'Google', 'apple.com': 'Apple' })[
    id
  ] ?? id

type CreateAuthResult = {
  uid: string
  email: string
  displayName: string
  status: 'created' | 'already_exists' | 'error'
  error?: string
  /** A login just made: its temporary password, shown here once. */
  password?: string
}

interface AuthAuditSheetProps {
  open: boolean
  onClose: () => void
}

export function AuthAuditSheet({ open, onClose }: AuthAuditSheetProps) {
  const { toast } = useUIStore()
  const { profile } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [backfilling, setBackfilling] = useState(false)
  const [result, setResult] = useState<AuditResult | null>(null)
  const [createResults, setCreateResults] = useState<CreateAuthResult[] | null>(null)

  /**
   * Write a directory entry for every existing user.
   *
   * mirrorPublicProfile only fires on writes, so accounts untouched since it
   * was introduced have no entry and still render as raw uids to members.
   * Safe to press repeatedly — it writes the same entries again.
   */
  const rebuildDirectory = async () => {
    setBackfilling(true)
    try {
      const backfill = httpsCallable(functions, 'backfillPublicProfiles')
      const res = await backfill({})
      const { written, skipped } = res.data as { written: number; skipped: number }
      toast(
        skipped > 0
          ? `Directory rebuilt: ${written} named, ${skipped} without a display name`
          : `Directory rebuilt: ${written} named`,
        'success'
      )
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Rebuild failed', 'error')
    } finally {
      setBackfilling(false)
    }
  }

  const runAudit = async () => {
    setLoading(true)
    setResult(null)
    setCreateResults(null)
    try {
      const auditAuthUsers = httpsCallable(functions, 'auditAuthUsers')
      const res = await auditAuthUsers({})
      setResult(res.data as AuditResult)
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Audit failed', 'error')
    } finally {
      setLoading(false)
    }
  }

  const createAllAuthAccounts = async () => {
    if (!result?.orphanFirestore.length) return
    const ok = await confirmAsync(
      `Create Auth accounts for all ${result.orphanFirestore.length} orphan users? Each gets a temporary password of its own, shown here once for you to pass on.`,
      { destructive: true }
    )
    if (!ok) return
    setCreating(true)
    try {
      const createAuthForOrphans = httpsCallable(functions, 'createAuthForOrphans', {
        timeout: 120000,
      })
      const uids = result.orphanFirestore.map((u) => u.uid)
      // `shown`: this screen shows the passwords it is sent (functions/src/temporaryPassword).
      const res = await createAuthForOrphans({ uids, shown: true })
      const results = (res.data as { results: CreateAuthResult[] }).results
      setCreateResults(results)
      const created = results.filter((r) => r.status === 'created').length
      const errors = results.filter((r) => r.status === 'error').length
      await audit(
        'user.bulkAuthCreated',
        `Created ${created} Auth accounts for orphan Firestore users (${errors} errors)`,
        profile?.displayName ?? ''
      )
      toast(
        `Created ${created} accounts${errors ? ` — ${errors} failed (see results)` : ''}`,
        errors ? 'info' : 'success'
      )
      // Re-run audit to refresh counts
      const auditAuthUsers = httpsCallable(functions, 'auditAuthUsers')
      const auditRes = await auditAuthUsers({})
      setResult(auditRes.data as AuditResult)
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Failed to create accounts', 'error')
    } finally {
      setCreating(false)
    }
  }

  const deleteOrphanDoc = async (user: OrphanFirestoreDoc) => {
    const ok = await confirmAsync(
      `Delete orphan Firestore doc for "${user.displayName ?? user.email ?? user.uid}"?`,
      { destructive: true }
    )
    if (!ok) return
    await deleteDoc(doc(db, 'users', user.uid))
    await audit(
      'user.deleted',
      `Deleted orphan Firestore doc ${user.uid}`,
      profile?.displayName ?? ''
    )
    toast('Orphan document deleted', 'success')
    setResult((r) =>
      r ? { ...r, orphanFirestore: r.orphanFirestore.filter((u) => u.uid !== user.uid) } : r
    )
  }

  const deleteAuthAccounts = async (users: OrphanAuthAccount[]) => {
    const isBulk = users.length > 1
    const ok = await confirmAsync(
      isBulk
        ? `Permanently delete all ${users.length} Auth-only accounts? This cannot be undone.`
        : `Permanently delete Auth account for "${users[0].displayName || users[0].email}"? This cannot be undone.`,
      { destructive: true }
    )
    if (!ok) return
    setDeleting(true)
    try {
      const deleteAuthAccount = httpsCallable(functions, 'deleteAuthAccount')
      const res = await deleteAuthAccount({ uids: users.map((u) => u.uid) })
      const { deleted, errors } = res.data as {
        deleted: number
        errors: { uid: string; message: string }[]
      }
      await audit(
        'user.authDeleted',
        `Deleted ${deleted} Auth-only accounts`,
        profile?.displayName ?? ''
      )
      toast(
        `Deleted ${deleted} account${deleted !== 1 ? 's' : ''}${errors.length ? ` — ${errors.length} failed` : ''}`,
        errors.length ? 'info' : 'success'
      )
      const deletedUids = new Set(
        users.map((u) => u.uid).filter((uid) => !errors.find((e) => e.uid === uid))
      )
      setResult((r) =>
        r ? { ...r, orphanAuth: r.orphanAuth.filter((u) => !deletedUids.has(u.uid)) } : r
      )
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Failed to delete accounts', 'error')
    } finally {
      setDeleting(false)
    }
  }

  const createProfileForOrphan = async (user: OrphanAuthAccount) => {
    const ok = await confirmAsync(
      `Create a Firestore profile for "${user.displayName || user.email}"?`,
      { destructive: true }
    )
    if (!ok) return
    await setDoc(doc(db, 'users', user.uid), {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || user.email,
      roles: ['public'],
      onboardingComplete: true,
      // A repaired profile is a new profile: same defaults as a sign-up,
      // minus the weekly digest an orphaned account never asked for.
      notificationPrefs: defaultNotificationPrefs(),
      pushTokens: {},
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    await audit(
      'user.created',
      `Created missing Firestore profile for Auth account ${user.uid}`,
      profile?.displayName ?? ''
    )
    toast('Profile created', 'success')
    setResult((r) => (r ? { ...r, orphanAuth: r.orphanAuth.filter((u) => u.uid !== user.uid) } : r))
  }

  /** An account with nothing to know it by, deleted as Users deletes one — and its sign-in. */
  const deleteBlankAccount = async (a: BlankAccount) => {
    const ok = await confirmAsync(
      `Delete the unnamed account ${a.uid}? It is taken out of every group and team, and can't sign in again.`,
      { destructive: true, confirmLabel: 'Delete' }
    )
    if (!ok) return
    setDeleting(true)
    try {
      const batch = writeBatch(db)
      batch.delete(doc(db, 'users', a.uid))
      await removeFromLists(batch, a.uid)
      await batch.commit()
      if (a.auth) await httpsCallable(functions, 'deleteAuthAccount')({ uids: [a.uid] })
      await audit('user.deleted', `Deleted unnamed account ${a.uid}`, profile?.displayName ?? '')
      toast('Deleted', 'success')
      setResult((r) =>
        r ? { ...r, blankAccounts: (r.blankAccounts ?? []).filter((b) => b.uid !== a.uid) } : r
      )
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Could not delete it', 'error')
    } finally {
      setDeleting(false)
    }
  }

  /** Uids with no account behind them, out of every group and common team. */
  const removeStrays = async () => {
    setDeleting(true)
    try {
      const res = await httpsCallable(functions, 'removeStrayMembers')({})
      const removed = (res.data as { removed: number }).removed
      await audit(
        'groups.strayMembersRemoved',
        `Removed ${removed} members with no account, or made public, from groups and common teams`,
        profile?.displayName ?? ''
      )
      toast(`Removed ${removed} from groups and teams`, 'success')
      setResult((r) => (r ? { ...r, strayMembers: [], publicMembers: [] } : r))
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Could not remove them', 'error')
    } finally {
      setDeleting(false)
    }
  }

  const statusColor = (s: CreateAuthResult['status']) =>
    s === 'created' ? '$green10' : s === 'already_exists' ? '$yellow10' : '$red10'
  const statusLabel = (s: CreateAuthResult['status']) =>
    s === 'created' ? 'Created' : s === 'already_exists' ? 'Already exists' : 'Error'

  return (
    <Modal
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose()
      }}
      title="Auth Sync Audit"
    >
      <YStack gap="$3" padding="$2">
        <Text fontSize="$2" color="$gray10">
          Compares Firebase Auth accounts against Firestore user documents to find mismatches — and
          finds accounts with no name or email, and group members with no account.
        </Text>

        <Button onPress={runAudit} disabled={loading || creating} theme="active" size="$3">
          {loading ? <Spinner size="small" /> : result ? 'Re-run Audit' : 'Run Audit'}
        </Button>

        <YStack gap="$1">
          <Text fontSize="$2" color="$gray10">
            Rebuilds the name directory members read to turn uids into names. Kept current
            automatically on every profile change — run this once after an import, or if a member
            reports seeing uids instead of names.
          </Text>
          <Button onPress={rebuildDirectory} disabled={backfilling} size="$3">
            {backfilling ? <Spinner size="small" /> : 'Rebuild Name Directory'}
          </Button>
        </YStack>

        {result && (
          <ScrollView style={{ maxHeight: 520 }}>
            <YStack gap="$4">
              {/* Orphan Firestore docs */}
              <YStack gap="$2">
                <XStack justifyContent="space-between" alignItems="center">
                  <YStack>
                    <Text fontWeight="700" fontSize="$4">
                      Firestore Only ({result.orphanFirestore.length})
                    </Text>
                    <Text fontSize="$2" color="$gray10">
                      In user management but no Auth account
                    </Text>
                  </YStack>
                  {result.orphanFirestore.length > 0 && (
                    <Button
                      size="$3"
                      theme="active"
                      onPress={createAllAuthAccounts}
                      disabled={creating}
                    >
                      {creating ? <Spinner size="small" /> : `Create All Auth Accounts`}
                    </Button>
                  )}
                </XStack>

                {result.orphanFirestore.length === 0 ? (
                  <Text color="$green10" fontSize="$3">
                    None — all clear
                  </Text>
                ) : (
                  result.orphanFirestore.map((u) => (
                    <XStack
                      key={u.uid}
                      borderWidth={1}
                      borderColor="$borderColor"
                      borderRadius="$3"
                      padding="$3"
                      gap="$2"
                      alignItems="center"
                    >
                      <YStack flex={1}>
                        <Text fontWeight="600" fontSize="$3">
                          {u.displayName ?? '(no name)'}
                        </Text>
                        <Text fontSize="$2" color="$gray10">
                          {u.email ?? '(no email)'}
                        </Text>
                        <Text fontSize="$2" color="$gray9">
                          {(u.roles ?? []).join(', ')}
                        </Text>
                      </YStack>
                      <Button size="$2" theme="red" onPress={() => deleteOrphanDoc(u)}>
                        Delete
                      </Button>
                    </XStack>
                  ))
                )}
              </YStack>

              {/* Create results */}
              {createResults && (
                <YStack gap="$2">
                  <Text fontWeight="700" fontSize="$4">
                    Creation Results
                  </Text>
                  {createResults.some((r) => r.password) && (
                    <Text fontSize="$2" color="$gray10">
                      Each new login’s temporary password is below. Pass them on now: they aren’t
                      kept, and are gone when this closes.
                    </Text>
                  )}
                  {createResults.map((r) => (
                    <XStack
                      key={r.uid}
                      borderWidth={1}
                      borderColor="$borderColor"
                      borderRadius="$3"
                      padding="$3"
                      gap="$2"
                      alignItems="center"
                    >
                      <YStack flex={1}>
                        <Text fontWeight="600" fontSize="$3">
                          {r.displayName || r.email}
                        </Text>
                        <Text fontSize="$2" color="$gray10">
                          {r.email}
                        </Text>
                        {r.error && (
                          <Text fontSize="$2" color="$red10">
                            {r.error}
                          </Text>
                        )}
                        {r.password && (
                          <Text fontSize="$2" selectable>
                            Temporary password: {r.password}
                          </Text>
                        )}
                      </YStack>
                      <Text fontSize="$2" fontWeight="600" color={statusColor(r.status)}>
                        {statusLabel(r.status)}
                      </Text>
                    </XStack>
                  ))}
                </YStack>
              )}

              {/* Auth accounts without Firestore docs */}
              <YStack gap="$2">
                <XStack justifyContent="space-between" alignItems="center">
                  <YStack>
                    <Text fontWeight="700" fontSize="$4">
                      Auth Only ({result.orphanAuth.length})
                    </Text>
                    <Text fontSize="$2" color="$gray10">
                      In Auth but no Firestore profile
                    </Text>
                  </YStack>
                  {result.orphanAuth.length > 0 && (
                    <Button
                      size="$3"
                      theme="red"
                      onPress={() => deleteAuthAccounts(result.orphanAuth)}
                      disabled={deleting}
                    >
                      {deleting ? <Spinner size="small" /> : 'Delete All'}
                    </Button>
                  )}
                </XStack>
                {result.orphanAuth.length === 0 ? (
                  <Text color="$green10" fontSize="$3">
                    None — all clear
                  </Text>
                ) : (
                  result.orphanAuth.map((u) => (
                    <XStack
                      key={u.uid}
                      borderWidth={1}
                      borderColor="$borderColor"
                      borderRadius="$3"
                      padding="$3"
                      gap="$2"
                      alignItems="center"
                    >
                      <YStack flex={1}>
                        <Text fontWeight="600" fontSize="$3">
                          {u.displayName || '(no name)'}
                        </Text>
                        <Text fontSize="$2" color="$gray10">
                          {u.email || '(no email)'}
                        </Text>
                        <Text fontSize="$1" color="$gray8" selectable>
                          {u.uid}
                        </Text>
                      </YStack>
                      <XStack gap="$2">
                        <Button size="$2" theme="active" onPress={() => createProfileForOrphan(u)}>
                          Create Profile
                        </Button>
                        <Button
                          size="$2"
                          theme="red"
                          onPress={() => deleteAuthAccounts([u])}
                          disabled={deleting}
                        >
                          Delete
                        </Button>
                      </XStack>
                    </XStack>
                  ))
                )}
              </YStack>

              {/* Profiles with no name and no email: shown elsewhere as a bare uid */}
              <YStack gap="$2">
                <YStack>
                  <Text fontWeight="700" fontSize="$4">
                    No Name or Email ({(result.blankAccounts ?? []).length})
                  </Text>
                  <Text fontSize="$2" color="$gray10">
                    Accounts with nothing to know them by — shown in groups as an id. Give one a
                    name on the Users screen (search its id), or delete it.
                  </Text>
                </YStack>
                {(result.blankAccounts ?? []).length === 0 ? (
                  <Text color="$green10" fontSize="$3">
                    None — all clear
                  </Text>
                ) : (
                  (result.blankAccounts ?? []).map((a) => (
                    <XStack
                      key={a.uid}
                      borderWidth={1}
                      borderColor="$borderColor"
                      borderRadius="$3"
                      padding="$3"
                      gap="$2"
                      alignItems="center"
                    >
                      <YStack flex={1} gap={2}>
                        <Text fontSize="$2" fontWeight="600">
                          {a.uid}
                        </Text>
                        <Text fontSize="$2" color="$gray10">
                          {a.auth
                            ? [
                                a.auth.providers.length
                                  ? `Signs in with ${a.auth.providers.map(providerSaid).join(', ')}`
                                  : 'No way to sign in',
                                a.auth.phone || null,
                                a.auth.disabled ? 'disabled' : null,
                              ]
                                .filter(Boolean)
                                .join(' · ')
                            : 'No sign-in account'}
                        </Text>
                        {a.auth ? (
                          <Text fontSize="$2" color="$gray9">
                            Made {dateSaid(a.auth.created)}
                            {a.auth.lastSignIn
                              ? ` · last signed in ${dateSaid(a.auth.lastSignIn)}`
                              : ' · never signed in'}
                          </Text>
                        ) : null}
                        <Text fontSize="$2" color="$gray9">
                          {(a.roles ?? []).join(', ') || 'no roles'}
                        </Text>
                      </YStack>
                      <Button
                        size="$2"
                        theme="red"
                        onPress={() => deleteBlankAccount(a)}
                        disabled={deleting}
                      >
                        Delete
                      </Button>
                    </XStack>
                  ))
                )}
              </YStack>

              {/* Group and common-team members with no account at all */}
              <YStack gap="$2">
                <XStack justifyContent="space-between" alignItems="center" gap="$2">
                  <YStack flex={1}>
                    <Text fontWeight="700" fontSize="$4">
                      Members With No Account ({(result.strayMembers ?? []).length})
                    </Text>
                    <Text fontSize="$2" color="$gray10">
                      Still listed in a group or common team after their account was deleted.
                      Removed automatically each night too.
                    </Text>
                  </YStack>
                  {(result.strayMembers ?? []).length > 0 && (
                    <Button size="$3" theme="red" onPress={removeStrays} disabled={deleting}>
                      {deleting ? <Spinner size="small" /> : 'Remove Them'}
                    </Button>
                  )}
                </XStack>
                {(result.strayMembers ?? []).length === 0 ? (
                  <Text color="$green10" fontSize="$3">
                    None — all clear
                  </Text>
                ) : (
                  (result.strayMembers ?? []).map((m) => (
                    <YStack
                      key={m.uid}
                      borderWidth={1}
                      borderColor="$borderColor"
                      borderRadius="$3"
                      padding="$3"
                      gap={2}
                    >
                      <Text fontSize="$2" fontWeight="600">
                        {m.uid}
                      </Text>
                      <Text fontSize="$2" color="$gray10">
                        In {m.in.join(', ')}
                      </Text>
                    </YStack>
                  ))
                )}
              </YStack>

              {/* Public accounts still in groups: a member made public since */}
              <YStack gap="$2">
                <XStack justifyContent="space-between" alignItems="center" gap="$2">
                  <YStack flex={1}>
                    <Text fontWeight="700" fontSize="$4">
                      Non-Members Still in Groups ({(result.publicMembers ?? []).length})
                    </Text>
                    <Text fontSize="$2" color="$gray10">
                      Public accounts left in a group or common team after being made non-members.
                      Taken out of groups — and group chats — when made public now, and each night.
                    </Text>
                  </YStack>
                  {(result.publicMembers ?? []).length > 0 && (
                    <Button size="$3" theme="red" onPress={removeStrays} disabled={deleting}>
                      {deleting ? <Spinner size="small" /> : 'Remove Them'}
                    </Button>
                  )}
                </XStack>
                {(result.publicMembers ?? []).length === 0 ? (
                  <Text color="$green10" fontSize="$3">
                    None — all clear
                  </Text>
                ) : (
                  (result.publicMembers ?? []).map((m) => (
                    <YStack
                      key={m.uid}
                      borderWidth={1}
                      borderColor="$borderColor"
                      borderRadius="$3"
                      padding="$3"
                      gap={2}
                    >
                      <Text fontSize="$3" fontWeight="600">
                        {m.name}
                      </Text>
                      <Text fontSize="$2" color="$gray10">
                        In {m.in.join(', ')}
                      </Text>
                    </YStack>
                  ))
                )}
              </YStack>
            </YStack>
          </ScrollView>
        )}
      </YStack>
    </Modal>
  )
}
