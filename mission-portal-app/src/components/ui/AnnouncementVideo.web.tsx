import { useEffect, useRef } from 'react'
import { useMediaPlaybackStore } from '@/stores/mediaPlaybackStore'

interface AnnouncementVideoProps {
  url: string
  height: number
  /** Its length in seconds, if known: the phone's shows it before it loads. */
  duration?: number
  title?: string
}

/**
 * An announcement's video, in the browser's own player: its first frame
 * shown until it's played — `#t=0.1`, which Safari needs to draw one — with
 * the browser's controls, full screen included. Starting it stops whatever
 * else is playing (stores/mediaPlaybackStore), and it stops for anything
 * started after it.
 */
export function AnnouncementVideo({ url, height, title }: AnnouncementVideoProps) {
  const ref = useRef<HTMLVideoElement>(null)
  const activeUrl = useMediaPlaybackStore((s) => s.activeUrl)
  const claim = useMediaPlaybackStore((s) => s.claim)
  const release = useMediaPlaybackStore((s) => s.release)

  useEffect(() => {
    if (activeUrl && activeUrl !== url) ref.current?.pause()
  }, [activeUrl, url])
  useEffect(() => () => release(url), [url, release])

  return (
    <video
      ref={ref}
      src={`${url}#t=0.1`}
      controls
      playsInline
      preload="metadata"
      aria-label={title ? `Video: ${title}` : 'Video'}
      onPlay={() => claim(url)}
      onEnded={() => release(url)}
      style={{
        width: '100%',
        height,
        display: 'block',
        objectFit: 'contain',
        backgroundColor: '#000',
      }}
    />
  )
}
