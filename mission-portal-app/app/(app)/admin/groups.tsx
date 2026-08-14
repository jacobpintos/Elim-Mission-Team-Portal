import { useEffect, useState } from 'react'
import { Alert, Platform } from 'react-native'
import { FlashList } from '@shopify/flash-list'
import { YStack, XStack, Text, Button, Spinner } from 'tamagui'
import { doc, deleteDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { GroupCard, type GroupDoc } from '@/features/admin/GroupCard'
import { CreateGroupSheet } from '@/features/admin/CreateGroupSheet'
import { EditGroupSheet } from '@/features/admin/EditGroupSheet'
import { audit } from '@/lib/audit'
import { useAuthStore } from '@/stores/authStore'
import { useUIStore } from '@/stores/uiStore'
import { useUsersStore } from '@/stores/usersStore'
import { useGroupsStore } from '@/stores/groupsStore'
import { ScreenTitle } from '@/components/ui/ScreenTitle'

export default function AdminGroups() {
  const { profile } = useAuthStore()
  const { toast } = useUIStore()
  const { subscribe: subUsers, unsubscribe: unsubUsers } = useUsersStore()
  const { groups, loading, subscribe: subGroups, unsubscribe: unsubGroups } = useGroupsStore()

  const [showCreate, setShowCreate] = useState(false)
  const [editTarget, setEditTarget] = useState<GroupDoc | null>(null)

  useEffect(() => {
    subUsers()
    subGroups()
    return () => {
      unsubUsers()
      unsubGroups()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sorted = [...groups].sort((a, b) => {
    if (a.name === 'All') return -1
    if (b.name === 'All') return 1
    return a.name.localeCompare(b.name)
  })

  const handleDelete = (group: GroupDoc) => {
    if (group.name === 'All') return
    const msg = `Delete group "${group.name}"? This cannot be undone.`
    const doDelete = async () => {
      try {
        await deleteDoc(doc(db, 'groups', group.id))
        await audit('group.deleted', `Deleted group "${group.name}"`, profile?.displayName ?? '')
        toast('Group deleted', 'success')
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to delete group'
        toast(message, 'error')
      }
    }
    if (Platform.OS === 'web') {
      if (window.confirm(msg)) doDelete()
      return
    }
    Alert.alert('Delete Group', msg, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: doDelete },
    ])
  }

  return (
    <YStack flex={1} padding="$4" gap="$3">
      <ScreenTitle options={{ title: 'Groups', headerShown: false }} />

      <XStack alignItems="center" justifyContent="space-between">
        <Text fontSize="$6" fontWeight="700">
          Groups ({sorted.length})
        </Text>
        <Button size="$3" onPress={() => setShowCreate(true)} theme="active">
          + New Group
        </Button>
      </XStack>

      {loading ? (
        <YStack flex={1} alignItems="center" justifyContent="center">
          <Spinner size="large" />
        </YStack>
      ) : (
        <FlashList
          data={sorted}
          keyExtractor={(g) => g.id}
          renderItem={({ item }) => (
            <YStack marginBottom="$2">
              <GroupCard group={item} onEdit={(g) => setEditTarget(g)} onDelete={handleDelete} />
            </YStack>
          )}
          ListEmptyComponent={
            <Text color="$gray10" textAlign="center" paddingVertical="$4">
              No groups found
            </Text>
          }
        />
      )}

      <CreateGroupSheet open={showCreate} onClose={() => setShowCreate(false)} />
      <EditGroupSheet
        open={editTarget !== null}
        onClose={() => setEditTarget(null)}
        group={editTarget}
      />
    </YStack>
  )
}
