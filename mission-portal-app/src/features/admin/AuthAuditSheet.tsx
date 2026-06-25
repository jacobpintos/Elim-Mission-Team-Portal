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

interface AuthAuditSheetProps {
  open: boolean
  onClose: () => void
}

export function AuthAuditSheet({ open, onClose }: AuthAuditSheetProps) {
  const { toast } = useUIStore()
  const { profile } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AuditResult | null>(null)

  const runAudit = async () => {
    setLoading(true)
    setResult(null)
    try {
      const auditAuthUsers = httpsCallable(functions, 'auditAuthUsers')
      const res = await auditAuthUsers({})
      setResult(res.data as AuditResult)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Audit failed'
      toast(message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const deleteOrphanDoc = async (user: OrphanFirestoreDoc) => {
    const ok = typeof window !== 'undefined' && window.confirm(
      `Delete orphan Firestore doc for "${user.displayName ?? user.email ?? user.uid}"? This has no Auth account.`
    )
    if (!ok) return
    await deleteDoc(doc(db, 'users', user.uid))
    await audit('user.deleted', `Deleted orphan Firestore doc ${user.uid} (${user.email ?? 'no email'})`, profile?.displayName ?? '')
    toast('Orphan document deleted', 'success')
    setResult((r) => r ? { ...r, orphanFirestore: r.orphanFirestore.filter((u) => u.uid !== user.uid) } : r)
  }

  const createProfileForOrphan = async (user: OrphanAuthAccount) => {
    const ok = typeof window !== 'undefined' && window.confirm(
      `Create a Firestore profile for Auth account "${user.displayName || user.email}"?`
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
      },
      pushTokens: {},
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    await audit('user.created', `Created missing Firestore profile for Auth account ${user.uid} (${user.email})`, profile?.displayName ?? '')
    toast('Profile created', 'success')
    setResult((r) => r ? { ...r, orphanAuth: r.orphanAuth.filter((u) => u.uid !== user.uid) } : r)
  }

  return (
    <Modal open={open} onOpenChange={(v) => { if (!v) onClose() }} title="Auth Sync Audit">
      <YStack gap="$3" padding="$2">
        <Text fontSize="$2" color="$gray10">
          Compares Firebase Auth accounts against Firestore user documents to find mismatches.
        </Text>

        <Button onPress={runAudit} disabled={loading} theme="active" size="$3">
          {loading ? <Spinner size="small" /> : result ? 'Re-run Audit' : 'Run Audit'}
        </Button>

        {result && (
          <ScrollView style={{ maxHeight: 480 }}>
            <YStack gap="$4">
              <YStack gap="$2">
                <Text fontWeight="700" fontSize="$4">
                  Orphan Firestore Docs ({result.orphanFirestore.length})
                </Text>
                <Text fontSize="$2" color="$gray10">
                  These exist in Firestore but have no Firebase Auth account.
                </Text>
                {result.orphanFirestore.length === 0 ? (
                  <Text color="$green10" fontSize="$3">None — all clear</Text>
                ) : (
                  result.orphanFirestore.map((u) => (
                    <XStack key={u.uid} borderWidth={1} borderColor="$borderColor" borderRadius="$3"
                      padding="$3" gap="$2" alignItems="center">
                      <YStack flex={1}>
                        <Text fontWeight="600" fontSize="$3">{u.displayName ?? '(no name)'}</Text>
                        <Text fontSize="$2" color="$gray10">{u.email ?? '(no email)'}</Text>
                        <Text fontSize="$1" color="$gray8" selectable>{u.uid}</Text>
                        <Text fontSize="$2" color="$gray9">{(u.roles ?? []).join(', ')}</Text>
                      </YStack>
                      <Button size="$2" theme="red" onPress={() => deleteOrphanDoc(u)}>Delete</Button>
                    </XStack>
                  ))
                )}
              </YStack>

              <YStack gap="$2">
                <Text fontWeight="700" fontSize="$4">
                  Auth Accounts Without Profile ({result.orphanAuth.length})
                </Text>
                <Text fontSize="$2" color="$gray10">
                  These exist in Firebase Auth but have no Firestore document.
                </Text>
                {result.orphanAuth.length === 0 ? (
                  <Text color="$green10" fontSize="$3">None — all clear</Text>
                ) : (
                  result.orphanAuth.map((u) => (
                    <XStack key={u.uid} borderWidth={1} borderColor="$borderColor" borderRadius="$3"
                      padding="$3" gap="$2" alignItems="center">
                      <YStack flex={1}>
                        <Text fontWeight="600" fontSize="$3">{u.displayName || '(no name)'}</Text>
                        <Text fontSize="$2" color="$gray10">{u.email || '(no email)'}</Text>
                        <Text fontSize="$1" color="$gray8" selectable>{u.uid}</Text>
                      </YStack>
                      <Button size="$2" theme="active" onPress={() => createProfileForOrphan(u)}>
                        Create Profile
                      </Button>
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
