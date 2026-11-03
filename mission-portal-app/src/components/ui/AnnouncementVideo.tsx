import { useEffect, useState } from 'react'
import { Pressable, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { Text } from 'tamagui'
import { useEvent } from 'expo'
import { useVideoPlayer, VideoView } from 'expo-video'
import { durationSaid } from '@/lib/announcementImage'
import { useMediaPlaybackStore } from '@/stores/mediaPlaybackStore'

interface AnnouncementVideoProps {
  url: string
  height: number
  /** Its length in seconds, if known: shown on it before it is played. */
  duration?: number
  title?: string
}

/**
 * An announcement's video, on the phone: a play button on black, with its
 * length, until it's tapped — only then is it loaded, so a list of them
 * costs nothing until one is wanted — then the phone's own player, full
 * screen and all (expo-video). The web's is AnnouncementVideo.web.tsx.
 */
export function AnnouncementVideo({ url, height, duration, title }: AnnouncementVideoProps) {
  const [started, setStarted] = useState(false)
  if (started) return <Player url={url} height={height} />
  return (
    <Pressable
      onPress={() => setStarted(true)}
      accessibilityRole="button"
      accessibilityLabel={title ? `Play the video: ${title}` : 'Play the video'}
    >
      <View
        style={{
          width: '100%',
          height,
          backgroundColor: '#000',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            backgroundColor: 'rgba(255,255,255,0.92)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Svg width={30} height={30} viewBox="0 0 24 24">
            <Path d="M8 5v14l11-7z" fill="#11111b" />
          </Svg>
        </View>
        {duration ? (
          <View
            style={{
              position: 'absolute',
              right: 10,
              bottom: 10,
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 6,
              backgroundColor: 'rgba(0,0,0,0.7)',
            }}
          >
            <Text color="white" fontSize={12} fontWeight="700">
              {durationSaid(duration)}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  )
}

/** The video itself, playing from the moment it is shown. */
function Player({ url, height }: { url: string; height: number }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = false
    p.play()
  })
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing })
  const activeUrl = useMediaPlaybackStore((s) => s.activeUrl)
  const claim = useMediaPlaybackStore((s) => s.claim)
  const release = useMediaPlaybackStore((s) => s.release)

  // Playing, it takes the one slot (stores/mediaPlaybackStore): whatever else was playing stops.
  useEffect(() => {
    if (isPlaying) claim(url)
  }, [isPlaying, url, claim])
  // Something else started: this one stops.
  useEffect(() => {
    if (activeUrl && activeUrl !== url && player.playing) player.pause()
  }, [activeUrl, url, player])
  useEffect(() => () => release(url), [url, release])

  return (
    <VideoView
      player={player}
      nativeControls
      contentFit="contain"
      fullscreenOptions={{ enable: true }}
      allowsPictureInPicture={false}
      style={{ width: '100%', height, backgroundColor: '#000' }}
    />
  )
}
