import { mixerPlain } from '@/lib/mixer/asked'

/**
 * What a Video Operator asks of the video switcher, in words: "camera 2",
 * "cut to the wide shot", "preview the pulpit cam", "take it", "dissolve to
 * camera 3", "fade to black", "what's live?". Only the shape is read here.
 * Which input is meant is found among the switcher's own names (./plan).
 */
export type SwitcherAsk =
  /** That input live now: a cut. */
  | { kind: 'cut'; input: string; strong: boolean }
  /** That input on preview, then the switcher's transition. */
  | { kind: 'dissolve'; input: string }
  | { kind: 'preview'; input: string }
  /** What's on preview, taken live. */
  | { kind: 'take'; how: 'cut' | 'auto' }
  | { kind: 'black' }
  | { kind: 'unblack' }
  | { kind: 'which' }

/** Plainly for the switcher; otherwise, only if what it names is an input on it. */
export function plainlyTheSwitcher(ask: SwitcherAsk): boolean {
  if (ask.kind === 'take') return false
  if (ask.kind !== 'cut') return true
  return ask.strong || CAMERA_WORDS.test(ask.input)
}

const CAMERA_WORDS = /\b(?:camera|cam|cams|input|shot|angle|wide|close\s*up|closeup|tight)\b/

/** Never the switcher: the app's own screens and Miriam's other work. */
const NOT_THE_SWITCHER =
  /\b(?:notifications?|alerts?|chats?|messages?|conversations?|texts?|emails?|reminders?|tasks?|events?|calendar|schedule|settings|profile|announcements?|page|screen|songs?|chords?|sheets?|set\s*lists?|lyrics|directions|map|weather|briefing|my)\b/

const FILLER =
  /^(?:(?:hey\s+)?miriam\s+)?(?:(?:please|can\s+you|could\s+you|would\s+you|will\s+you|go\s+ahead\s+and|let'?s)\s+)*|\s+(?:please|for\s+me|now|right\s+now|thanks|thank\s+you)$/g

const NUMBER_WORDS: Record<string, string> = {
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
}

/** The input as said: "the wide shot", "camera 2" ("camera two", "cam 2"). */
function inputSaid(s: string): string {
  return s
    .replace(/^(?:over\s+)?(?:to\s+)?(?:the\s+)?/, '')
    .replace(/\s+(?:live|now|on\s+(?:program|air|the\s+stream|screen))$/, '')
    .replace(/\b(one|two|three|four|five|six|seven|eight)\b/g, (w) => NUMBER_WORDS[w])
    .replace(/^(?:camera|cam)\s*#?\s*(\d)/, 'camera $1')
    .trim()
}

/** What was asked of the switcher, by its shape — or null when it isn't a switcher request. */
export function switcherAsked(said: string): SwitcherAsk | null {
  const s = mixerPlain(said).replace(FILLER, '').trim()
  if (!s) return null

  if (
    /^(?:what|which)(?:'s|\s+is|\s+camera\s+is|\s+one\s+is|\s+input\s+is)\s+(?:live|on\s+(?:air|program|preview|the\s+stream|screen))\b/.test(
      s
    )
  ) {
    return { kind: 'which' }
  }
  if (/^what\s+(?:camera|input)\s+are\s+we\s+on$/.test(s)) return { kind: 'which' }
  if (
    /^(?:fade|go|cut)\s+(?:the\s+(?:program|stream)\s+)?(?:to\s+)?black$|^fade\s+(?:it\s+)?out$/.test(
      s
    )
  ) {
    return { kind: 'black' }
  }
  if (
    /^(?:fade|come|bring\s+it)\s+(?:back\s+)?(?:up|in)(?:\s+from\s+black)?$|^(?:come|fade)\s+back(?:\s+from\s+black)?$|^unblack$|^out\s+of\s+black$/.test(
      s
    )
  ) {
    return { kind: 'unblack' }
  }
  if (
    /^(?:take(?:\s+it)?(?:\s+live)?|go(?:\s+live)?|cut(?:\s+it)?|punch(?:\s+it)?(?:\s+in)?)$/.test(
      s
    )
  ) {
    return { kind: 'take', how: 'cut' }
  }
  if (
    /^(?:auto(?:\s+transition)?|transition|dissolve|mix|fade\s+it(?:\s+in)?|take\s+it\s+slow(?:ly)?)$/.test(
      s
    )
  ) {
    return { kind: 'take', how: 'auto' }
  }
  if (NOT_THE_SWITCHER.test(s)) return null

  let m: RegExpExecArray | null
  if ((m = /^(?:put|set|get|cue|queue)\s+(?:up\s+)?(.+?)\s+(?:on|in|to|into)\s+preview$/.exec(s))) {
    return { kind: 'preview', input: inputSaid(m[1]) }
  }
  if (
    (m =
      /^(?:preview|ready|set\s+up|cue(?:\s+up)?|queue(?:\s+up)?|get\s+ready)\s+(.+?)(?:\s+(?:on|in)\s+preview)?$/.exec(
        s
      ))
  ) {
    return { kind: 'preview', input: inputSaid(m[1]) }
  }
  if ((m = /^(.+?)\s+(?:on|in|to)\s+preview$/.exec(s)))
    return { kind: 'preview', input: inputSaid(m[1]) }
  if ((m = /^(?:dissolve|mix|fade|transition|crossfade)\s+(?:over\s+)?to\s+(.+)$/.exec(s))) {
    return { kind: 'dissolve', input: inputSaid(m[1]) }
  }
  if ((m = /^(?:cut|switch|punch)\s+(?:over\s+)?(?:to\s+)?(.+)$/.exec(s))) {
    return { kind: 'cut', input: inputSaid(m[1]), strong: true }
  }
  if (
    (m =
      /^(?:go|change|take|jump|move|bring\s+up|put\s+up|show|give\s+me)\s+(?:over\s+)?(?:to\s+)?(.+)$/.exec(
        s
      ))
  ) {
    return { kind: 'cut', input: inputSaid(m[1]), strong: false }
  }
  if ((m = /^(?:put|bring)\s+(.+?)\s+(?:up|on|live)$/.exec(s))) {
    return { kind: 'cut', input: inputSaid(m[1]), strong: false }
  }
  // "Camera 2", "cam two": that camera, live.
  if ((m = /^(?:camera|cam)\s*#?\s*(\d|one|two|three|four|five|six|seven|eight)$/.exec(s))) {
    return { kind: 'cut', input: inputSaid(`camera ${m[1]}`), strong: true }
  }
  return null
}
