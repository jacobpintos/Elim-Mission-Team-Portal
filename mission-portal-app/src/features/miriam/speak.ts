import * as Speech from 'expo-speech'
import { readySpeaker } from '@/lib/audioOut'

/** A phone's voice needs no tap first (speak.web.ts: a browser's does). */
export function unlockSpeech(): void {}

/**
 * Miriam's answers, read aloud — the phone's own voice, or the browser's.
 * Anything already being said is stopped first. Never a reason to fail:
 * where there is no voice, the answer is still shown.
 */
export function speak(text: string): void {
  try {
    Speech.stop()
    // Heard with the ringer off, and not as quiet as a call.
    readySpeaker()
    Speech.speak(text, { language: 'en-US', rate: 1.0 })
  } catch {
    // No voice here; the answer is on screen.
  }
}

export function stopSpeaking(): void {
  try {
    Speech.stop()
  } catch {
    // Nothing to stop.
  }
}
