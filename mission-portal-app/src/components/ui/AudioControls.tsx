import { useState } from 'react'
import { Pressable, View } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { useAudioPlayerStatus, type AudioPlayer } from 'expo-audio'
import { useThemeColors } from '@/theme/useThemeColors'
import { useMediaPlaybackStore } from '@/stores/mediaPlaybackStore'
import { useAudioPlayersStore } from '@/stores/audioPlayersStore'
import { AudioScrubber } from '@/components/ui/AudioScrubber'
import { clock, skipTarget, nextRate, rateLabel, loopStep } from '@/lib/audioSeek'

/**
 * Play, back ten seconds, forward ten, a bar to drag between the time you are
 * at and the length of the track, a loop, and a speed.
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
  // Whether the one-row bar has the width for everything on one row.
  const [wide, setWide] = useState(false)
  const rate = useAudioPlayersStore((s) => s.rates[url] ?? 1)
  const loop = useAudioPlayersStore((s) => s.loops[url] ?? null)
  const setRate = useAudioPlayersStore((s) => s.setRate)
  const setLoop = useAudioPlayersStore((s) => s.setLoop)

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

  // Read off the player, not the status: the status lags a seek by a beat,
  // and "End loop" pressed the moment a drag is let go must mark where the
  // drag ended, not where the track was a quarter of a second before.
  const now = () => player.currentTime ?? position

  const skip = (seconds: number) => {
    if (!ready) return
    player.seekTo(skipTarget(now(), duration, seconds)).catch(() => {})
  }

  /**
   * Start loop, End loop, Clear loop.
   *
   * Each press marks wherever the track is — so the end can be found by
   * dragging the bar to it rather than sitting through the passage first:
   * Start, drag, End. Marking the end goes straight back to the start, so
   * the next thing heard is the loop.
   */
  const pressLoop = () => {
    if (!ready) return
    const next = loopStep(loop, now())
    setLoop(url, next)
    if (next && next.end !== null) player.seekTo(next.start).catch(() => {})
  }

  const loopButton = (
    <PillButton
      label={!loop ? 'Start loop' : loop.end === null ? 'End loop' : 'Clear loop'}
      a11y={
        !loop ? 'Start a loop here' : loop.end === null ? 'End the loop here' : 'Clear the loop'
      }
      state={!loop ? 'off' : loop.end === null ? 'pending' : 'on'}
      enabled={ready}
      onPress={pressLoop}
    />
  )

  const speedButton = (
    <PillButton
      label={rateLabel(rate)}
      a11y={`Speed ${rateLabel(rate)}. Change speed`}
      state={rate === 1 ? 'off' : 'on'}
      enabled
      onPress={() => setRate(url, nextRate(rate))}
    />
  )

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
          loopStart={loop && duration > 0 ? loop.start / duration : null}
          loopEnd={loop?.end != null && duration > 0 ? loop.end / duration : null}
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
    // One row when there is room for it — a phone on its side, a tablet —
    // and two on a phone held upright, where one row would leave the bar too
    // short to aim at.
    // Measured on a plain View: Tamagui's stacks report layout through
    // observers that miss an element laid out before its layer is on the page,
    // which is how a chord sheet opens — the bar stayed on two rows sideways.
    return (
      <View onLayout={(e) => setWide(e.nativeEvent.layout.width >= 560)} style={{ gap: 2 }}>
        {wide ? (
          <XStack alignItems="center" gap="$2">
            {buttons}
            <YStack flex={1}>{scrubberRow}</YStack>
            {loopButton}
            {speedButton}
          </XStack>
        ) : (
          <>
            <XStack alignItems="center" gap="$2">
              {buttons}
              <YStack flex={1} />
              {loopButton}
              {speedButton}
            </XStack>
            {scrubberRow}
          </>
        )}
      </View>
    )
  }

  return (
    <YStack gap={2}>
      <XStack alignItems="center" gap="$2">
        {buttons}
        <Text color={colors.textMuted} fontSize={11} flex={1} numberOfLines={1}>
          {name ?? ''}
        </Text>
        {loopButton}
        {speedButton}
      </XStack>
      {scrubberRow}
    </YStack>
  )
}

/**
 * A small labelled toggle: outlined when off, tinted while a loop waits for
 * its end, filled when on.
 */
function PillButton({
  label,
  a11y,
  state,
  enabled,
  onPress,
}: {
  label: string
  a11y: string
  state: 'off' | 'pending' | 'on'
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
        height={32}
        minWidth={40}
        paddingHorizontal="$2"
        borderRadius={99}
        borderWidth={1}
        borderColor={colors.primary}
        backgroundColor={
          state === 'on'
            ? colors.primary
            : state === 'pending'
              ? colors.primary + '22'
              : 'transparent'
        }
        alignItems="center"
        justifyContent="center"
        opacity={enabled ? 1 : 0.4}
      >
        <Text color={state === 'on' ? 'white' : colors.primary} fontSize={11} fontWeight="700">
          {label}
        </Text>
      </XStack>
    </Pressable>
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
