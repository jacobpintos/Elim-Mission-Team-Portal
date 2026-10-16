/**
 * "That's not what I meant", said or typed after one of Miriam's own answers
 * (src/features/miriam/useMiriamConversation): the request is asked again,
 * of Claude, with what she said (functions/src/miriam/askMiriam: correct).
 * Only the whole of what is said, so "no", "not now" or a song called "No
 * Longer Slaves" are never taken for it.
 */

/** Sent for a tap on "Not what I meant", as if said. */
export const NOT_MEANT_TAP = 'That’s not what I meant.'

const LEAD = String.raw`(?:(?:no|nope|sorry|wait|actually|hmm|um|uh)[\s,.!]+)*`
const BARE = [
  String.raw`(?:that'?s|that\s+is|that\s+was|it'?s|its)?\s*not\s+what\s+i\s+(?:meant|asked(?:\s+for)?|wanted|said|was\s+asking(?:\s+(?:for|about))?|was\s+looking\s+for)`,
  String.raw`(?:that'?s\s+)?(?:the\s+)?wrong(?:\s+(?:answer|one|event|thing))?`,
  String.raw`(?:that'?s\s+)?(?:not\s+right|incorrect|not\s+it)`,
  String.raw`you\s+(?:misunderstood|misheard)(?:\s+me)?`,
  String.raw`you\s+got\s+(?:it|that)\s+wrong`,
  String.raw`i\s+didn'?t\s+(?:mean|ask(?:\s+for)?)\s+that`,
].join('|')
/** "That's not what I meant." */
const SAID_BARE = new RegExp(`^${LEAD}(?:${BARE})[\\s.!?]*$`, 'i')
/** "No, I meant the dress code", "that's wrong — I was asking about the time". */
const SAID_AGAIN = new RegExp(
  `^(?:${LEAD}(?:${BARE})[\\s,.;:!?—–-]+|(?:no|nope|actually)[\\s,.!]+)(?:i\\s+meant|i\\s+was\\s+asking\\s+(?:about|for)|i\\s+wanted)\\s+\\S`,
  'i'
)

/**
 * Whether this says her answer wasn't what was meant: plainly ('bare'), or
 * with what was meant ('restated', sent as said); null when it doesn't.
 */
export function notMeantSaid(text: string): 'bare' | 'restated' | null {
  const t = text.replace(/[’‘]/g, "'").trim()
  if (SAID_BARE.test(t)) return 'bare'
  if (SAID_AGAIN.test(t)) return 'restated'
  return null
}
