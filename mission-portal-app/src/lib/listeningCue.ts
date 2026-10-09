import { createAudioPlayer, type AudioPlayer } from 'expo-audio'
import * as Haptics from 'expo-haptics'

/**
 * The cue that listening has started or stopped: a short chime — up for
 * start, down for stop — and a tap of the phone, as voice assistants give,
 * so a phone on a music stand or in a pocket says it heard the button
 * without being looked at.
 *
 * The chimes are two short tones in assets/sounds; each is loaded once and
 * replayed. Neither cue matters enough to let it fail anything: errors are
 * swallowed.
 */
const SOUNDS = {
  start: require('../../assets/sounds/listen-start.wav'),
  stop: require('../../assets/sounds/listen-stop.wav'),
}

const players: Partial<Record<keyof typeof SOUNDS, AudioPlayer>> = {}

export function listeningCue(kind: 'start' | 'stop'): void {
  Haptics.impactAsync(
    kind === 'start' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light
  ).catch(() => {})
  try {
    const player = players[kind] ?? (players[kind] = createAudioPlayer(SOUNDS[kind]))
    player.volume = 0.6
    player.seekTo(0).catch(() => {})
    player.play()
  } catch {
    // A silent start is still a start.
  }
}
