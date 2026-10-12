/**
 * Her name, at the start of a request.
 *
 * "Hey Miriam" is heard by the wake word engine (lib/wakeEngine); what comes
 * after it is heard by speech recognition, started the moment she is woken.
 * Said in one breath — "Hey Miriam, create an event" — the recogniser can
 * catch the tail of her name as it starts, and write it as however it sounds
 * to it: Mariam, Merriam, Myriam. That is not part of the request.
 */
const GREETING = String.raw`(?:hey|hay|hi|okay|ok|a)`
const NAME = String.raw`(?:miriam|mariam|merriam|meriam|myriam|mirriam|miriem|mirium|marium|meriem)`
const LEADING = new RegExp(
  String.raw`^\s*(?:${GREETING}[\s,.!-]+)?${NAME}(?:'s)?\b[\s,.!?:;-]*`,
  'i'
)

/** The request without her name before it: "Miriam, create an event" → "create an event". */
export function withoutHerName(text: string): string {
  return text.replace(LEADING, '').trim()
}

/** Whether her name was said at the start of it: "Hey Miriam, stop listening". */
export function namesHer(text: string): boolean {
  return LEADING.test(text)
}

const STOP = String.raw`(?:stop|stops|stopped|top|stock|shop|stab|stomp|drop|quit|end)`
const LISTENING = String.raw`(?:listening|listen|listenin|listen in|lessening|lessoning|glistening|listing|lissening|lisening|whistling)`
const OFF = String.raw`(?:turn|switch|shut|shot)`
const HER = String.raw`(?:(?:hey|hay|hi|a)\s+)?${NAME}`
const WAKE = String.raw`(?:${HER}|(?:the\s+)?wake\s*word|listening|listen)`
const STOP_LISTENING = new RegExp(
  String.raw`^(?:please\s+)?(?:(?:can|could|would)\s+you\s+)?(?:` +
    // "stop listening", heard as "stop lessening", "top listening"…
    String.raw`${STOP}\s+${LISTENING}` +
    // "turn off Hey Miriam", "switch off the wake word", "turn Hey Miriam off"
    String.raw`|${OFF}\s+off\s+${WAKE}|${OFF}\s+${WAKE}\s+off` +
    String.raw`|(?:disable|deactivate)\s+${WAKE}` +
    String.raw`)(?:\s+(?:for\s+(?:${HER}|me|now|a while|today)|to\s+me|now|please|for\s+now))*$`,
  'i'
)

/**
 * "Stop listening" — and how it is often heard — as said after her name:
 * "Hey Miriam" switched off on this device. Only ever acted on with her name
 * said (or her woken by it): "stop listening" sung, or said to someone else,
 * is not for her.
 */
export function stopListeningAsked(text: string): boolean {
  const said = text
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[.,!?]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return STOP_LISTENING.test(said)
}
