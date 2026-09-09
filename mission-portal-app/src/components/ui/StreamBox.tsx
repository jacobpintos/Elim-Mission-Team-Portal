import { useEffect, useState } from 'react'
import { Modal, Pressable, View, StyleSheet } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { useLivestreamStore } from '@/stores/livestreamStore'
import { activeStream, msUntilExpiry } from '@/lib/livestream'
import { youtubeThumbnail } from '@/stores/musicStore'
import { useThemeColors } from '@/theme/useThemeColors'
import { YouTubeEmbed } from '@/components/ui/YouTubeEmbed'
import { Img } from '@/components/ui/Img'

/**
 * The service playing right now, or nothing at all.
 *
 * Renders null whenever no card is standing, so it can be dropped at the top of
 * any screen without leaving a gap on the six days a week nothing is on.
 *
 * Tapping opens the same full-screen player the Content screen uses rather than
 * playing in place. Two reasons beyond matching: a service is watched, not
 * glanced at, and an inline player would have started loading — and on some
 * platforms playing — for everyone who so much as opened Home.
 */
export function StreamBox() {
  const colors = useThemeColors()
  const { subscribe, unsubscribe } = useLivestreamStore()
  const streams = useLivestreamStore((s) => s.streams)
  /**
   * Which card is open in the player, rather than a bare "is it open".
   *
   * Tying it to the id means the player closes on its own when the window runs
   * out mid-watch — the component stops rendering the card, and this stops
   * matching. It also stops a stream posted later from springing open
   * unprompted for someone who happened to be watching the last one.
   */
  const [playingId, setPlayingId] = useState<string | null>(null)

  /**
   * Re-render when the window closes.
   *
   * `Date.now()` is only read while rendering, so for anyone who left the app
   * open the box would sit there past its window until something else happened
   * to re-render the screen. This tick exists for the timer below to bump at
   * the exact moment the card is due down.
   */
  const [, setTick] = useState(0)
  const stream = activeStream(streams)
  const expiresAt = stream?.expiresAt ?? 0

  useEffect(() => {
    subscribe()
    return unsubscribe
  }, [subscribe, unsubscribe])

  useEffect(() => {
    if (!expiresAt) return
    const ms = msUntilExpiry({ expiresAt })
    // setTimeout stores its delay in a signed 32-bit int: anything larger
    // overflows and fires immediately, over and over. Windows are hours, not
    // weeks, so this only guards against a bad expiresAt in the document.
    if (ms <= 0 || ms > 2 ** 31 - 1) return
    const t = setTimeout(() => setTick((n) => n + 1), ms)
    return () => clearTimeout(t)
    // Keyed on the expiry alone: a correction posted mid-service carries its
    // own, and re-arms this.
  }, [expiresAt])

  if (!stream) return null

  const thumb = youtubeThumbnail(stream.youtubeUrl)

  return (
    <>
      <YStack
        margin="$4"
        marginBottom="$0"
        borderRadius="$4"
        overflow="hidden"
        borderWidth={1}
        borderColor={colors.border}
        backgroundColor={colors.surface}
      >
        <Pressable onPress={() => setPlayingId(stream.id)}>
          <YStack position="relative">
            <View style={{ width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000' }}>
              {thumb ? (
                <Img
                  src={thumb}
                  alt={stream.title}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : null}
            </View>
            <View style={styles.playOverlay}>
              <Text fontSize="$9" color="white">
                ▶
              </Text>
            </View>
            <View style={styles.liveBadge}>
              <Text color="white" fontSize={11} fontWeight="700">
                ● LIVE
              </Text>
            </View>
          </YStack>
          <XStack padding="$3" alignItems="center">
            <Text color={colors.text} fontSize="$4" fontWeight="700" flex={1} numberOfLines={2}>
              {stream.title}
            </Text>
          </XStack>
        </Pressable>
      </YStack>

      <Modal
        visible={playingId === stream.id}
        animationType="slide"
        onRequestClose={() => setPlayingId(null)}
      >
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <Pressable onPress={() => setPlayingId(null)} style={styles.closeBtn}>
            <Text color="white" fontSize="$5" fontWeight="700">
              ✕
            </Text>
          </Pressable>
          <YStack flex={1} gap="$2">
            <View style={{ flex: 1 }}>
              <YouTubeEmbed url={stream.youtubeUrl} />
            </View>
            <YStack padding="$4">
              <Text color="white" fontSize="$4" fontWeight="700">
                {stream.title}
              </Text>
              <Text color="rgba(255,255,255,0.6)" fontSize="$3">
                Live now
              </Text>
            </YStack>
          </YStack>
        </View>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  playOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  liveBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: '#dc2626',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  closeBtn: {
    position: 'absolute',
    top: 48,
    right: 20,
    zIndex: 10,
    padding: 8,
  },
})
