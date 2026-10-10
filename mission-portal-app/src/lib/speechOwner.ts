/**
 * Which part of the app the phone's speech recognition is working for.
 *
 * There is one recogniser, and every listener to its events hears every
 * result — so a sentence dictated into a note would also reach the song
 * finder on the same tab, which might open a chord sheet with it. Whoever
 * starts listening claims it here, and each listener acts only on results
 * while it holds the claim.
 *
 * One listener waits in the background rather than being asked for:
 * Miriam's wake word. It gives the microphone up to anyone who asks, through
 * `withSpeech` — stopped first, and only then the other started, as its
 * stopping is reported a moment later, and would otherwise reach the new
 * owner as the end of its own listening. So a background listener lets go
 * only on the last thing reported, its end.
 */
let owner: string | null = null
/** How to stop the owner, when it is one that gives way. */
let giveWay: (() => void) | null = null
/** Who is waiting for it to have stopped. */
let waiting: (() => void) | null = null

export function claimSpeech(id: string): void {
  owner = id
  giveWay = null
}

/** Claim it as a background listener, stopped with `stop` when wanted. */
export function claimSpeechInBackground(id: string, stop: () => void): void {
  owner = id
  giveWay = stop
}

export function ownsSpeech(id: string): boolean {
  return owner === id
}

/** Let go of it — only if still held, so a newer claim is not undone. */
export function releaseSpeech(id: string): void {
  if (owner !== id) return
  owner = null
  giveWay = null
  const next = waiting
  waiting = null
  // On the next turn: the event that brought this release may still be on
  // its way to other listeners, and must not reach the next owner as its own.
  if (next) setTimeout(next, 0)
}

/** Whether nobody is listening: the microphone can be taken without cutting anyone off. */
export function speechFree(): boolean {
  return owner === null
}

/** Whether it can be had without cutting off anyone asked for: free, or the wake word's. */
export function speechTakeable(): boolean {
  return owner === null || giveWay !== null
}

/** How long to wait for a background listener to report it has stopped. */
const GIVE_WAY_MS = 800

/**
 * Claim it and start listening: at once, or — when the wake word has it —
 * as soon as the wake word has stopped.
 */
export function withSpeech(id: string, start: () => void): void {
  take(id, start, () => claimSpeech(id))
}

/**
 * The same, as a background listener — stopped with `stop` when anyone else
 * asks for it — taking it from another background listener if one has it.
 */
export function withSpeechInBackground(id: string, stop: () => void, start: () => void): void {
  take(id, start, () => claimSpeechInBackground(id, stop))
}

function take(id: string, start: () => void, claim: () => void): void {
  if (owner && owner !== id && giveWay) {
    const stop = giveWay
    const was = owner
    let started = false
    const go = () => {
      if (started) return
      started = true
      if (owner === was) owner = null
      claim()
      start()
    }
    waiting = go
    setTimeout(go, GIVE_WAY_MS)
    stop()
    return
  }
  claim()
  start()
}
