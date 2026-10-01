import { useEffect } from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { FullScreenOverlay } from '@/components/ui/FullScreenOverlay'
import { YStack, XStack, Text } from 'tamagui'
import { YouTubeEmbed } from '@/components/ui/YouTubeEmbed'
import { openExternalUrl } from '@/lib/externalUrl'
import { useMediaPlaybackStore } from '@/stores/mediaPlaybackStore'

/**
 * A video playing full-screen on black, the way Content plays one.
 *
 * Lifted out of the Content screen when a set list needed the same thing. A
 * song's link used to bounce you out to the YouTube app; the video it points
 * at is the arrangement the team is meant to learn, and leaving the app to
 * watch it means leaving the set list, the key and the chord sheet behind.
 *
 * Only the chrome lives here — the player itself is YouTubeEmbed, which is
 * where the hard-won origin and navigation handling sits.
 */
export function VideoPlayerModal({
  url,
  title,
  subtitle,
  onClose,
}: {
  /** Null closes the modal, matching how the set list modals are driven. */
  url: string | null
  title?: string
  subtitle?: string
  onClose: () => void
}) {
  const claim = useMediaPlaybackStore((s) => s.claim)
  const release = useMediaPlaybackStore((s) => s.release)

  // Opening a video takes the playback slot, which stops any reference track
  // still running underneath it — the modal covers the screen, so a track left
  // playing has no visible player to pause and no obvious cause.
  useEffect(() => {
    if (!url) return
    claim(url)
    return () => release(url)
  }, [url, claim, release])

  // Nothing at all until there is a video, and not merely an invisible modal.
  //
  // react-native-web's Modal creates its portal div on its first render and
  // appends it to the body whether or not it is visible, so the painting order
  // of two modals is the order their components mounted, not the order they
  // opened. Declared alongside the set list card — which is written after it —
  // this player opened *underneath* the card it was launched from: the video
  // played, audible, with the set list sitting on top of it.
  if (!url) return null

  return (
    <FullScreenOverlay visible animationType="slide" onRequestClose={onClose}>
      <View style={[styles.modal, { backgroundColor: '#000' }]}>
        <Pressable onPress={onClose} style={styles.closeBtn}>
          <Text color="white" fontSize="$5" fontWeight="700">
            ✕
          </Text>
        </Pressable>
        <YStack flex={1} gap="$2">
          <View style={{ flex: 1 }}>
            <YouTubeEmbed url={url} />
          </View>
          <XStack padding="$4" alignItems="center" gap="$3">
            <YStack flex={1}>
              {title ? (
                <Text color="white" fontSize="$4" fontWeight="700">
                  {title}
                </Text>
              ) : null}
              {subtitle ? (
                <Text color="rgba(255,255,255,0.6)" fontSize="$3">
                  {subtitle}
                </Text>
              ) : null}
            </YStack>
            {/* The way out to YouTube itself — for chromecasting it, saving
                  it, or the videos whose owner has disabled embedding. The
                  embed carries its own version of this on native, but not on
                  web, where a blocked video is just a black rectangle. */}
            <Pressable onPress={() => openExternalUrl(url)}>
              <XStack
                borderWidth={1}
                borderColor="rgba(255,255,255,0.4)"
                borderRadius={99}
                paddingHorizontal="$3"
                paddingVertical="$2"
              >
                <Text color="white" fontSize="$2" fontWeight="600">
                  Open in YouTube ↗
                </Text>
              </XStack>
            </Pressable>
          </XStack>
        </YStack>
      </View>
    </FullScreenOverlay>
  )
}

const styles = StyleSheet.create({
  modal: {
    flex: 1,
  },
  closeBtn: {
    position: 'absolute',
    top: 48,
    right: 20,
    zIndex: 10,
    padding: 8,
  },
})
