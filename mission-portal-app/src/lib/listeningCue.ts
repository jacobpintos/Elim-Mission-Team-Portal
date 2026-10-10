import { createAudioPlayer, type AudioPlayer } from 'expo-audio'
import * as Haptics from 'expo-haptics'
import { readySpeaker } from './audioOut'

/**
 * The cue that listening has started or stopped: a short chime — up for
 * start, down for stop — and a tap of the phone, as voice assistants give,
 * so a phone on a music stand or in a pocket says it heard the button
 * without being looked at.
 *
 * The chimes are two short tones in assets/sounds; each is loaded once and
 * replayed. Neither cue matters enough to let it fail anything: errors are
 * swallowed.
 *
 * Each keeps the phone's audio going once it ends: let go of, it could cut
 * off the listening that starts as it finishes.
 */
const SOUNDS = {
  start: require('../../assets/sounds/listen-start.wav'),
  stop: require('../../assets/sounds/listen-stop.wav'),
}

/** How long a chime lasts, to wait out before the microphone takes the sound over. */
export const CUE_MS = 200

const players: Partial<Record<keyof typeof SOUNDS, AudioPlayer>> = {}
const player = (kind: keyof typeof SOUNDS) =>
  players[kind] ??
  (players[kind] = createAudioPlayer(SOUNDS[kind], { keepAudioSessionActive: true }))

/** Loads the chimes ahead, so the first is not late (or missed). */
export function prepareCues(): void {
  try {
    player('start')
    player('stop')
  } catch {
    // Loaded when first played, then.
  }
}

export function listeningCue(kind: 'start' | 'stop'): void {
  Haptics.impactAsync(
    kind === 'start' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light
  ).catch(() => {})
  // Heard with the ringer off, and not as quiet as a call.
  readySpeaker()
  try {
    const cue = player(kind)
    cue.volume = 0.6
    cue.seekTo(0).catch(() => {})
    cue.play()
  } catch {
    // A silent start is still a start.
  }
}
