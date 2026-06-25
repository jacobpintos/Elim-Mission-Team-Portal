import { useState, useEffect } from 'react'
import { Alert } from 'react-native'
import { FlashList } from '@shopify/flash-list'
import { YStack, XStack, Text, Button, Input } from 'tamagui'
import { useUsersStore } from '@/stores/usersStore'
import { useAuthStore } from '@/stores/authStore'
import { UserCard } from '@/features/admin/UserCard'
import { CreateUserSheet } from '@/features/admin/CreateUserSheet'
import { EditUserSheet } from '@/features/admin/EditUserSheet'
import { PendingDeletionCard, type PendingDeletion } from '@/features/admin/PendingDeletionCard'
import { audit } from '@/lib/audit'
import { useUIStore } from '@/stores/uiStore'
import {
  doc,
  updateDoc,
  onSnapshot,
  writeBatch,
  collection,
  getDocs,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { UserProfile } from '@/types/user'
import { ScreenTitle } from '@/components/ui/ScreenTitle'

export default function AdminUsers() {
  const { users, subscribe, unsubscribe } = useUsersStore()
  const { profile } = useAuthStore()
  const { toast } = useUIStore()

  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [editTarget, setEditTarget] = useState<UserProfile | null>(null)
  const [pendingDel, setPendingDel] = useState<PendingDeletion[]>([])
  const adminCount = Math.max(users.filter((u) => u.roles?.includes('admin')).length, 1)

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

  const memberUsers = users.filter(
    (u) => !(u.roles?.length === 1 && u.roles[0] === 'public')
  )

  const q = search.trim().toLowerCase()
  const filtered = q
    ? users.filter(
        (u) =>
          (u.displayName ?? '').toLowerCase().includes(q) ||
          (u.email ?? '').toLowerCase().includes(q) ||
          u.uid.toLowerCase().includes(q)
      )
    : memberUsers

  const execDelete = async (user: UserProfile) => {
    const batch = writeBatch(db)
    batch.delete(doc(db, 'users', user.uid))

    // Remove from all groups
    const groupsSnap = await getDocs(collection(db, 'groups'))
    groupsSnap.docs.forEach((g) => {
      const members: string[] = g.data().members ?? []
      if (members.includes(user.uid)) {
        batch.update(g.ref, {
          members: members.filter((m) => m !== user.uid),
        })
      }
    })

    // Remove from pendingDel in config/main
    await batch.commit()
    await updateDoc(doc(db, 'config', 'main'), {
      pendingDel: pendingDel.filter((d) => d.uid !== user.uid),
    })
    await audit('user.deleted', `Deleted user ${user.email}`, profile?.displayName ?? '')
    toast(`Deleted ${user.displayName}`, 'success')
  }

  const handleDeleteUser = (user: UserProfile) => {
    const isTargetAdmin = user.roles?.includes('admin')

    if (isTargetAdmin) {
      // Admin deletion requires approval workflow
      const alreadyPending = pendingDel.find((d) => d.uid === user.uid)
      if (alreadyPending) {
        toast('Deletion request already pending', 'info')
        return
      }
      Alert.alert(
        'Request Admin Deletion',
        `Deleting an admin requires approval from all ${adminCount} admin(s). Submit deletion request?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Submit Request',
            style: 'destructive',
            onPress: async () => {
              const newDel: PendingDeletion = {
                uid: user.uid,
                name: user.displayName,
                requestedBy: profile?.displayName ?? '',
                approvals: [profile?.uid ?? ''],
                totalAdmins: adminCount,
              }
              await updateDoc(doc(db, 'config', 'main'), {
                pendingDel: [...pendingDel, newDel],
              })
              await audit(
                'user.deletionRequested',
                `Requested deletion of admin ${user.email}`,
                profile?.displayName ?? ''
              )
              toast('Deletion request submitted', 'info')
            },
          },
        ]
      )
    } else {
      Alert.alert(
        'Delete User',
        `Are you sure you want to delete "${user.displayName}"? This cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => execDelete(user),
          },
        ]
      )
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
      // Execute deletion
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
    Alert.alert('Cancel Deletion Request', `Cancel deletion request for "${deletion.name}"?`, [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes, Cancel',
        onPress: async () => {
          await updateDoc(doc(db, 'config', 'main'), {
            pendingDel: pendingDel.filter((d) => d.uid !== deletion.uid),
          })
          await audit(
            'user.deletionCancelled',
            `Cancelled deletion of ${deletion.name}`,
            profile?.displayName ?? ''
          )
          toast('Deletion request cancelled', 'info')
        },
      },
    ])
  }

  return (
    <YStack flex={1} padding="$4" gap="$3">
      <ScreenTitle options={{ title: 'User Management', headerShown: false }} />

      <XStack alignItems="center" justifyContent="space-between">
        <Text fontSize="$6" fontWeight="700">
          Users ({memberUsers.length})
        </Text>
        <Button size="$3" onPress={() => setShowCreate(true)} theme="active">
          + Add User
        </Button>
      </XStack>

      <Input
        placeholder="Search by name or email..."
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
