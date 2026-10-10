import * as Speech from 'expo-speech'
import { readySpeaker, SPEAKING_ID } from '@/lib/audioOut'
import { ownsSpeech, releaseSpeech, speechTakeable, withSpeech } from '@/lib/speechOwner'

/** A phone's voice needs no tap first (speak.web.ts: a browser's does). */
export function unlockSpeech(): void {}

/** A moment between stopping one answer and starting the next: asked at once, the next can be lost. */
const AFTER_STOP_MS = 150
/** The longest an answer is taken to last, should the phone never say it has finished. */
const longest = (text: string) => Math.min(60_000, 3000 + text.length * 120)

let speaking = false
// Each answer's turn: one stopped, or replaced, before it starts is not said.
let turn = 0
let waiting: ReturnType<typeof setTimeout> | null = null
let giveBack: ReturnType<typeof setTimeout> | null = null

/** Lets the microphone go again: to the sheet, or "Hey Miriam", listening in the background. */
function letGo() {
  if (giveBack) clearTimeout(giveBack)
  giveBack = null
  releaseSpeech(SPEAKING_ID)
}

/**
 * Miriam's answers, read aloud — the phone's own voice, or the browser's.
 * Anything already being said is stopped first. Never a reason to fail:
 * where there is no voice, the answer is still shown.
 *
 * While she speaks she holds the microphone, as a listener would: what is
 * listening in the background (an open sheet, waiting for "Hey Miriam")
 * stops, and doesn't take her own words for someone else's — and the
 * phone's sound can be made ready for her voice (lib/audioOut).
 */
export function speak(text: string): void {
  const mine = ++turn
  if (waiting) clearTimeout(waiting)
  waiting = null
  const say = () => {
    waiting = null
    // Replaced or stopped while waiting for the microphone: not said, and
    // the microphone let go, unless a newer answer is being said.
    if (mine !== turn) {
      if (!speaking) letGo()
      return
    }
    try {
      // Heard with the ringer off, and not lost to how listening left the sound.
      readySpeaker('voice')
      speaking = true
      const done = () => {
        if (mine !== turn) return
        speaking = false
        letGo()
      }
      Speech.speak(text, {
        language: 'en-US',
        rate: 1.0,
        onDone: done,
        onStopped: done,
        onError: done,
      })
      if (ownsSpeech(SPEAKING_ID)) giveBack = setTimeout(done, longest(text))
    } catch {
      speaking = false
      letGo()
      // No voice here; the answer is on screen.
    }
  }
  const start = () => {
    // Someone listening on purpose keeps the microphone; she speaks over it.
    if (!speechTakeable() && !ownsSpeech(SPEAKING_ID)) return say()
    withSpeech(SPEAKING_ID, say)
  }
  if (!speaking) return start()
  halt()
  waiting = setTimeout(start, AFTER_STOP_MS)
}

/** Stops what is being said, without letting the microphone go. */
function halt() {
  if (!speaking) return
  speaking = false
  try {
    Speech.stop()
  } catch {
    // Nothing to stop.
  }
}

export function stopSpeaking(): void {
  turn++
  if (waiting) clearTimeout(waiting)
  waiting = null
  halt()
  letGo()
}
