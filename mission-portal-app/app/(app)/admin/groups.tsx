import { useState, useEffect } from 'react'
import { Alert } from 'react-native'
import { FlashList } from '@shopify/flash-list'
import { YStack, XStack, Text, Button, Spinner } from 'tamagui'
import { Stack } from 'expo-router'
import { collection, onSnapshot, doc, deleteDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { GroupCard, type GroupDoc } from '@/features/admin/GroupCard'
import { CreateGroupSheet } from '@/features/admin/CreateGroupSheet'
import { EditGroupSheet } from '@/features/admin/EditGroupSheet'
import { audit } from '@/lib/audit'
import { useAuthStore } from '@/stores/authStore'
import { useUIStore } from '@/stores/uiStore'
import { useUsersStore } from '@/stores/usersStore'

export default function AdminGroups() {
  const { profile } = useAuthStore()
  const { toast } = useUIStore()
  const { subscribe, unsubscribe } = useUsersStore()

  const [groups, setGroups] = useState<GroupDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [editTarget, setEditTarget] = useState<GroupDoc | null>(null)

  useEffect(() => {
    subscribe()
    return () => unsubscribe()
  }, [])

  useEffect(() => {
    setLoading(true)
    const unsub = onSnapshot(collection(db, 'groups'), (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as GroupDoc))
      // Sort: "All" first, then alphabetical
      data.sort((a, b) => {
        if (a.name === 'All') return -1
        if (b.name === 'All') return 1
        return a.name.localeCompare(b.name)
      })
      setGroups(data)
      setLoading(false)
    })
    return () => unsub()
  }, [])

  const handleDelete = (group: GroupDoc) => {
    if (group.name === 'All') return
    Alert.alert(
      'Delete Group',
      `Delete group "${group.name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDoc(doc(db, 'groups', group.id))
              await audit(
                'group.deleted',
                `Deleted group "${group.name}"`,
                profile?.displayName ?? ''
              )
              toast('Group deleted', 'success')
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : 'Failed to delete group'
              toast(message, 'error')
            }
          },
        },
      ]
    )
  }

  return (
    <YStack flex={1} padding="$4" gap="$3">
      <Stack.Screen options={{ title: 'Groups', headerShown: false }} />

      <XStack alignItems="center" justifyContent="space-between">
        <Text fontSize="$6" fontWeight="700">
          Groups ({groups.length})
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
          data={groups}
          keyExtractor={(g) => g.id}
          renderItem={({ item }) => (
            <YStack marginBottom="$2">
              <GroupCard
                group={item}
                onEdit={(g) => setEditTarget(g)}
                onDelete={handleDelete}
              />
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
