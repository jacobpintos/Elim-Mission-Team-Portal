import { useEffect, useRef, useState } from 'react'
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio'
import { useMediaPlaybackStore } from '@/stores/mediaPlaybackStore'
import { useAudioPlayersStore } from '@/stores/audioPlayersStore'
import { cachedAudioUri, cacheAudio } from '@/lib/audioCache'
import { loopTarget } from '@/lib/audioSeek'
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
export function AudioTrackPlayer({
  url,
  name,
  title,
  artist,
  album,
}: {
  url: string
  /** The file's name, shown beside the controls. */
  name?: string
  /**
   * What the phone shows on the lock screen and in Control Centre: the song
   * as the set list calls it, not the file it was uploaded as —
   * "Take Control", not "take_control_v3_FINAL.mp3".
   */
  title?: string
  artist?: string
  album?: string
}) {
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
  const register = useAudioPlayersStore((s) => s.register)
  const unregister = useAudioPlayersStore((s) => s.unregister)
  const rate = useAudioPlayersStore((s) => s.rates[url] ?? 1)
  const loop = useAudioPlayersStore((s) => s.loops[url] ?? null)
  const clearSettings = useAudioPlayersStore((s) => s.clearSettings)

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
    //
    // Background play and not mixing are what the phone app needs for the
    // lock screen to show the track and keep it going with the screen off —
    // a rehearsal track has to survive the phone locking. The web has no
    // audio mode; there this does nothing.
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'doNotMix',
    }).catch(() => {})
  }, [])

  // Whatever starts playing takes the slot, however it was started — from
  // these controls, from the chord sheet's, or from play on the lock screen,
  // which goes straight to the player and past every button in the app. Only
  // on the moment it starts: claiming all the while it plays would snatch
  // the slot straight back from a video opened over it.
  const wasPlaying = useRef(false)
  useEffect(() => {
    if (status.playing && !wasPlaying.current && activeUrl !== url) claim(url)
    wasPlaying.current = status.playing
  }, [status.playing, activeUrl, url, claim])

  // On the lock screen and in Control Centre while it plays: the song's name
  // from the card, and back/forward buttons.
  useEffect(() => {
    if (!status.playing) return
    player.setActiveForLockScreen(
      true,
      { title: title || name || 'Reference track', artist, albumTitle: album },
      { showSeekBackward: true, showSeekForward: true }
    )
  }, [player, status.playing, title, name, artist, album])

  // Something else took the slot — another track, or a video opened over
  // this one — so stop. Nothing should ever be heard over anything else. An
  // empty slot is nobody's, which is what it is after a pause; playing again
  // from the lock screen must not be stopped for want of a claim.
  useEffect(() => {
    if (activeUrl !== null && activeUrl !== url && status.playing) player.pause()
  }, [activeUrl, url, status.playing, player])

  // Closing the set list mid-song should not leave the slot held — nor a
  // loop or a slowed speed waiting for the next time it is opened.
  useEffect(() => {
    return () => {
      release(url)
      clearSettings(url)
    }
  }, [release, clearSettings, url])

  // Slower without going lower. 'high' asks for the pitch to be kept: on the
  // web that is what turns preservesPitch on, and without it half speed plays
  // an octave down — no use to anyone learning a part in the key it is sung.
  useEffect(() => {
    player.setPlaybackRate(rate, 'high')
  }, [player, rate])

  // The loop, enforced here so it runs whichever controls are on screen.
  // Read straight off the player every 50ms rather than from its status,
  // which the web build updates about four times a second — late enough to
  // hear the first beat after the end of the loop before it jumps back.
  useEffect(() => {
    if (!loop || loop.end === null || !status.playing) return
    const id = setInterval(() => {
      const back = loopTarget(loop, player.currentTime)
      if (back !== null) player.seekTo(back).catch(() => {})
    }, 50)
    return () => clearInterval(id)
  }, [player, loop, status.playing])

  return <AudioControls player={player} url={url} name={name} layout="card" />
}
