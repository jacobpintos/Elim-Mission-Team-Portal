import { useState } from 'react'
import { Modal, View, Pressable, ScrollView, TextInput, StyleSheet } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'
import { useMusicStore, type MusicItem } from '@/stores/musicStore'

/**
 * Choose a video from Content to hang on a song.
 *
 * The videos the team is asked to learn from are already in Content, and until
 * this existed the only way to attach one was to leave the app, find it on
 * YouTube, copy the address and paste it back — which is also how a set list
 * ends up pointing at a different recording of the same song.
 *
 * Music only. A sermon is in the same collection, and nobody is building a set
 * list out of one.
 */
export function ContentPickerModal({
  visible,
  onClose,
  onSelect,
}: {
  visible: boolean
  onClose: () => void
  onSelect: (item: MusicItem) => void
}) {
  const colors = useThemeColors()
  const items = useMusicStore((s) => s.items)
  const loading = useMusicStore((s) => s.loading)
  const [search, setSearch] = useState('')

  const q = search.trim().toLowerCase()
  const songs = items
    .filter((item) => item.type === 'music' && item.youtubeUrl)
    .filter(
      (item) =>
        !q || item.title.toLowerCase().includes(q) || (item.album ?? '').toLowerCase().includes(q)
    )
    .sort((a, b) => a.title.localeCompare(b.title))

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <YStack
          backgroundColor={colors.surface}
          borderRadius="$4"
          padding="$4"
          gap="$3"
          width="92%"
          maxWidth={520}
          maxHeight="85%"
        >
          <XStack justifyContent="space-between" alignItems="center">
            <Text color={colors.text} fontSize="$5" fontWeight="700">
              Pick from Content
            </Text>
            <Pressable onPress={onClose}>
              <Text color={colors.textMuted} fontSize="$4">
                ✕
              </Text>
            </Pressable>
          </XStack>

          <TextInput
            style={[
              styles.input,
              {
                color: colors.text,
                borderColor: colors.border,
                backgroundColor: colors.background,
              },
            ]}
            value={search}
            onChangeText={setSearch}
            placeholder="Search songs…"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
          />

          <ScrollView showsVerticalScrollIndicator={false} style={{ flexShrink: 1 }}>
            <YStack gap="$2">
              {songs.length === 0 ? (
                <Text color={colors.textMuted} fontSize="$3">
                  {loading
                    ? 'Loading…'
                    : q
                      ? `Nothing in Content matches “${search.trim()}”.`
                      : 'No songs in Content yet.'}
                </Text>
              ) : null}
              {songs.map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => {
                    onSelect(item)
                    setSearch('')
                  }}
                >
                  <YStack
                    backgroundColor={colors.background}
                    borderRadius="$2"
                    borderWidth={1}
                    borderColor={colors.border}
                    paddingHorizontal="$3"
                    paddingVertical="$2"
                  >
                    <Text color={colors.text} fontSize={14} numberOfLines={1}>
                      {item.title}
                    </Text>
                    {item.album ? (
                      <Text color={colors.textMuted} fontSize={12} numberOfLines={1}>
                        {item.album}
                      </Text>
                    ) : null}
                  </YStack>
                </Pressable>
              ))}
            </YStack>
          </ScrollView>
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
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
  },
})
