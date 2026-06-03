import { useState, useEffect, useRef } from 'react'
import { TextInput as RNTextInput } from 'react-native'
import { FlashList } from '@shopify/flash-list'
import { YStack, XStack, Text, Button, Spinner } from 'tamagui'
import { doc, onSnapshot, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useUsersStore } from '@/stores/usersStore'
import { useAuthStore } from '@/stores/authStore'
import { audit } from '@/lib/audit'
import { useUIStore } from '@/stores/uiStore'
import { Avatar } from '@/components/ui/Avatar'
import type { UserProfile } from '@/types/user'
import { useThemeStore } from '@/stores/themeStore'

export default function AdminLeadership() {
  const { users, subscribe, unsubscribe } = useUsersStore()
  const { profile } = useAuthStore()
  const { toast } = useUIStore()
  const { theme } = useThemeStore()

  const [leadershipTeam, setLeadershipTeam] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const titleDraft = useRef<Record<string, string>>({})

  useEffect(() => {
    subscribe()
    return () => unsubscribe()
  }, [])

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'config', 'main'), (snap) => {
      const data = snap.data()
      const team = data?.connectConfig?.leadershipTeam ?? []
      setLeadershipTeam(team.map((v: unknown) => String(v)))
      setLoading(false)
    })
    return () => unsub()
  }, [])

  const saveLeadershipTeam = async (team: string[]) => {
    setSaving(true)
    try {
      await updateDoc(doc(db, 'config', 'main'), {
        'connectConfig.leadershipTeam': team,
      })
      await audit(
        'leadership.updated',
        `Updated leadership team: ${team.length} members`,
        profile?.displayName ?? ''
      )
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save'
      toast(message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const saveTitle = async (uid: string, title: string) => {
    try {
      await updateDoc(doc(db, 'users', uid), { title: title.trim() })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save title'
      toast(message, 'error')
    }
  }

  const toggleMember = async (uid: string) => {
    let updated: string[]
    if (leadershipTeam.includes(uid)) {
      updated = leadershipTeam.filter((id) => id !== uid)
    } else {
      updated = [...leadershipTeam, uid]
    }
    setLeadershipTeam(updated)
    await saveLeadershipTeam(updated)
  }

  if (loading) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center">
        <Spinner size="large" />
      </YStack>
    )
  }

  return (
    <YStack flex={1} padding="$4" gap="$3">

      <XStack alignItems="center" justifyContent="space-between">
        <Text fontSize="$6" fontWeight="700">
          Leadership Team
        </Text>
        {saving && <Spinner size="small" />}
      </XStack>

      <Text fontSize="$3" color="$gray10">
        Toggle members to add/remove from the leadership team. Edit titles inline.
      </Text>

      <FlashList
        data={users}
        keyExtractor={(u) => u.uid}
        renderItem={({ item }) => {
          const isLeader = leadershipTeam.includes(item.uid)
          const userWithTitle = item as UserProfile & { title?: string }
          return (
            <XStack
              alignItems="center"
              gap="$3"
              paddingVertical="$2"
              borderBottomWidth={1}
              borderBottomColor="$borderColor"
            >
              <Avatar
                uri={item.photoURL}
                displayName={item.displayName}
                size={40}
              />

              <YStack flex={1} gap="$1">
                <Text fontWeight="600" fontSize="$3">
                  {item.displayName}
                </Text>
                <RNTextInput
                  placeholder="Title (e.g. Worship Leader)"
                  defaultValue={userWithTitle.title ?? ''}
                  onChangeText={(v) => { titleDraft.current[item.uid] = v }}
                  onBlur={() => saveTitle(item.uid, titleDraft.current[item.uid] ?? userWithTitle.title ?? '')}
                  style={{
                    fontSize: 13,
                    color: '#888',
                    borderBottomWidth: 1,
                    borderBottomColor: '#ddd',
                    paddingVertical: 2,
                  }}
                />
              </YStack>

              <Button
                size="$2"
                onPress={() => toggleMember(item.uid)}
                backgroundColor={isLeader ? theme.primary : undefined}
                theme={isLeader ? undefined : 'gray'}
              >
                <Text color={isLeader ? 'white' : '$color'} fontSize="$2" fontWeight="600">
                  {isLeader ? 'Remove' : 'Add'}
                </Text>
              </Button>
            </XStack>
          )
        }}
        ListEmptyComponent={
          <Text color="$gray10" textAlign="center" paddingVertical="$4">
            No users found
          </Text>
        }
      />
    </YStack>
  )
}
