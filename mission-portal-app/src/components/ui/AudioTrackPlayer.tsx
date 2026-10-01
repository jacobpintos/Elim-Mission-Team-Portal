import { useEffect, useRef, useState } from 'react'
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio'
import { useMediaPlaybackStore } from '@/stores/mediaPlaybackStore'
import { useAudioPlayersStore } from '@/stores/audioPlayersStore'
import { cachedAudioUri, cacheAudio } from '@/lib/audioCache'
import { AudioControls } from '@/components/ui/AudioControls'

/**
 * A reference track playing inside the app.
 *
 * Owns the audio — the player, the offline copy, the rule that only one thing
 * plays at once — and draws AudioControls for it: play, back and forward ten
 * seconds, and a bar to drag to any point. A band learning an arrangement goes
 * back over the same eight bars again and again, which a tap-only line three
 * points tall made a chore.
 *
 * The player is also registered by its URL, so the chord sheet opened over
 * this card can draw controls for the same track (see audioPlayersStore).
 *
 * expo-audio drives both platforms — it ships a web implementation, so the
 * same component works in the browser where set lists are built and on the
 * phone where they are used.
 */
export function AudioTrackPlayer({ url, name }: { url: string; name?: string }) {
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
  const release = useMediaPlaybackStore((s) => s.release)
  const register = useAudioPlayersStore((s) => s.register)
  const unregister = useAudioPlayersStore((s) => s.unregister)

  // Started from here or from a chord sheet, it has started: no swapping the
  // source out from under it now.
  useEffect(() => {
    if (status.playing) started.current = true
  }, [status.playing])

  useEffect(() => {
    register(url, player)
    return () => unregister(url, player)
  }, [url, player, register, unregister])

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

  return <AudioControls player={player} url={url} name={name} layout="card" />
}
