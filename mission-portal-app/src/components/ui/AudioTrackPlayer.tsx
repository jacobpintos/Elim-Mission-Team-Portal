import { useEffect, useRef, useState } from 'react'
import { Pressable, View } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio'
import { useThemeColors } from '@/theme/useThemeColors'
import { useMediaPlaybackStore } from '@/stores/mediaPlaybackStore'
import { cachedAudioUri, cacheAudio } from '@/lib/audioCache'

/**
 * A reference track playing inside the app, in one line.
 *
 * Kept to a single row on purpose: this sits under a song that already carries
 * a key, a chord sheet, a link and notes, and a player with its own box and a
 * second line of text pushes the next song off a phone screen. Play/pause,
 * where you are, and a bar you can tap to move — a worship team wants to hear
 * the arrangement, not to scrub frame by frame.
 *
 * expo-audio drives both platforms — it ships a web implementation, so the
 * same component works in the browser where set lists are built and on the
 * phone where they are used.
 */
export function AudioTrackPlayer({ url, name }: { url: string; name?: string }) {
  const colors = useThemeColors()

  /**
   * Play the copy on the device if there is one, and make one if there is not.
   *
   * The remote URL is what plays until a local copy is found, so the first
   * listen is never held up by the copy being made — and the swap is dropped
   * once playback has started, because changing the source under a running
   * player restarts the track.
   */
  const [source, setSource] = useState(url)
  const started = useRef(false)

  // Back to the remote URL the moment this is pointed at a different track —
  // during render, where state derived from props belongs, rather than in the
  // effect below, which would paint one frame of the previous song's audio.
  const [loadedFor, setLoadedFor] = useState(url)
  if (loadedFor !== url) {
    setLoadedFor(url)
    setSource(url)
  }

  useEffect(() => {
    let cancelled = false
    started.current = false

    cachedAudioUri(url).then((local) => {
      if (cancelled || started.current) return
      if (local) setSource(local)
      else cacheAudio(url)
    })

    return () => {
      cancelled = true
    }
  }, [url])

  const player = useAudioPlayer({ uri: source })
  const status = useAudioPlayerStatus(player)
  const activeUrl = useMediaPlaybackStore((s) => s.activeUrl)
  const claim = useMediaPlaybackStore((s) => s.claim)
  const release = useMediaPlaybackStore((s) => s.release)

  useEffect(() => {
    // Without this, a phone with the ringer switch off plays nothing at all:
    // the person taps play, sees the button change, and hears silence with no
    // hint as to why. Musicians keep their phones silent.
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {})
  }, [])

  // Something else took the slot — another track, or a video opened over
  // this one — so stop. Nothing should ever be heard over anything else.
  useEffect(() => {
    if (activeUrl !== url && status.playing) player.pause()
  }, [activeUrl, url, status.playing, player])

  // Closing the set list mid-song should not leave the slot held.
  useEffect(() => {
    return () => release(url)
  }, [release, url])

  const duration = status.duration ?? 0
  const position = status.currentTime ?? 0
  const progress = duration > 0 ? Math.min(1, position / duration) : 0

  const toggle = () => {
    if (status.playing) {
      player.pause()
      release(url)
      return
    }
    // Replay rather than resume once it has run out, so the button does
    // something the second time it is pressed at the end of a track.
    if (duration > 0 && position >= duration - 0.25) player.seekTo(0).catch(() => {})
    started.current = true
    claim(url)
    player.play()
  }

  return (
    <YStack gap={4}>
      <XStack alignItems="center" gap="$2">
        <Pressable onPress={toggle} accessibilityLabel={status.playing ? 'Pause' : 'Play'}>
          <XStack
            width={26}
            height={26}
            borderRadius={99}
            backgroundColor={colors.primary}
            alignItems="center"
            justifyContent="center"
          >
            <Text color="white" fontSize={11}>
              {status.playing ? '❚❚' : '▶'}
            </Text>
          </XStack>
        </Pressable>

        <Text color={colors.textMuted} fontSize={11} flex={1} numberOfLines={1}>
          {name ? `${name} · ` : ''}
          {status.isLoaded ? `${clock(position)} / ${clock(duration)}` : 'Loading…'}
        </Text>
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
 * what it is a fraction of. hitSlop is what keeps a 3pt line touchable.
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
      hitSlop={8}
      accessibilityLabel="Seek"
    >
      <View
        style={{ height: 3, borderRadius: 2, backgroundColor: colors.border, overflow: 'hidden' }}
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
