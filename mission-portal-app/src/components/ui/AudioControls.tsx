import { useState } from 'react'
import { Pressable } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { useAudioPlayerStatus, type AudioPlayer } from 'expo-audio'
import { useThemeColors } from '@/theme/useThemeColors'
import { useMediaPlaybackStore } from '@/stores/mediaPlaybackStore'
import { AudioScrubber } from '@/components/ui/AudioScrubber'
import { clock, skipTarget } from '@/lib/audioSeek'

/**
 * Play, back ten seconds, forward ten, and a bar to drag between the time
 * you are at and the length of the track.
 *
 * Draws controls for a player it is given rather than one of its own, so the
 * same track can be driven from its card on the set list and from the chord
 * sheet opened over it. Whichever is pressed, it is the one player that moves.
 *
 * Two layouts. "card" is two short rows under a song — the buttons with the
 * track's name, then the bar across the full width. "bar" is one row for the
 * foot of a chord sheet, where height is what there is least of.
 */
export function AudioControls({
  player,
  url,
  name,
  layout,
}: {
  player: AudioPlayer
  url: string
  name?: string
  layout: 'card' | 'bar'
}) {
  const colors = useThemeColors()
  const status = useAudioPlayerStatus(player)
  const claim = useMediaPlaybackStore((s) => s.claim)
  const release = useMediaPlaybackStore((s) => s.release)
  // Where a drag would land, shown in place of the position while dragging.
  const [scrubbing, setScrubbing] = useState<number | null>(null)

  const duration = status.duration ?? 0
  const position = status.currentTime ?? 0
  const ready = status.isLoaded && duration > 0
  const progress = duration > 0 ? Math.min(1, position / duration) : 0
  // While dragging, the time where the finger is rather than where the track is.
  const shownTime = scrubbing === null ? position : scrubbing * duration

  const toggle = () => {
    if (status.playing) {
      player.pause()
      release(url)
      return
    }
    // Replay rather than resume once it has run out, so the button does
    // something the second time it is pressed at the end of a track.
    if (duration > 0 && position >= duration - 0.25) player.seekTo(0).catch(() => {})
    claim(url)
    player.play()
  }

  const skip = (seconds: number) => {
    if (!ready) return
    player.seekTo(skipTarget(position, duration, seconds)).catch(() => {})
  }

  const buttons = (
    <XStack alignItems="center" gap={2}>
      <SkipButton label="↺10" a11y="Back 10 seconds" enabled={ready} onPress={() => skip(-10)} />
      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel={status.playing ? 'Pause' : 'Play'}
      >
        <XStack
          width={32}
          height={32}
          borderRadius={99}
          backgroundColor={colors.primary}
          alignItems="center"
          justifyContent="center"
        >
          <Text color="white" fontSize={12}>
            {status.playing ? '❚❚' : '▶'}
          </Text>
        </XStack>
      </Pressable>
      <SkipButton label="10↻" a11y="Forward 10 seconds" enabled={ready} onPress={() => skip(10)} />
    </XStack>
  )

  // The times sit either side of the bar: where you are on the left, how long
  // the track is on the right. Besides being where people look for them, they
  // keep the bar's ends away from the buttons — a browser nudges a touch
  // landing near a button onto it, and with 10↻ beside the bar's start, a drag
  // begun on the thumb at 0:00 went to the button instead. Text is not a
  // target, so nothing pulls the touch away.
  const timeText = (value: string) => (
    <Text
      color={colors.textMuted}
      fontSize={11}
      minWidth={30}
      textAlign="center"
      style={{ fontVariant: ['tabular-nums'] }}
    >
      {value}
    </Text>
  )

  const scrubberRow = (
    <XStack alignItems="center" gap="$2">
      {timeText(status.isLoaded ? clock(shownTime) : '–:––')}
      <YStack flex={1}>
        <AudioScrubber
          progress={progress}
          enabled={ready}
          onDrag={setScrubbing}
          onSeek={(f) => {
            if (ready) player.seekTo(f * duration).catch(() => {})
          }}
          onStep={skip}
        />
      </YStack>
      {timeText(status.isLoaded ? clock(duration) : '–:––')}
    </XStack>
  )

  if (layout === 'bar') {
    return (
      <XStack alignItems="center" gap="$2">
        {buttons}
        <YStack flex={1}>{scrubberRow}</YStack>
      </XStack>
    )
  }

  return (
    <YStack gap={2}>
      <XStack alignItems="center" gap="$2">
        {buttons}
        <Text color={colors.textMuted} fontSize={11} flex={1} numberOfLines={1}>
          {name ?? ''}
        </Text>
      </XStack>
      {scrubberRow}
    </YStack>
  )
}

function SkipButton({
  label,
  a11y,
  enabled,
  onPress,
}: {
  label: string
  a11y: string
  enabled: boolean
  onPress: () => void
}) {
  const colors = useThemeColors()
  return (
    <Pressable
      onPress={onPress}
      disabled={!enabled}
      accessibilityRole="button"
      accessibilityLabel={a11y}
    >
      <XStack
        width={36}
        height={32}
        alignItems="center"
        justifyContent="center"
        opacity={enabled ? 1 : 0.4}
      >
        <Text color={colors.primary} fontSize={12} fontWeight="700">
          {label}
        </Text>
      </XStack>
    </Pressable>
  )
}
