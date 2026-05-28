import { useEffect } from 'react'
import { ScrollView, Pressable } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { Stack, useRouter } from 'expo-router'
import { useAuthStore } from '@/stores/authStore'
import { useMessagesStore } from '@/stores/messagesStore'
import { useThemeColors } from '@/theme/useThemeColors'
import { sameId } from '@/lib/ids'

export default function MessagesIndex() {
  const colors = useThemeColors()
  const router = useRouter()
  const { profile } = useAuthStore()
  const uid = profile?.uid ?? ''

  const { rooms, loading, subscribe, unsubscribe } = useMessagesStore()

  useEffect(() => {
    subscribe()
    return () => unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Only show rooms the current user is a member of
  const myRooms = rooms.filter((r) => r.members.some((m) => sameId(m, uid)))

  return (
    <YStack flex={1} backgroundColor={colors.background}>
      <Stack.Screen options={{ title: 'Messages' }} />

      {loading ? (
        <YStack flex={1} alignItems="center" justifyContent="center">
          <Text color={colors.textMuted}>Loading rooms…</Text>
        </YStack>
      ) : myRooms.length === 0 ? (
        <YStack flex={1} alignItems="center" justifyContent="center" padding="$4">
          <Text color={colors.textMuted} textAlign="center">
            You are not in any message rooms.
          </Text>
        </YStack>
      ) : (
        <ScrollView style={{ flex: 1 }}>
          <YStack>
            {myRooms.map((room) => (
              <Pressable key={String(room.id)} onPress={() => router.push(`/messages/${room.id}`)}>
                <XStack
                  padding="$3"
                  gap="$3"
                  alignItems="center"
                  borderBottomWidth={1}
                  borderBottomColor={colors.border}
                  backgroundColor={colors.background}
                >
                  {/* Room icon */}
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
    </YStack>
  )
}
