import { useEffect, useState } from 'react'
import { Pressable, View } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio'
import { useThemeColors } from '@/theme/useThemeColors'

/**
 * A reference track playing inside the app.
 *
 * Deliberately not a full player: play/pause, where you are, and a bar you can
 * tap to move. A worship team wants to hear the arrangement, not to scrub
 * frame by frame, and every control added here is one more thing to get wrong
 * on a phone held in one hand at rehearsal.
 *
 * expo-audio drives both platforms — it ships a web implementation, so the
 * same component works in the browser where set lists are built and on the
 * phone where they are used.
 */
export function AudioTrackPlayer({ url, name }: { url: string; name?: string }) {
  const colors = useThemeColors()
  const player = useAudioPlayer({ uri: url })
  const status = useAudioPlayerStatus(player)

  useEffect(() => {
    // Without this, a phone with the ringer switch off plays nothing at all:
    // the person taps play, sees the button change, and hears silence with no
    // hint as to why. Musicians keep their phones silent.
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {})
  }, [])

  const duration = status.duration ?? 0
  const position = status.currentTime ?? 0
  const progress = duration > 0 ? Math.min(1, position / duration) : 0

  const toggle = () => {
    if (status.playing) {
      player.pause()
      return
    }
    // Replay rather than resume once it has run out, so the button does
    // something the second time it is pressed at the end of a track.
    if (duration > 0 && position >= duration - 0.25) player.seekTo(0).catch(() => {})
    player.play()
  }

  return (
    <YStack
      backgroundColor={colors.background}
      borderRadius="$2"
      borderWidth={1}
      borderColor={colors.border}
      padding="$2"
      gap="$2"
    >
      <XStack alignItems="center" gap="$2">
        <Pressable onPress={toggle} accessibilityLabel={status.playing ? 'Pause' : 'Play'}>
          <XStack
            width={32}
            height={32}
            borderRadius={99}
            backgroundColor={colors.primary}
            alignItems="center"
            justifyContent="center"
          >
            <Text color="white" fontSize="$3">
              {status.playing ? '❚❚' : '▶'}
            </Text>
          </XStack>
        </Pressable>

        <YStack flex={1} gap="$1">
          {name ? (
            <Text color={colors.text} fontSize="$2" numberOfLines={1}>
              {name}
            </Text>
          ) : null}
          <Text color={colors.textMuted} fontSize={11}>
            {status.isLoaded ? `${clock(position)} / ${clock(duration)}` : 'Loading…'}
          </Text>
        </YStack>
      </XStack>

      <SeekBar
        progress={progress}
        onSeek={(fraction) => {
          if (duration > 0) player.seekTo(fraction * duration).catch(() => {})
        }}
      />
    </YStack>
  )
}

/**
 * Tap anywhere on the bar to jump there.
 *
 * The width comes from onLayout rather than the DOM, because there is no
 * <input type="range"> on native and locationX means nothing without knowing
 * what it is a fraction of.
 */
function SeekBar({ progress, onSeek }: { progress: number; onSeek: (fraction: number) => void }) {
  const colors = useThemeColors()
  const [width, setWidth] = useState(0)
  return (
    <Pressable
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      onPress={(e) => {
        if (width <= 0) return
        onSeek(Math.max(0, Math.min(1, e.nativeEvent.locationX / width)))
      }}
      accessibilityLabel="Seek"
    >
      <View
        style={{ height: 4, borderRadius: 2, backgroundColor: colors.border, overflow: 'hidden' }}
      >
        <View
          style={{
            width: `${progress * 100}%`,
            height: '100%',
            backgroundColor: colors.primary,
          }}
        />
      </View>
    </Pressable>
  )
}

/** Seconds as m:ss — the only format a three-minute song needs. */
function clock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const total = Math.floor(seconds)
  const mins = Math.floor(total / 60)
  const secs = total % 60
  return `${mins}:${String(secs).padStart(2, '0')}`
}
