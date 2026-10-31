import { useEffect, useState } from 'react'
import { ScrollView, Pressable, TextInput, View, StyleSheet } from 'react-native'
import { FullScreenOverlay } from '@/components/ui/FullScreenOverlay'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { YStack, XStack, Text } from 'tamagui'
import { useRouter } from 'expo-router'
import { useAuthStore } from '@/stores/authStore'
import { useMessagesStore } from '@/stores/messagesStore'
import { useUsersStore } from '@/stores/usersStore'
import { useGroupsStore } from '@/stores/groupsStore'
import { useThemeColors } from '@/theme/useThemeColors'
import { useUIStore } from '@/stores/uiStore'
import { canBeMessaged, isReadOnly } from '@/lib/roles'
import { sameId } from '@/lib/ids'
import { roomKind, roomTitle } from '@/lib/rooms'
import { ScreenTitle } from '@/components/ui/ScreenTitle'
import { Image } from '@/components/ui/Image'
import { InboxTabs, INBOX_TITLE } from '@/features/inbox/InboxTabs'
import { RecipientPicker } from '@/components/ui/RecipientPicker'
import { RoomAvatar } from '@/features/messages/RoomAvatar'
import { pickCover, setRoomCover, type PickedPhoto } from '@/features/messages/roomCover'
import type { Room } from '@/types/events'

/** When a room last had something said in it, for the newest first. */
const lastActive = (r: Room) => {
  const at = r.updatedAt as { toMillis?: () => number } | number | undefined
  return typeof at === 'number' ? at : (at?.toMillis?.() ?? 0)
}

