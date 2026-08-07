import { useState } from 'react'
import { ScrollView } from 'react-native'
import { YStack, XStack, Text, Button, Spinner } from 'tamagui'
import { Modal } from '@/components/ui/Modal'
import { useUIStore } from '@/stores/uiStore'
import { useAuthStore } from '@/stores/authStore'
import { audit } from '@/lib/audit'
import { functions, db } from '@/lib/firebase'
import { httpsCallable } from 'firebase/functions'
import { doc, deleteDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { confirmAsync } from '@/lib/confirm'

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

type AuditResult = {
  orphanFirestore: OrphanFirestoreDoc[]
  orphanAuth: OrphanAuthAccount[]
}

type CreateAuthResult = {
  uid: string
  email: string
  displayName: string
  status: 'created' | 'already_exists' | 'error'
  error?: string
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
  const [result, setResult] = useState<AuditResult | null>(null)
  const [createResults, setCreateResults] = useState<CreateAuthResult[] | null>(null)

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
      `Create Auth accounts for all ${result.orphanFirestore.length} orphan users? Default password will be 12345678.`,
      { destructive: true }
    )
    if (!ok) return
    setCreating(true)
    try {
      const createAuthForOrphans = httpsCallable(functions, 'createAuthForOrphans', {
        timeout: 120000,
      })
      const uids = result.orphanFirestore.map((u) => u.uid)
      const res = await createAuthForOrphans({ uids })
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
      notificationPrefs: {
        newAssignment: { push: true, email: false },
        newMessage: { push: true, email: false },
        eventReminder: { push: true, email: true },
        announcement: { push: true, email: false },
        issueAssigned: { push: true, email: false },
        weeklyDigest: false,
        monthlyDigest: false,
        eventJoin: { push: true, email: false },
        eventRemoved: { push: true, email: false },
        worshipSetAssigned: { push: true, email: false },
        taskDueSoon: { push: true, email: false },
        rsvpNonAvailable: { push: true, email: false },
        kaizenSubmission: { push: true, email: false },
        issueSubmission: { push: true, email: false },
        eventHealthBehind: { push: true, email: false },
        chatFlagged: { push: true, email: false },
        securityReport: { push: true, email: false },
        securityReportUrgent: true,
        weatherAlertAdmin: { push: true, email: false },
      },
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
          Compares Firebase Auth accounts against Firestore user documents to find mismatches.
        </Text>

        <Button onPress={runAudit} disabled={loading || creating} theme="active" size="$3">
          {loading ? <Spinner size="small" /> : result ? 'Re-run Audit' : 'Run Audit'}
        </Button>

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
            </YStack>
          </ScrollView>
        )}
      </YStack>
    </Modal>
  )
}
