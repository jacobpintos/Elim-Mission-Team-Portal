import { useEffect, useState } from 'react'
import { ScrollView, Pressable, TextInput, Modal, View, StyleSheet } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { useRouter } from 'expo-router'
import { useAuthStore } from '@/stores/authStore'
import { useMessagesStore } from '@/stores/messagesStore'
import { useUsersStore } from '@/stores/usersStore'
import { useThemeColors } from '@/theme/useThemeColors'
import { useUIStore } from '@/stores/uiStore'
import { isAdmin } from '@/lib/roles'
import { sameId } from '@/lib/ids'

export default function MessagesIndex() {
  const colors = useThemeColors()
  const router = useRouter()
  const { profile } = useAuthStore()
  const uid = profile?.uid ?? ''
  const admin = isAdmin(profile)
  const toast = useUIStore((s) => s.toast)

  const { rooms, loading, subscribe, unsubscribe, createRoom } = useMessagesStore()
  const { users, subscribe: subUsers, unsubscribe: unsubUsers } = useUsersStore()

  const [showCreate, setShowCreate] = useState(false)
  const [roomName, setRoomName] = useState('')
  const [selectedMembers, setSelectedMembers] = useState<string[]>([])
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    subscribe()
    subUsers()
    return () => {
      unsubscribe()
      unsubUsers()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Only show rooms the current user is a member of
  const myRooms = rooms.filter((r) => r.members.some((m) => sameId(m, uid)))
  // Admins see all rooms; flagged rooms (with reviewers) highlighted separately
  const displayRooms = admin ? rooms : myRooms
  const flaggedRooms = admin ? rooms.filter((r) => r.reviewers && r.reviewers.length > 0) : []
  const flaggedIds = new Set(flaggedRooms.map((r) => String(r.id)))
  const unflaggedRooms = displayRooms.filter((r) => !flaggedIds.has(String(r.id)))

  const toggleMember = (memberId: string) => {
    setSelectedMembers((prev) =>
      prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId]
    )
  }

  const handleCreate = async () => {
    if (!roomName.trim()) {
      toast('Room name is required', 'error')
      return
    }
    if (selectedMembers.length === 0) {
      toast('Select at least one member', 'error')
      return
    }
    setCreating(true)
    try {
      await createRoom(roomName.trim(), selectedMembers)
      toast('Room created', 'success')
      setShowCreate(false)
      setRoomName('')
      setSelectedMembers([])
    } catch {
      toast('Failed to create room', 'error')
    } finally {
      setCreating(false)
    }
  }

  const nonPublicUsers = users.filter((u) => !u.roles?.includes('public'))

  return (
    <YStack flex={1} backgroundColor={colors.background}>

      {loading ? (
        <YStack flex={1} alignItems="center" justifyContent="center">
          <Text color={colors.textMuted}>Loading rooms…</Text>
        </YStack>
      ) : displayRooms.length === 0 ? (
        <YStack flex={1} alignItems="center" justifyContent="center" padding="$4">
          <Text color={colors.textMuted} textAlign="center">
            You are not in any message rooms.
          </Text>
        </YStack>
      ) : (
        <ScrollView style={{ flex: 1 }}>
          <YStack>
            {flaggedRooms.length > 0 ? (
              <>
                <XStack
                  padding="$3"
                  paddingBottom="$1"
                  backgroundColor={colors.surface}
                  borderBottomWidth={1}
                  borderBottomColor={colors.border}
                >
                  <Text color="#c0392b" fontWeight="700" fontSize="$2">
                    🚩 FLAGGED FOR REVIEW
                  </Text>
                </XStack>
                {flaggedRooms.map((room) => (
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
                      backgroundColor="#c0392b18"
                    >
                      <YStack
                        width={46}
                        height={46}
                        borderRadius={23}
                        backgroundColor="#c0392b33"
                        alignItems="center"
                        justifyContent="center"
                      >
                        <Text color="#c0392b" fontWeight="700" fontSize="$4">
                          🚩
                        </Text>
                      </YStack>
                      <YStack flex={1} gap={2}>
                        <Text color={colors.text} fontWeight="700" fontSize="$4">
                          {room.name}
                        </Text>
                        <Text color={colors.textMuted} fontSize="$2">
                          {room.members.length} members · Flagged by {room.reviewers.length}
                        </Text>
                      </YStack>
                    </XStack>
                  </Pressable>
                ))}
                {unflaggedRooms.length > 0 ? (
                  <XStack
                    padding="$3"
                    paddingBottom="$1"
                    backgroundColor={colors.surface}
                    borderBottomWidth={1}
                    borderBottomColor={colors.border}
                  >
                    <Text color={colors.textMuted} fontWeight="700" fontSize="$2">
                      ALL ROOMS
                    </Text>
                  </XStack>
                ) : null}
              </>
            ) : null}
            {unflaggedRooms.map((room) => (
              <Pressable key={String(room.id)} onPress={() => router.push(`/messages/${room.id}`)}>
                <XStack
                  padding="$3"
                  gap="$3"
                  alignItems="center"
                  borderBottomWidth={1}
                  borderBottomColor={colors.border}
                  backgroundColor={colors.background}
                >
                  <YStack
                    width={46}
                    height={46}
                    borderRadius={23}
                    backgroundColor={colors.primary + '33'}
                    alignItems="center"
                    justifyContent="center"
                  >
                    <Text color={colors.primary} fontWeight="700" fontSize="$4">
                      {(room.name ?? '?').charAt(0).toUpperCase()}
                    </Text>
                  </YStack>
                  <YStack flex={1} gap={2}>
                    <XStack justifyContent="space-between" alignItems="center">
                      <Text color={colors.text} fontWeight="700" fontSize="$4">
                        {room.name}
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
                      {room.members.length} members
                    </Text>
                  </YStack>
                </XStack>
              </Pressable>
            ))}
          </YStack>
        </ScrollView>
      )}

      {/* Admin FAB to create room */}
      {admin ? (
        <Pressable
          onPress={() => setShowCreate(true)}
          style={[styles.fab, { backgroundColor: colors.primary }]}
        >
          <Text color="white" fontWeight="700" fontSize="$3">
            ⊕ New Room
          </Text>
        </Pressable>
      ) : null}

      {/* Create Room Modal */}
      <Modal
        visible={showCreate}
        animationType="slide"
        transparent
        onRequestClose={() => setShowCreate(false)}
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
                New Room
              </Text>
              <Pressable onPress={() => setShowCreate(false)}>
                <Text color={colors.textMuted} fontSize="$4">
                  ✕
                </Text>
              </Pressable>
            </XStack>

            <YStack gap="$1">
              <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                ROOM NAME
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

            <YStack gap="$1" flex={1}>
              <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                MEMBERS ({selectedMembers.length} selected)
              </Text>
              <ScrollView style={{ maxHeight: 280 }}>
                {nonPublicUsers.map((u) => {
                  const selected = selectedMembers.includes(String(u.uid))
                  return (
                    <Pressable key={String(u.uid)} onPress={() => toggleMember(String(u.uid))}>
                      <XStack
                        paddingVertical="$2"
                        paddingHorizontal="$2"
                        gap="$3"
                        alignItems="center"
                        borderBottomWidth={1}
                        borderBottomColor={colors.border}
                        backgroundColor={selected ? colors.primary + '18' : 'transparent'}
                      >
                        <View
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: 4,
                            borderWidth: 2,
                            borderColor: selected ? colors.primary : colors.border,
                            backgroundColor: selected ? colors.primary : 'transparent',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {selected ? (
                            <Text color="white" fontSize={12}>
                              ✓
                            </Text>
                          ) : null}
                        </View>
                        <Text color={colors.text} fontSize="$3">
                          {u.displayName || u.email || String(u.uid)}
                        </Text>
                      </XStack>
                    </Pressable>
                  )
                })}
              </ScrollView>
            </YStack>

            <Pressable
              onPress={handleCreate}
              disabled={creating || !roomName.trim() || selectedMembers.length === 0}
            >
              <XStack
                backgroundColor={colors.primary}
                borderRadius="$2"
                paddingVertical="$3"
                justifyContent="center"
                opacity={creating || !roomName.trim() || selectedMembers.length === 0 ? 0.5 : 1}
              >
                <Text color="white" fontWeight="700" fontSize="$3">
                  {creating ? 'Creating…' : 'Create Room'}
                </Text>
              </XStack>
            </Pressable>
          </YStack>
        </View>
      </Modal>
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