export default function MessagesIndex() {
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { profile } = useAuthStore()
  const uid = profile?.uid ?? ''
  const toast = useUIStore((s) => s.toast)

  const { rooms, roomsError, loading, subscribe, unsubscribe, startChat } = useMessagesStore()
  const { users, subscribe: subUsers, unsubscribe: unsubUsers } = useUsersStore()
  const { groups, subscribe: subGroups, unsubscribe: unsubGroups } = useGroupsStore()

  const [showCreate, setShowCreate] = useState(false)
  const [roomName, setRoomName] = useState('')
  const [selectedMembers, setSelectedMembers] = useState<string[]>([])
  const [cover, setCover] = useState<PickedPhoto | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    subscribe(uid)
    subUsers()
    subGroups()
    return () => {
      unsubscribe()
      unsubUsers()
      unsubGroups()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid])

  // Only the conversations they are in — admins too (stores/messagesStore):
  // one reported to the admins is reached from Moderation.
  //
  // Flagged rooms used to be lifted into a separate red band at the top. It
  // repeated rooms that were already in the list below, opened to the same
  // place when tapped, and could not clear the flag — that lives on the
  // Moderation screen. All it really conveyed was that something needed
  // attention, which the count on the Moderation tab now says without
  // reordering this list.
  const displayRooms = rooms
    .filter((r) => r.members.some((m) => sameId(m, uid)))
    .sort((a, b) => lastActive(b) - lastActive(a))

  // Everyone chosen but themselves: one is a direct message, more a group chat.
  const others = selectedMembers.filter((m) => !sameId(m, uid))
  const direct = others.length === 1
  const group = others.length > 1
  const ready = direct || (group && !!roomName.trim())

  const closeCreate = () => {
    setShowCreate(false)
    setRoomName('')
    setSelectedMembers([])
    setCover(null)
  }

  const chooseCover = async () => {
    try {
      const picked = await pickCover()
      if (picked) setCover(picked)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Couldn’t open your photos', 'error')
    }
  }

  const handleCreate = async () => {
    if (!ready) return
    setCreating(true)
    try {
      const id = await startChat(uid, others, group ? roomName.trim() : '')
      if (group && cover) {
        await setRoomCover(id, cover).catch(() =>
          toast('The group chat was made, but its cover photo didn’t upload', 'error')
        )
      }
      closeCreate()
      router.push(`/messages/${id}`)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Couldn’t start the conversation', 'error')
    } finally {
      setCreating(false)
    }
  }

  // Only those who have Messages: not a public follower, nor an intern who has none.
  const nonPublicUsers = users.filter((u) => canBeMessaged(u) && !sameId(u.uid, uid))
  const otherName = direct ? users.find((u) => sameId(u.uid, others[0]))?.displayName : undefined

  return (
    <YStack flex={1} backgroundColor={colors.background}>
      <ScreenTitle options={{ title: INBOX_TITLE(profile) }} />
      <InboxTabs active="messages" />

      {loading ? (
        <YStack flex={1} alignItems="center" justifyContent="center">
          <Text color={colors.textMuted}>Loading conversations…</Text>
        </YStack>
      ) : roomsError ? (
        // Distinguish "we could not load your rooms" from "you have none" —
        // conflating them told members they were in no conversations when the
        // query had actually been rejected.
        <YStack flex={1} alignItems="center" justifyContent="center" padding="$4" gap="$2">
          <Text color={colors.text} textAlign="center" fontWeight="600">
            Could not load your conversations
          </Text>
          <Text color={colors.textMuted} textAlign="center" fontSize="$2">
            {roomsError}
          </Text>
        </YStack>
      ) : displayRooms.length === 0 ? (
        <YStack flex={1} alignItems="center" justifyContent="center" padding="$4">
          <Text color={colors.textMuted} textAlign="center">
            No conversations yet.
          </Text>
        </YStack>
      ) : (
        <ScrollView style={{ flex: 1 }}>
          <YStack>
            {displayRooms.map((room) => {
              const dm = roomKind(room) === 'dm'
              return (
                <Pressable
                  key={String(room.id)}
                  onPress={() => router.push(`/messages/${room.id}`)}
                >
                  <XStack
                    padding="$3"
                    gap="$3"
                    alignItems="center"
                    borderBottomWidth={1}
                    borderBottomColor={colors.border}
                    backgroundColor={colors.background}
                  >
                    <RoomAvatar room={room} uid={uid} people={users} size={46} />
                    <YStack flex={1} gap={2}>
                      <XStack justifyContent="space-between" alignItems="center">
                        <Text
                          color={colors.text}
                          fontWeight="700"
                          fontSize="$4"
                          numberOfLines={1}
                          flex={1}
                        >
                          {roomTitle(room, uid, users)}
                        </Text>
                        {room.call ? (
                          <XStack
                            backgroundColor={colors.primary}
                            borderRadius={99}
                            paddingHorizontal="$2"
                            paddingVertical={2}
                          >
                            <Text color="white" fontSize={10}>
                              📞 Call
                            </Text>
                          </XStack>
                        ) : null}
                      </XStack>
                      <Text color={colors.textMuted} fontSize="$2">
                        {dm ? 'Direct message' : `Group chat · ${room.members.length} people`}
                      </Text>
                    </YStack>
                  </XStack>
                </Pressable>
              )
            })}
          </YStack>
        </ScrollView>
      )}

      {/* Anyone on the team may start a conversation; a guest only reads. */}
      {!isReadOnly(profile) ? (
        <Pressable
          onPress={() => setShowCreate(true)}
          style={[styles.fab, { backgroundColor: colors.primary, bottom: insets.bottom + 16 }]}
        >
          <Text color="white" fontWeight="700" fontSize="$3">
            ⊕ New message
          </Text>
        </Pressable>
      ) : null}

      {/* New conversation: one person, a direct message; more, a group chat */}
      <FullScreenOverlay
        visible={showCreate}
        animationType="slide"
        transparent
        onRequestClose={closeCreate}
      >
        <View style={styles.overlay}>
          <YStack
            backgroundColor={colors.surface}
            borderRadius="$4"
            padding="$5"
            gap="$3"
            width="90%"
            maxWidth={500}
            maxHeight="80%"
          >
            <XStack justifyContent="space-between" alignItems="center">
              <Text color={colors.text} fontSize="$5" fontWeight="700">
                {group ? 'New group chat' : 'New message'}
              </Text>
              <Pressable onPress={closeCreate}>
                <Text color={colors.textMuted} fontSize="$4">
                  ✕
                </Text>
              </Pressable>
            </XStack>

            {/* No flex:1 here — inside the modal's auto-height (maxHeight-only)
                container a flex:1 child collapses to zero on native, hiding the
                member list. The inner ScrollView's maxHeight bounds it instead. */}
            <YStack gap="$1" flexShrink={1}>
              <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                TO ({others.length} chosen)
              </Text>
              <RecipientPicker
                users={nonPublicUsers.map((u) => ({
                  uid: u.uid,
                  displayName: u.displayName,
                  email: u.email,
                }))}
                groups={groups.map((g) => ({
                  id: g.id,
                  name: g.name,
                  members: g.members,
                }))}
                value={selectedMembers}
                onChange={setSelectedMembers}
                placeholder="Search people or groups…"
              />
              <Text color={colors.textMuted} fontSize="$1">
                One person is a direct message; two or more make a group chat.
              </Text>
            </YStack>

            {group ? (
              <>
                <YStack gap="$1">
                  <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                    GROUP NAME
                  </Text>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        color: colors.text,
                        borderColor: colors.border,
                        backgroundColor: colors.background,
                      },
                    ]}
                    value={roomName}
                    onChangeText={setRoomName}
                    placeholder="e.g. Worship Team"
                    placeholderTextColor={colors.textMuted}
                  />
                </YStack>
                <XStack gap="$3" alignItems="center">
                  {cover ? (
                    <Image
                      source={{ uri: cover.uri }}
                      style={{ width: 44, height: 44, borderRadius: 22 }}
                      contentFit="cover"
                    />
                  ) : null}
                  <Pressable onPress={chooseCover}>
                    <Text color={colors.primary} fontSize="$3" fontWeight="600">
                      {cover ? 'Change cover photo' : '📷 Add a cover photo (optional)'}
                    </Text>
                  </Pressable>
                </XStack>
              </>
            ) : null}

            <Pressable onPress={handleCreate} disabled={creating || !ready}>
              <XStack
                backgroundColor={colors.primary}
                borderRadius="$2"
                paddingVertical="$3"
                justifyContent="center"
                opacity={creating || !ready ? 0.5 : 1}
              >
                <Text color="white" fontWeight="700" fontSize="$3">
                  {creating
                    ? 'Starting…'
                    : group
                      ? 'Create group chat'
                      : otherName
                        ? `Message ${otherName}`
                        : 'Message'}
                </Text>
              </XStack>
            </Pressable>
          </YStack>
        </View>
      </FullScreenOverlay>
    </YStack>
  )
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
  },
})
