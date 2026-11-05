/**
 * The texting list asked about — "add me to the texting list", "how do I
 * get the texts?", "unsubscribe me from the texts", "am I on the texting
 * list?" — worked out on the device (features/miriam/localTalk).
 *
 * Not the Connections Coordinator's own notification of who asked to join:
 * "turn off texting list notifications" is a notification switch.
 */
export type TextingAsk = 'join' | 'how' | 'stop' | 'status'

/** Texts, the texting list, text messages: what the list is called. */
const LIST = String.raw`(?:(?:the\s+|your\s+|our\s+|church\s+)?(?:texting|text|sms)(?:\s+message)?\s+(?:list|alerts?|reminders?|updates?)|(?:the\s+)?(?:texts|text\s+messages|sms(?:\s+messages)?|church\s+texts|reminder\s+texts|group\s+texts))`

const JOIN = new RegExp(
  String.raw`^(?:(?:please|can\s+you|could\s+you|i\s+want\s+to|i'd\s+like\s+to|i\s+would\s+like\s+to|i\s+wanna)\s+)*` +
    String.raw`(?:(?:add|put|sign)\s+me\s+(?:up\s+)?(?:to|on|for|onto)\s+${LIST}|(?:join|get\s+on|be\s+on|be\s+added\s+to|subscribe\s+to|sign\s+up\s+(?:for|to))\s+${LIST}|(?:get|receive)\s+${LIST}|subscribe\s+me\s+(?:to\s+)?${LIST})\b`,
  'i'
)
const HOW = new RegExp(
  String.raw`^(?:how\s+(?:do|can|would)\s+i|where\s+(?:do|can)\s+i|is\s+there\s+a\s+way\s+(?:for\s+me\s+)?to|can\s+i)\s+` +
    String.raw`(?:get\s+(?:added\s+to|on)|join|sign\s+up\s+(?:for|to)|subscribe\s+to|get|be\s+(?:added\s+to|on))\s+${LIST}`,
  'i'
)
const STOP = new RegExp(
  String.raw`(?:^(?:please\s+)?(?:unsubscribe|opt\s+out|remove\s+me|take\s+me\s+off|get\s+me\s+off|stop\s+(?:sending\s+me|texting\s+me))\b|` +
    String.raw`^(?:how\s+(?:do|can)\s+i|can\s+i|i\s+want\s+to|i'd\s+like\s+to)\s+(?:unsubscribe|opt\s+out|stop|get\s+off|be\s+(?:removed|taken\s+off)|leave)\b|` +
    String.raw`^(?:please\s+)?stop\s+(?:the\s+)?(?:texts|text\s+messages|texting)\b|` +
    String.raw`^i\s+(?:don't|do\s+not)\s+want\s+(?:the\s+|any\s+more\s+|anymore\s+)?(?:texts|text\s+messages)\b)`,
  'i'
)
const STATUS = new RegExp(
  String.raw`^(?:am\s+i|i'm|was\s+i)\s+(?:on|signed\s+up\s+for|in|added\s+to)\s+${LIST}`,
  'i'
)

/** What about the texting list was asked, if it was. */
export function textingAsked(said: string): TextingAsk | null {
  const s = said
    .replace(/[’‘]/g, "'")
    .replace(/[.?!,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(?:(?:hey|hi|ok|okay|so|um+|uh+|miriam|please)\s+)+/i, '')
  // The coordinator's notification of sign-ups is a switch, not the list.
  if (/\bnotifications?\b/i.test(s)) return null
  const aboutTexts = new RegExp(LIST, 'i').test(s)
  if (!aboutTexts) return null
  if (STATUS.test(s)) return 'status'
  if (HOW.test(s)) return 'how'
  if (STOP.test(s)) return 'stop'
  if (JOIN.test(s)) return 'join'
  return null
}
