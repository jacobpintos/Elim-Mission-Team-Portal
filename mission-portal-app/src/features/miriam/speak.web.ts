/**
 * Miriam's answers, read aloud by the browser (speak.ts on a phone).
 *
 * The browser's voice is used directly, for what it does not do on its own:
 * - Safari speaks only once a tap has let it, and an answer comes back after
 *   the tap that asked — so `unlockSpeech`, called on the tap, says nothing
 *   then, and lets what comes later be said.
 * - Chrome can drop what is started straight after the last was stopped, and
 *   goes quiet some seconds into anything long: so a moment's gap after a
 *   stop, and the answer said a sentence at a time.
 * - An utterance nothing holds can be dropped before it is said: they are held
 *   until said.
 * Never a reason to fail: where there is no voice, the answer is still shown.
 */
import { pickVoice } from '@/lib/miriamVoice'
import { scriptureForSpeech } from '@/lib/scriptureSpoken'

let unlocked = false
let held: SpeechSynthesisUtterance[] = []
let pending: ReturnType<typeof setTimeout> | null = null
/** Waiting for what is being said to end (whenSpoken). */
let afterSpeech: (() => void)[] = []
let safety: ReturnType<typeof setTimeout> | null = null

/** All of it said, or stopped: whoever was waiting is let go. */
function ended() {
  if (safety) clearTimeout(safety)
  safety = null
  const waiting = afterSpeech
  afterSpeech = []
  waiting.forEach((done) => done())
}

/** Once what is being said now has been said (or stopped): at once, if nothing is. */
export function whenSpoken(): Promise<void> {
  if (held.length === 0 && !pending) return Promise.resolve()
  return new Promise((done) => afterSpeech.push(done))
}

function voice(): SpeechSynthesis | null {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
    ? window.speechSynthesis
    : null
}

/** Call from a tap, before anything is awaited, so an answer can be said after it. */
export function unlockSpeech(): void {
  const synth = voice()
  if (!synth || unlocked) return
  try {
    const quiet = new SpeechSynthesisUtterance(' ')
    quiet.volume = 0
    synth.speak(quiet)
    unlocked = true
  } catch {
    // Nothing to unlock here.
  }
}

/** Her voice (lib/miriamVoice), once the browser has listed them: the most natural woman's it has. */
function englishVoice(synth: SpeechSynthesis): SpeechSynthesisVoice | null {
  const voices = synth.getVoices()
  const picked = pickVoice(voices.map((v) => ({ id: v.voiceURI, name: v.name, lang: v.lang })))
  return (
    (picked && voices.find((v) => v.voiceURI === picked.id)) ??
    voices.find((v) => v.lang === 'en-US' && v.default) ??
    voices.find((v) => v.lang === 'en-US') ??
    voices.find((v) => v.lang.startsWith('en')) ??
    null
  )
}

export function speak(said: string): void {
  // Bible references as a reader says them — and "Jer." no longer taken for
  // the end of a sentence below.
  const text = scriptureForSpeech(said)
  const synth = voice()
  if (!synth || !text.trim()) return
  try {
    const wasBusy = stopSpeaking()
    const sentences = text
      .replace(/([.!?])\s+/g, '$1\n')
      .split('\n')
      .filter((s) => s.trim())
    const say = () => {
      pending = null
      const en = englishVoice(synth)
      held = sentences.map((s) => {
        const u = new SpeechSynthesisUtterance(s.trim())
        u.lang = 'en-US'
        if (en) u.voice = en
        u.onend = u.onerror = () => {
          held = held.filter((h) => h !== u)
          if (held.length === 0) ended()
        }
        return u
      })
      // A browser that never says it has finished: not waited on past how long it could take.
      if (safety) clearTimeout(safety)
      safety = setTimeout(ended, Math.min(60_000, 3000 + text.length * 120))
      // A voice left paused (by the page being hidden) says nothing until resumed.
      synth.resume()
      held.forEach((u) => synth.speak(u))
    }
    if (wasBusy) pending = setTimeout(say, 120)
    else say()
  } catch {
    // No voice here; the answer is on screen.
  }
}

/** Stops anything being said, or about to be; whether there was. */
export function stopSpeaking(): boolean {
  const synth = voice()
  if (pending) {
    clearTimeout(pending)
    pending = null
  }
  if (!synth) {
    ended()
    return false
  }
  try {
    const busy = synth.speaking || synth.pending
    if (busy) synth.cancel()
    held = []
    ended()
    return busy
  } catch {
    return false
  }
}
