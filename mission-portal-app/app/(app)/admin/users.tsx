import { useState, useEffect } from 'react'
import { FlashList } from '@shopify/flash-list'
import { YStack, XStack, Text, Button, Input } from 'tamagui'
import { useUsersStore } from '@/stores/usersStore'
import { useAuthStore } from '@/stores/authStore'
import { UserCard } from '@/features/admin/UserCard'
import { CreateUserSheet } from '@/features/admin/CreateUserSheet'
import { EditUserSheet } from '@/features/admin/EditUserSheet'
import { AuthAuditSheet } from '@/features/admin/AuthAuditSheet'
import { PendingDeletionCard, type PendingDeletion } from '@/features/admin/PendingDeletionCard'
import { audit } from '@/lib/audit'
import { useUIStore } from '@/stores/uiStore'
import { doc, updateDoc, onSnapshot, writeBatch, collection, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { UserProfile } from '@/types/user'
import { ScreenTitle } from '@/components/ui/ScreenTitle'
import { confirmAsync } from '@/lib/confirm'

export default function AdminUsers() {
  const { users, subscribe, unsubscribe } = useUsersStore()
  const { profile } = useAuthStore()
  const { toast } = useUIStore()

  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [showAudit, setShowAudit] = useState(false)
  const [editTarget, setEditTarget] = useState<UserProfile | null>(null)
  const [pendingDel, setPendingDel] = useState<PendingDeletion[]>([])

  useEffect(() => {
    subscribe()
    return () => unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'config', 'main'), (snap) => {
      const data = snap.data()
      setPendingDel(data?.pendingDel ?? [])
    })
    return () => unsub()
  }, [])

  const memberUsers = users.filter((u) => !(u.roles?.length === 1 && u.roles[0] === 'public'))

  const q = search.trim().toLowerCase()
  // Search the same set the list shows. Filtering `users` here instead put
  // public-only accounts back on screen the moment anyone typed.
  const filtered = q
    ? memberUsers.filter(
        (u) =>
          (u.displayName ?? '').toLowerCase().includes(q) ||
          (u.email ?? '').toLowerCase().includes(q) ||
          u.uid.toLowerCase().includes(q)
      )
    : memberUsers

  const execDelete = async (user: UserProfile) => {
    const batch = writeBatch(db)
    batch.delete(doc(db, 'users', user.uid))

    const groupsSnap = await getDocs(collection(db, 'groups'))
    groupsSnap.docs.forEach((g) => {
      const members: string[] = g.data().members ?? []
      if (members.includes(user.uid)) {
        batch.update(g.ref, {
          members: members.filter((m) => m !== user.uid),
        })
      }
    })

    await batch.commit()
    await updateDoc(doc(db, 'config', 'main'), {
      pendingDel: pendingDel.filter((d) => d.uid !== user.uid),
    })
    await audit('user.deleted', `Deleted user ${user.email}`, profile?.displayName ?? '')
    toast(`Deleted ${user.displayName}`, 'success')
  }

  const handleDeleteUser = async (user: UserProfile) => {
    const isTargetAdmin = user.roles?.includes('admin')

    if (isTargetAdmin) {
      const alreadyPending = pendingDel.find((d) => d.uid === user.uid)
      if (alreadyPending) {
        toast('Deletion request already pending — see Pending Deletions above', 'info')
        return
      }
      // Only count OTHER admins (not the one being deleted) as required approvers
      const otherAdminCount = Math.max(
        users.filter((u) => u.roles?.includes('admin') && u.uid !== user.uid).length,
        1
      )
      const ok = await confirmAsync(
        `Deleting an admin requires approval from ${otherAdminCount} admin(s). Submit deletion request?`
      )
      if (!ok) return
      const newDel: PendingDeletion = {
        uid: user.uid,
        name: user.displayName,
        requestedBy: profile?.displayName ?? '',
        approvals: [profile?.uid ?? ''],
        totalAdmins: otherAdminCount,
      }
      await updateDoc(doc(db, 'config', 'main'), {
        pendingDel: [...pendingDel, newDel],
      })
      await audit(
        'user.deletionRequested',
        `Requested deletion of admin ${user.email}`,
        profile?.displayName ?? ''
      )
      // If the submitting admin is already the sole required approver, execute immediately
      if (newDel.approvals.length >= otherAdminCount) {
        await execDelete(user)
      } else {
        toast('Deletion request submitted', 'info')
      }
    } else {
      const ok = await confirmAsync(
        `Are you sure you want to delete "${user.displayName ?? user.email}"? This cannot be undone.`,
        { destructive: true, confirmLabel: 'Delete' }
      )
      if (!ok) return
      await execDelete(user)
    }
  }

  const handleApprove = async (deletion: PendingDeletion) => {
    const currentUid = profile?.uid ?? ''
    if (deletion.approvals.includes(currentUid)) return

    const updatedApprovals = [...deletion.approvals, currentUid]
    const updatedDel = pendingDel.map((d) =>
      d.uid === deletion.uid ? { ...d, approvals: updatedApprovals } : d
    )

    if (updatedApprovals.length >= deletion.totalAdmins) {
      const target = users.find((u) => u.uid === deletion.uid)
      if (target) {
        await execDelete(target)
      }
    } else {
      await updateDoc(doc(db, 'config', 'main'), { pendingDel: updatedDel })
      await audit(
        'user.deletionApproved',
        `Approved deletion of ${deletion.name}`,
        profile?.displayName ?? ''
      )
      toast('Approval recorded', 'success')
    }
  }

  const handleCancelDeletion = async (deletion: PendingDeletion) => {
    const ok = await confirmAsync(`Cancel deletion request for "${deletion.name}"?`)
    if (!ok) return
    await updateDoc(doc(db, 'config', 'main'), {
      pendingDel: pendingDel.filter((d) => d.uid !== deletion.uid),
    })
    await audit(
      'user.deletionCancelled',
      `Cancelled deletion of ${deletion.name}`,
      profile?.displayName ?? ''
    )
    toast('Deletion request cancelled', 'info')
  }

  return (
    <YStack flex={1} padding="$4" gap="$3">
      <ScreenTitle options={{ title: 'User Management', headerShown: false }} />

      <XStack alignItems="center" justifyContent="space-between">
        <Text fontSize="$6" fontWeight="700">
          Users ({memberUsers.length})
        </Text>
        <XStack gap="$2">
          <Button size="$3" onPress={() => setShowAudit(true)} theme="gray">
            Auth Audit
          </Button>
          <Button size="$3" onPress={() => setShowCreate(true)} theme="active">
            + Add User
          </Button>
        </XStack>
      </XStack>

      <Input
        placeholder="Search by name, email, or UID..."
        value={search}
        onChangeText={setSearch}
        size="$3"
      />

      {pendingDel.length > 0 && (
        <YStack gap="$2">
          <Text fontWeight="700" color="$red10" fontSize="$4">
            Pending Deletions
          </Text>
          {pendingDel.map((d) => (
            <PendingDeletionCard
              key={d.uid}
              deletion={d}
              onApprove={handleApprove}
              onCancel={handleCancelDeletion}
            />
          ))}
        </YStack>
      )}

      <FlashList
        data={filtered}
        keyExtractor={(u) => u.uid}
        renderItem={({ item }) => (
          <YStack marginBottom="$2">
            <UserCard
              user={item}
              currentUid={profile?.uid}
              onEditRole={(u) => setEditTarget(u)}
              onDelete={handleDeleteUser}
            />
          </YStack>
        )}
        ListEmptyComponent={
          <Text color="$gray10" textAlign="center" paddingVertical="$4">
            {search ? 'No users match your search' : 'No users found'}
          </Text>
        }
      />

      <AuthAuditSheet open={showAudit} onClose={() => setShowAudit(false)} />
      <CreateUserSheet open={showCreate} onClose={() => setShowCreate(false)} />
      <EditUserSheet
        key={editTarget?.uid ?? 'none'}
        open={editTarget !== null}
        onClose={() => setEditTarget(null)}
        user={editTarget}
      />
    </YStack>
  )
}
