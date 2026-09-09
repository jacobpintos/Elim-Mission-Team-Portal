import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { useLivestreamStore } from '@/stores/livestreamStore'
import { activeStream, msUntilExpiry } from '@/lib/livestream'
import { useThemeColors } from '@/theme/useThemeColors'
import { YouTubeEmbed } from '@/components/ui/YouTubeEmbed'

/**
 * The service playing right now, or nothing at all.
 *
 * Renders null whenever no card is standing, so it can be dropped at the top of
 * any screen without leaving a gap on the six days a week nothing is on.
 */
export function StreamBox() {
  const colors = useThemeColors()
  const { subscribe, unsubscribe } = useLivestreamStore()
  const streams = useLivestreamStore((s) => s.streams)

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

  return (
    <YStack
      margin="$4"
      marginBottom="$0"
      borderRadius="$4"
      overflow="hidden"
      borderWidth={1}
      borderColor={colors.border}
      backgroundColor={colors.surface}
    >
      <XStack padding="$3" alignItems="center" gap="$2">
        <XStack
          backgroundColor="#dc2626"
          paddingHorizontal="$2"
          paddingVertical="$1"
          borderRadius="$1"
        >
          <Text color="white" fontSize={10} fontWeight="700">
            ● LIVE
          </Text>
        </XStack>
        <Text color={colors.text} fontSize="$4" fontWeight="700" flex={1} numberOfLines={2}>
          {stream.title}
        </Text>
      </XStack>
      <View style={{ width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000' }}>
        <YouTubeEmbed url={stream.youtubeUrl} />
      </View>
    </YStack>
  )
}
