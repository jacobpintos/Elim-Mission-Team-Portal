import { useState } from 'react'
import { Modal, View, ScrollView, Pressable, StyleSheet, Linking } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'
import { useTasksStore } from '@/stores/tasksStore'
import { useUIStore } from '@/stores/uiStore'
import type { SetList } from '@/types/worship'
import type { Task } from '@/types/events'

interface SetListDetailModalProps {
  setList: SetList | null
  ackTask?: Task | null
  onClose: () => void
}

export function SetListDetailModal({ setList, ackTask, onClose }: SetListDetailModalProps) {
  const colors = useThemeColors()
  const { completeTask } = useTasksStore()
  const toast = useUIStore((s) => s.toast)
  const [acknowledging, setAcknowledging] = useState(false)

  if (!setList) return null

  const handleAcknowledge = async () => {
    if (!ackTask) return
    setAcknowledging(true)
    try {
      await completeTask(ackTask.id)
      toast('Set list acknowledged!', 'success')
      onClose()
    } catch {
      toast('Failed to acknowledge', 'error')
    } finally {
      setAcknowledging(false)
    }
  }

  return (
    <Modal visible={!!setList} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <YStack
          backgroundColor={colors.surface}
          borderRadius="$4"
          padding="$4"
          gap="$3"
          width="92%"
          maxWidth={520}
          maxHeight="88%"
        >
          <XStack justifyContent="space-between" alignItems="center">
            <Text color={colors.text} fontSize="$5" fontWeight="700" flex={1} numberOfLines={2}>
              {setList.title}
            </Text>
            <Pressable onPress={onClose}>
              <Text color={colors.textMuted} fontSize="$4" marginLeft="$2">
                ✕
              </Text>
            </Pressable>
          </XStack>

          {setList.eventDate ? (
            <XStack
              backgroundColor={colors.primary + '18'}
              borderRadius="$2"
              paddingHorizontal="$3"
              paddingVertical="$2"
              alignSelf="flex-start"
            >
              <Text color={colors.primary} fontSize="$2" fontWeight="600">
                📅 {setList.eventDate}
              </Text>
            </XStack>
          ) : null}

          <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
            {setList.songs.length} SONG{setList.songs.length !== 1 ? 'S' : ''}
          </Text>

          <ScrollView style={{ flex: 1 }}>
            <YStack gap="$3">
              {setList.songs.length === 0 ? (
                <Text color={colors.textMuted} fontSize="$3">
                  No songs in this set list.
                </Text>
              ) : (
                setList.songs.map((song, i) => (
                  <YStack
                    key={song.id}
                    backgroundColor={colors.background}
                    borderRadius="$3"
                    padding="$3"
                    gap="$2"
                    borderWidth={1}
                    borderColor={colors.border}
                  >
                    <XStack alignItems="center" gap="$2">
                      <YStack
                        width={24}
                        height={24}
                        borderRadius={12}
                        backgroundColor={colors.primary + '22'}
                        alignItems="center"
                        justifyContent="center"
                      >
                        <Text color={colors.primary} fontSize="$1" fontWeight="700">
                          {i + 1}
                        </Text>
                      </YStack>
                      <Text color={colors.text} fontWeight="700" fontSize="$4" flex={1}>
                        {song.name || '—'}
                      </Text>
                      {song.key ? (
                        <XStack
                          backgroundColor={colors.primary}
                          borderRadius={99}
                          paddingHorizontal="$2"
                          paddingVertical={2}
                        >
                          <Text color="white" fontSize="$1" fontWeight="700">
                            {song.key}
                          </Text>
                        </XStack>
                      ) : null}
                    </XStack>

                    {song.link ? (
                      <Pressable onPress={() => Linking.openURL(song.link).catch(() => {})}>
                        <Text color={colors.primary} fontSize="$2" numberOfLines={1}>
                          🔗 {song.link}
                        </Text>
                      </Pressable>
                    ) : null}

                    {song.notes ? (
                      <Text color={colors.textMuted} fontSize="$2">
                        {song.notes}
                      </Text>
                    ) : null}
                  </YStack>
                ))
              )}
            </YStack>
          </ScrollView>

          {ackTask && ackTask.status !== 'done' ? (
            <Pressable onPress={handleAcknowledge} disabled={acknowledging}>
              <XStack
                backgroundColor={colors.primary}
                borderRadius="$2"
                paddingVertical="$3"
                justifyContent="center"
                opacity={acknowledging ? 0.5 : 1}
              >
                <Text color="white" fontWeight="700" fontSize="$3">
                  {acknowledging ? 'Acknowledging…' : '✓ Acknowledge Set List'}
                </Text>
              </XStack>
            </Pressable>
          ) : null}
        </YStack>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
})
