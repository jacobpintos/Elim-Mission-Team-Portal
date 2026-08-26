import { useState, useEffect, useRef } from 'react'
import { TextInput as RNTextInput } from 'react-native'
import { FlashList } from '@shopify/flash-list'
import { YStack, XStack, Text, Button, Spinner } from 'tamagui'
import { Stack } from 'expo-router'
import { doc, onSnapshot, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useUsersStore } from '@/stores/usersStore'
import { useAuthStore } from '@/stores/authStore'
import { audit } from '@/lib/audit'
import { useUIStore } from '@/stores/uiStore'
import { Avatar } from '@/components/ui/Avatar'
import type { UserProfile } from '@/types/user'
import { useThemeStore } from '@/stores/themeStore'
import { ScreenTitle } from '@/components/ui/ScreenTitle'

export default function AdminLeadership() {
  const { users, subscribe, unsubscribe } = useUsersStore()
  const { profile } = useAuthStore()
  const { toast } = useUIStore()
  const { theme } = useThemeStore()

  const [leadershipTeam, setLeadershipTeam] = useState<string[]>([])
  const [coordinator, setCoordinator] = useState('')
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
      setCoordinator(String(data?.connectConfig?.connectionsCoordinator ?? ''))
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

  /**
   * Hand the Connections Coordinator identifier to someone, or take it back.
   *
   * Config rather than a field on the user, and deliberately not the `title`
   * beside it: a title is shown on the person's profile, and this is not
   * something the church publishes about them — it is a job the app routes to.
   * One holder at a time, so setting it replaces whoever held it.
   *
   * Everything addressed to the coordinator goes wherever this points, so
   * removing someone from the leadership team gives it up too — leaving it
   * pointing at a former leader would send them texting-list requests they are
   * no longer meant to see.
   */
  const setConnectionsCoordinator = async (uid: string) => {
    const next = coordinator === uid ? '' : uid
    setCoordinator(next)
    setSaving(true)
    try {
      await updateDoc(doc(db, 'config', 'main'), {
        'connectConfig.connectionsCoordinator': next,
      })
      await audit(
        'leadership.coordinator',
        next
          ? `Connections Coordinator set to ${users.find((u) => u.uid === next)?.displayName ?? next}`
          : 'Connections Coordinator cleared',
        profile?.displayName ?? ''
      )
    } catch (err: unknown) {
      setCoordinator(coordinator)
      const message = err instanceof Error ? err.message : 'Failed to save'
      toast(message, 'error')
    } finally {
      setSaving(false)
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
    // Taken off the team, so the identifier goes with them — otherwise the
    // day's texting-list requests keep arriving for a former leader.
    if (!updated.includes(uid) && coordinator === uid) {
      await setConnectionsCoordinator(uid)
    }
  }

  if (loading) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center">
        <ScreenTitle options={{ title: 'Leadership Team', headerShown: false }} />
        <Spinner size="large" />
      </YStack>
    )
  }

  return (
    <YStack flex={1} padding="$4" gap="$3">
      <ScreenTitle options={{ title: 'Leadership Team', headerShown: false }} />

      <XStack alignItems="center" justifyContent="space-between">
        <Text fontSize="$6" fontWeight="700">
          Leadership Team
        </Text>
        {saving && <Spinner size="small" />}
      </XStack>

      <Text fontSize="$3" color="$gray10">
        Toggle members to add/remove from the leadership team. Edit titles inline.
      </Text>

      {/* The identifier is a routing address, not a title — it decides who
          receives the daily texting-list requests and appears nowhere on the
          person's profile. Named here so an admin can see who holds it
          without opening every row. */}
      <YStack
        backgroundColor="$surface"
        borderRadius="$3"
        padding="$3"
        gap="$1"
        borderWidth={1}
        borderColor="$borderColor"
      >
        <Text fontSize="$3" fontWeight="700">
          Connections Coordinator
        </Text>
        <Text fontSize="$2" color="$gray10">
          {coordinator
            ? `${users.find((u) => u.uid === coordinator)?.displayName ?? coordinator} receives the daily list of people asking to join the texting list.`
            : 'Nobody holds this yet. Requests to join the texting list are held until someone does. Use “Make Coordinator” on a leadership member below.'}
        </Text>
      </YStack>

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
              <Avatar uri={item.photoURL} displayName={item.displayName} size={40} />

              <YStack flex={1} gap="$1">
                <Text fontWeight="600" fontSize="$3">
                  {item.displayName}
                </Text>
                <RNTextInput
                  placeholder="Title (e.g. Worship Leader)"
                  defaultValue={userWithTitle.title ?? ''}
                  onChangeText={(v) => {
                    titleDraft.current[item.uid] = v
                  }}
                  onBlur={() =>
                    saveTitle(item.uid, titleDraft.current[item.uid] ?? userWithTitle.title ?? '')
                  }
                  style={{
                    fontSize: 13,
                    color: '#888',
                    borderBottomWidth: 1,
                    borderBottomColor: '#ddd',
                    paddingVertical: 2,
                  }}
                />
              </YStack>

              <YStack gap="$1" alignItems="flex-end">
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
                {/* Offered only to leadership: the identifier is a job within
                    the team, so it cannot be given to someone outside it. */}
                {isLeader ? (
                  <Button
                    size="$2"
                    onPress={() => setConnectionsCoordinator(item.uid)}
                    backgroundColor={coordinator === item.uid ? theme.primary : undefined}
                    theme={coordinator === item.uid ? undefined : 'gray'}
                  >
                    <Text
                      color={coordinator === item.uid ? 'white' : '$color'}
                      fontSize="$1"
                      fontWeight="600"
                    >
                      {coordinator === item.uid ? 'Coordinator ✓' : 'Make Coordinator'}
                    </Text>
                  </Button>
                ) : null}
              </YStack>
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
