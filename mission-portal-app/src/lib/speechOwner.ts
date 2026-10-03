/**
 * Which part of the app the phone's speech recognition is working for.
 *
 * There is one recogniser, and every listener to its events hears every
 * result — so a sentence dictated into a note would also reach the song
 * finder on the same tab, which might open a chord sheet with it. Whoever
 * starts listening claims it here, and each listener acts only on results
 * while it holds the claim.
 */
let owner: string | null = null

export function claimSpeech(id: string): void {
  owner = id
}

export function ownsSpeech(id: string): boolean {
  return owner === id
}

/** Let go of it — only if still held, so a newer claim is not undone. */
export function releaseSpeech(id: string): void {
  if (owner === id) owner = null
}
