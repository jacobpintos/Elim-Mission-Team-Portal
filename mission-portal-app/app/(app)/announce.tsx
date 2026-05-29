import { useEffect, useState } from 'react'
import { ScrollView, Pressable, TextInput, Modal, View, StyleSheet } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { Stack } from 'expo-router'
import { useAuthStore } from '@/stores/authStore'
import { useAnnounceStore } from '@/stores/announceStore'
import { useUsersStore } from '@/stores/usersStore'
import { useThemeColors } from '@/theme/useThemeColors'
import { useUIStore } from '@/stores/uiStore'
import { isAdmin, isPublic } from '@/lib/roles'
import { sameId } from '@/lib/ids'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function formatTs(ts: number): string {
  const d = new Date(ts)
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}

export default function AnnounceScreen() {
  const colors = useThemeColors()
  const { profile } = useAuthStore()
  const uid = String(profile?.uid ?? '')
  const admin = isAdmin(profile)
  const publicUser = isPublic(profile)
  const toast = useUIStore((s) => s.toast)

  const {
    loading,
    subscribe,
    unsubscribe,
    createAnnouncement,
    deleteAnnouncement,
    myAnnouncements,
    publicAnnouncements,
  } = useAnnounceStore()
  const { users, subscribe: subUsers, unsubscribe: unsubUsers } = useUsersStore()

  useEffect(() => {
    subscribe()
    if (admin) subUsers()
    return () => {
      unsubscribe()
      if (admin) unsubUsers()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin])

  const visible = publicUser ? publicAnnouncements() : myAnnouncements(uid)

  // Create modal state
  const [showCreate, setShowCreate] = useState(false)
  const [aTitle, setATitle] = useState('')
  const [aBody, setABody] = useState('')
  const [aPublic, setAPublic] = useState(false)
  const [aAudience, setAAudience] = useState<string[]>([])
  const [creating, setCreating] = useState(false)

  const toggleAudience = (memberId: string) => {
    setAAudience((prev) =>
      prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId]
    )
  }

  const handleCreate = async () => {
    if (!aTitle.trim() || !aBody.trim()) {
      toast('Title and body are required', 'error')
      return
    }
    setCreating(true)
    try {
      await createAnnouncement({
        title: aTitle.trim(),
        body: aBody.trim(),
        isPublic: aPublic,
        audience: aPublic ? [] : aAudience,
        attachment: null,
        by: uid,
        ts: Date.now(),
      })
      toast('Announcement posted', 'success')
      setShowCreate(false)
      setATitle('')
      setABody('')
      setAPublic(false)
      setAAudience([])
    } catch {
      toast('Failed to post announcement', 'error')
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: string | number) => {
    try {
      await deleteAnnouncement(id)
      toast('Deleted', 'info')
    } catch {
      toast('Failed to delete', 'error')
    }
  }

  const nonPublicUsers = users.filter((u) => !u.roles?.includes('public'))
  const displayName = (id: string | number) => {
    const u = users.find((x) => sameId(x.uid, id))
    return u?.displayName ?? String(id)
  }

  return (
    <YStack flex={1} backgroundColor={colors.background}>
      <Stack.Screen options={{ title: 'Announcements' }} />

      {loading ? (
        <YStack flex={1} alignItems="center" justifyContent="center">
          <Text color={colors.textMuted}>Loading…</Text>
        </YStack>
      ) : visible.length === 0 ? (
        <YStack flex={1} alignItems="center" justifyContent="center" padding="$4">
          <Text color={colors.textMuted} textAlign="center" fontSize="$4">
            No announcements yet.
          </Text>
        </YStack>
      ) : (
        <ScrollView style={{ flex: 1 }}>
          <YStack padding="$3" gap="$3">
            {visible.map((a) => (
              <YStack
                key={String(a.id)}
                backgroundColor={colors.surface}
                borderRadius="$3"
                padding="$4"
                gap="$2"
                borderWidth={1}
                borderColor={colors.border}
              >
                <XStack justifyContent="space-between" alignItems="flex-start">
                  <Text color={colors.text} fontWeight="700" fontSize="$4" flex={1}>
                    {a.title}
                  </Text>
                  {a.isPublic ? (
                    <XStack
                      backgroundColor={colors.primary + '22'}
                      borderRadius={99}
                      paddingHorizontal="$2"
                      paddingVertical={2}
                    >
                      <Text color={colors.primary} fontSize={10} fontWeight="600">
                        PUBLIC
                      </Text>
                    </XStack>
                  ) : null}
                </XStack>

                <Text color={colors.text} fontSize="$3" lineHeight={20}>
                  {a.body}
                </Text>

                <XStack justifyContent="space-between" alignItems="center" marginTop="$1">
                  <Text color={colors.textMuted} fontSize="$2">
                    {formatTs(a.ts)}
                    {a.by ? ` · ${displayName(a.by)}` : ''}
                  </Text>
                  {admin ? (
                    <Pressable onPress={() => handleDelete(a.id)}>
                      <Text color="#c0392b" fontSize="$2">
                        Delete
                      </Text>
                    </Pressable>
                  ) : null}
                </XStack>
              </YStack>
            ))}
          </YStack>
        </ScrollView>
      )}

      {/* Admin FAB */}
      {admin ? (
        <Pressable
          onPress={() => setShowCreate(true)}
          style={[styles.fab, { backgroundColor: colors.primary }]}
        >
          <Text color="white" fontWeight="700" fontSize="$3">
            ⊕ Post Announcement
          </Text>
        </Pressable>
      ) : null}

      {/* Create Modal */}
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
            width="92%"
            maxWidth={540}
            maxHeight="90%"
          >
            <XStack justifyContent="space-between" alignItems="center">
              <Text color={colors.text} fontSize="$5" fontWeight="700">
                New Announcement
              </Text>
              <Pressable onPress={() => setShowCreate(false)}>
                <Text color={colors.textMuted} fontSize="$4">
                  ✕
                </Text>
              </Pressable>
            </XStack>

            <ScrollView showsVerticalScrollIndicator={false}>
              <YStack gap="$3">
                <YStack gap="$1">
                  <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                    TITLE
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
                    value={aTitle}
                    onChangeText={setATitle}
                    placeholder="Announcement title"
                    placeholderTextColor={colors.textMuted}
                  />
                </YStack>

                <YStack gap="$1">
                  <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                    BODY
                  </Text>
                  <TextInput
                    style={[
                      styles.textarea,
                      {
                        color: colors.text,
                        borderColor: colors.border,
                        backgroundColor: colors.background,
                      },
                    ]}
                    value={aBody}
                    onChangeText={setABody}
                    placeholder="Write your announcement…"
                    placeholderTextColor={colors.textMuted}
                    multiline
                    numberOfLines={5}
                  />
                </YStack>

                <XStack justifyContent="space-between" alignItems="center">
                  <Text color={colors.text} fontSize="$3" fontWeight="600">
                    Public (visible to everyone)
                  </Text>
                  <Pressable onPress={() => setAPublic((v) => !v)}>
                    <XStack
                      paddingHorizontal="$3"
                      paddingVertical="$1"
                      borderRadius={99}
                      backgroundColor={aPublic ? colors.primary : colors.surface}
                      borderWidth={1}
                      borderColor={aPublic ? colors.primary : colors.border}
                    >
                      <Text
                        color={aPublic ? 'white' : colors.textMuted}
                        fontSize="$2"
                        fontWeight="600"
                      >
                        {aPublic ? 'ON' : 'OFF'}
                      </Text>
                    </XStack>
                  </Pressable>
                </XStack>

                {!aPublic ? (
                  <YStack gap="$1">
                    <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                      TARGET RECIPIENTS (
                      {aAudience.length === 0 ? 'All members' : `${aAudience.length} selected`})
                    </Text>
                    <Text color={colors.textMuted} fontSize={11} marginBottom="$1">
                      Leave empty to send to all non-public members
                    </Text>
                    <ScrollView style={{ maxHeight: 200 }}>
                      {nonPublicUsers.map((u) => {
                        const selected = aAudience.includes(String(u.uid))
                        return (
                          <Pressable
                            key={String(u.uid)}
                            onPress={() => toggleAudience(String(u.uid))}
                          >
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
                                  width: 18,
                                  height: 18,
                                  borderRadius: 4,
                                  borderWidth: 2,
                                  borderColor: selected ? colors.primary : colors.border,
                                  backgroundColor: selected ? colors.primary : 'transparent',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                {selected ? (
                                  <Text color="white" fontSize={11}>
                                    ✓
                                  </Text>
                                ) : null}
                              </View>
                              <Text color={colors.text} fontSize="$3">
                                {u.displayName}
                              </Text>
                            </XStack>
                          </Pressable>
                        )
                      })}
                    </ScrollView>
                  </YStack>
                ) : null}

                <Pressable
                  onPress={handleCreate}
                  disabled={creating || !aTitle.trim() || !aBody.trim()}
                >
                  <XStack
                    backgroundColor={colors.primary}
                    borderRadius="$2"
                    paddingVertical="$3"
                    justifyContent="center"
                    opacity={creating || !aTitle.trim() || !aBody.trim() ? 0.5 : 1}
                  >
                    <Text color="white" fontWeight="700" fontSize="$3">
                      {creating ? 'Posting…' : 'Post Announcement'}
                    </Text>
                  </XStack>
                </Pressable>
              </YStack>
            </ScrollView>
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
  textarea: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    minHeight: 100,
    textAlignVertical: 'top',
  },
})
