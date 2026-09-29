import { Modal, View, Pressable, StyleSheet } from 'react-native'
import { YStack, Text } from 'tamagui'
import { YouTubeEmbed } from '@/components/ui/YouTubeEmbed'

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
  return (
    <Modal visible={!!url} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.modal, { backgroundColor: '#000' }]}>
        <Pressable onPress={onClose} style={styles.closeBtn}>
          <Text color="white" fontSize="$5" fontWeight="700">
            ✕
          </Text>
        </Pressable>
        {url ? (
          <YStack flex={1} gap="$2">
            <View style={{ flex: 1 }}>
              <YouTubeEmbed url={url} />
            </View>
            {title || subtitle ? (
              <YStack padding="$4">
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
            ) : null}
          </YStack>
        ) : null}
      </View>
    </Modal>
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
