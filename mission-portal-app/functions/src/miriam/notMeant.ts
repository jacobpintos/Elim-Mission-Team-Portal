/**
 * "That's not what I meant", plainly — sent by the app for a tap on the link
 * under one of Miriam's own answers, or when it is said with nothing more
 * (src/lib/miriamNotMeant). Anything else sent with a correction says what
 * they did mean (./askMiriam: correct).
 */
export const NOT_MEANT_TAP = 'That’s not what I meant.'

/** What a correction says they did mean: "no, I meant the one on Ingersoll" → "the one on Ingersoll". */
export function meantInstead(said: string): string {
  if (said === NOT_MEANT_TAP) return ''
  const m = said.match(/\bi\s+(?:meant?|was\s+asking\s+(?:about|for)|wanted)\s+(.+)$/i)
  return (m ? m[1] : '').trim()
}
