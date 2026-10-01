import { useState } from 'react'
import { View, ScrollView, Pressable, StyleSheet } from 'react-native'
import { FullScreenOverlay } from '@/components/ui/FullScreenOverlay'
import { YStack, XStack, Text } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'
import { useTasksStore } from '@/stores/tasksStore'
import { useUIStore } from '@/stores/uiStore'
import { useChordSheetsStore } from '@/stores/chordSheetsStore'
import { ChordSheetViewer } from './ChordSheetViewer'
import type { SetList } from '@/types/worship'
import type { Task } from '@/types/events'
import type { ChordSheet } from '@/types/chordSheet'
import { openExternalUrl } from '@/lib/externalUrl'
import { openInYouTube } from '@/lib/openInYouTube'
import { AudioTrackPlayer } from '@/components/ui/AudioTrackPlayer'
import { VideoPlayerModal } from '@/components/ui/VideoPlayerModal'
import { extractYouTubeId } from '@/stores/musicStore'

interface SetListDetailModalProps {
  setList: SetList | null
  ackTask?: Task | null
  onClose: () => void
}

export function SetListDetailModal({ setList, ackTask, onClose }: SetListDetailModalProps) {
  const colors = useThemeColors()
  const { completeTask } = useTasksStore()
  const toast = useUIStore((s) => s.toast)
  const chordSheets = useChordSheetsStore((s) => s.chordSheets)
  const [acknowledging, setAcknowledging] = useState(false)
  const [viewSheet, setViewSheet] = useState<ChordSheet | null>(null)
  const [viewSheetKey, setViewSheetKey] = useState<string>('')
  const [playingVideo, setPlayingVideo] = useState<{ url: string; title: string } | null>(null)

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
    <>
      <VideoPlayerModal
        url={playingVideo?.url ?? null}
        title={playingVideo?.title}
        onClose={() => setPlayingVideo(null)}
      />
      <ChordSheetViewer
        key={viewSheet ? `${String(viewSheet.id)}-${viewSheetKey}` : 'closed'}
        sheet={viewSheet}
        onClose={() => {
          setViewSheet(null)
          setViewSheetKey('')
        }}
        initialKey={viewSheetKey}
      />
      <FullScreenOverlay
        visible={!!setList}
        animationType="slide"
        transparent
        onRequestClose={onClose}
      >
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

            <ScrollView style={{ flexShrink: 1 }}>
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

                      {song.chordSheetId != null
                        ? (() => {
                            const cs = chordSheets.find(
                              (c) => String(c.id) === String(song.chordSheetId)
                            )
                            // A button the size of a thumb. It was the title
                            // alone, a 12pt line of text about 16pt tall in a
                            // scrolling list: easy to miss, and a finger that
                            // drifted a few points off it while pressing
                            // cancelled the tap — so opening the chord sheet,
                            // the thing a set list is opened for, took two or
                            // three goes.
                            return cs ? (
                              <Pressable
                                onPress={() => {
                                  setViewSheet(cs)
                                  setViewSheetKey(song.key ?? '')
                                }}
                                accessibilityRole="button"
                                accessibilityLabel={`Open chord sheet: ${cs.title}`}
                              >
                                <XStack
                                  minHeight={44}
                                  alignItems="center"
                                  gap="$2"
                                  paddingHorizontal="$3"
                                  borderRadius="$2"
                                  borderWidth={1}
                                  borderColor={colors.primary + '55'}
                                  backgroundColor={colors.primary + '12'}
                                >
                                  <Text
                                    color={colors.primary}
                                    fontSize="$3"
                                    fontWeight="600"
                                    flex={1}
                                    numberOfLines={1}
                                  >
                                    {cs.title}
                                    {cs.artist ? ` — ${cs.artist}` : ''}
                                  </Text>
                                  <Text color={colors.primary} fontSize="$5">
                                    ›
                                  </Text>
                                </XStack>
                              </Pressable>
                            ) : null
                          })()
                        : null}

                      {song.link ? (
                        // A YouTube link plays here, the way Content plays a
                        // video: the recording is the arrangement being
                        // learned, and watching it should not mean leaving the
                        // set list. Anything else is still somebody else's
                        // site and opens there.
                        extractYouTubeId(song.link) ? (
                          <XStack gap="$3" alignItems="center">
                            <Pressable
                              onPress={() =>
                                setPlayingVideo({ url: song.link, title: song.name || 'Video' })
                              }
                            >
                              <Text color={colors.primary} fontSize="$2">
                                ▶ Play video
                              </Text>
                            </Pressable>
                            {/* Some people want it in YouTube: to cast it to a
                                TV, to keep it playing while the phone is used
                                for something else, or because that is where
                                their playlist is. */}
                            <Pressable
                              onPress={() => openInYouTube(song.link, extractYouTubeId(song.link))}
                            >
                              <Text color={colors.textMuted} fontSize="$2">
                                YouTube ↗
                              </Text>
                            </Pressable>
                          </XStack>
                        ) : (
                          <Pressable onPress={() => openExternalUrl(song.link)}>
                            <Text color={colors.primary} fontSize="$2" numberOfLines={1}>
                              🔗 {song.link}
                            </Text>
                          </Pressable>
                        )
                      ) : null}

                      {song.audioUrl ? (
                        <AudioTrackPlayer url={song.audioUrl} name={song.audioName} />
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
      </FullScreenOverlay>
    </>
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
