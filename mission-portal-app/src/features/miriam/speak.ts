import * as Speech from 'expo-speech'
import { readySpeaker } from '@/lib/audioOut'

/** A phone's voice needs no tap first (speak.web.ts: a browser's does). */
export function unlockSpeech(): void {}

/** A moment between stopping one answer and starting the next: asked at once, the next can be lost. */
const AFTER_STOP_MS = 150

let speaking = false
let waiting: ReturnType<typeof setTimeout> | null = null

/**
 * Miriam's answers, read aloud — the phone's own voice, or the browser's.
 * Anything already being said is stopped first. Never a reason to fail:
 * where there is no voice, the answer is still shown.
 */
export function speak(text: string): void {
  if (waiting) clearTimeout(waiting)
  waiting = null
  const say = () => {
    waiting = null
    try {
      // Heard with the ringer off, and not lost to how listening left the sound.
      readySpeaker('voice')
      speaking = true
      const done = () => {
        speaking = false
      }
      Speech.speak(text, {
        language: 'en-US',
        rate: 1.0,
        onDone: done,
        onStopped: done,
        onError: done,
      })
    } catch {
      speaking = false
      // No voice here; the answer is on screen.
    }
  }
  if (!speaking) return say()
  stopSpeaking()
  waiting = setTimeout(say, AFTER_STOP_MS)
}

export function stopSpeaking(): void {
  if (waiting) clearTimeout(waiting)
  waiting = null
  if (!speaking) return
  speaking = false
  try {
    Speech.stop()
  } catch {
    // Nothing to stop.
  }
}
