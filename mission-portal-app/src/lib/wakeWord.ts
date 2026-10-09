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
