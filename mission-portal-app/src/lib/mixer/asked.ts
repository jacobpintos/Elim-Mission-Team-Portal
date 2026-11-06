/**
 * What a Sound Engineer asks of the sound desk, in words: "mute Mitch EG",
 * "Mitch EG down 10% in the house", "more bass in Mia's ears". Only the shape
 * is read here. Which channel and which in-ear mix they mean is found among
 * the desk's own names (./desk).
 */

/** Where a change is heard. */
export type MixPlace =
  | { kind: 'house' }
  /** Someone's in-ears: a name as said, or 'me'. */
  | { kind: 'ears'; who: string }
  | { kind: 'stream' }

/** How much: a share of the fader's travel, dB, or a step ("a little", "a lot", or none said). */
export type MixAmount =
  | { unit: '%'; amount: number }
  | { unit: 'dB'; amount: number }
  | { unit: 'step'; size: 'little' | 'some' | 'lot' }

export type MixerAsk =
  /** `place` null: the channel's own mute button, everywhere. */
  | { kind: 'mute'; mute: boolean; channel: string; place: MixPlace | null }
  /** `place` null: none said, so the house. */
  | { kind: 'level'; up: boolean; channel: string; place: MixPlace | null; by: MixAmount }

/**
 * Lowercased and without punctuation, as Miriam reads replies (lib/miriamReplies:
 * plain), but keeping a decimal point: "1.5 dB".
 */
export function mixerPlain(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[“”"]/g, '')
    .replace(/(\d)\.(\d)/g, '$1\u0000$2')
    .replace(/[.?!,;:]+/g, ' ')
    .replace(/\u0000/g, '.')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Said plainly to the desk: somewhere named, or a dB or % amount. A plain "mute X" may be a chat. */
export const plainlyTheDesk = (ask: MixerAsk) =>
  ask.place !== null || (ask.kind === 'level' && ask.by.unit !== 'step')

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  fifteen: 15,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
}
const NUMBER = `(\\d+(?:\\.\\d+)?|${Object.keys(NUMBER_WORDS).join('|')})`
const numberOf = (s: string) => NUMBER_WORDS[s] ?? Number(s)

const PERCENT = new RegExp(`\\b(?:by\\s+)?${NUMBER}\\s*(?:%|percent\\b|per\\s*cent\\b)`)
const DB = new RegExp(`\\b(?:by\\s+)?${NUMBER}\\s*(?:db|decibels?|d\\s?b)\\b`)
const LITTLE = /\b(?:just\s+)?(?:a\s+(?:little(?:\s+bit)?|bit|touch|tad|hair|smidge)|slightly)\b/
const LOT = /\b(?:a\s+lot|a\s+bunch|way)\b/

const TO = String.raw`(?:in|on|to|from|for|out\s+of|into)`
const STREAM = new RegExp(`\\b${TO}\\s+(?:the\\s+)?(?:live\\s*stream|stream|broadcast)\\b`)
const HOUSE = new RegExp(
  `\\b${TO}\\s+(?:the\\s+)?(?:house|mains?|main\\s+(?:mix|speakers)|speakers|pa|room|sanctuary|front\\s+of\\s+house|foh)\\b|\\bout\\s+front\\b`
)
const EAR_WORDS = String.raw`(?:in[\s-]?ears?|ears?|iems?|in[\s-]?ear\s+mix|monitors?|monitor\s+mix|mix|wedges?|pack)`
const EARS = new RegExp(
  `\\b${TO}\\s+(?:the\\s+)?(my|[\\p{L}][\\p{L}.-]*(?:\\s+[\\p{L}][\\p{L}.-]*)?)(?:'s|s')?\\s+${EAR_WORDS}\\b`,
  'u'
)
/** Not people, whatever comes before "mix". */
const NOT_PEOPLE = /^(?:house|main|mains|stream|room|the|a|monitor|front)$/

/** Words around a request that aren't part of it. */
const FILLER =
  /^(?:(?:hey\s+)?miriam\s+)?(?:(?:please|can\s+you|could\s+you|would\s+you|will\s+you|go\s+ahead\s+and|i\s+need\s+you\s+to|i\s+want\s+you\s+to)\s+)*|\s+(?:please|for\s+me|now|right\s+now|thanks|thank\s+you)$/g

/** Never the desk: what the notification switch and messages answer to. */
const NOT_THE_DESK =
  /\b(?:notifications?|alerts?|chats?|messages?|conversations?|texts?|texting|emails?|reminders?|group\s+chat|thread|calls?|phone)\b/

/** "Mitch EG channel", "channel Mitch EG", "the bass": the channel as named. */
function channelSaid(s: string): string {
  return s
    .replace(/^(?:the|of\s+the|of)\s+/, '')
    .replace(/\s+channel$/, '')
    .replace(/^(?:channel|ch)\s+(?=\D)/, '')
    .replace(/\s+(?:a\s+little|a\s+bit|a\s+lot)$/, '')
    .trim()
}

/** What was asked of the desk, by its shape — or null when it isn't a desk request. */
export function mixerAsked(said: string): MixerAsk | null {
  let s = mixerPlain(said).replace(FILLER, '').trim()
  if (!s || NOT_THE_DESK.test(s)) return null

  // Where: the stream, the house, or someone's in-ears.
  let place: MixPlace | null = null
  const take = (re: RegExp) => {
    const m = re.exec(s)
    if (m)
      s = `${s.slice(0, m.index)} ${s.slice(m.index + m[0].length)}`.replace(/\s+/g, ' ').trim()
    return m
  }
  if (take(STREAM)) place = { kind: 'stream' }
  else if (take(HOUSE)) place = { kind: 'house' }
  else {
    const m = EARS.exec(s)
    const who = m?.[1].trim()
    if (m && who && !NOT_PEOPLE.test(who)) {
      take(EARS)
      place = { kind: 'ears', who: who === 'my' ? 'me' : who }
    }
  }

  // How much.
  let by: MixAmount = { unit: 'step', size: 'some' }
  let m: RegExpExecArray | null
  if ((m = take(PERCENT))) by = { unit: '%', amount: numberOf(m[1]) }
  else if ((m = take(DB))) by = { unit: 'dB', amount: numberOf(m[1]) }
  else if (take(LITTLE)) by = { unit: 'step', size: 'little' }
  else if (take(LOT)) by = { unit: 'step', size: 'lot' }
  s = s.replace(FILLER, '').trim()

  const mute = /^(un)?mute\s+(.+)$/.exec(s) ?? /^(.+?)\s+(un)?mute$/.exec(s)
  if (mute) {
    const [channel, un] = /^(un)?mute\s/.test(s) ? [mute[2], mute[1]] : [mute[1], mute[2]]
    return { kind: 'mute', mute: !un, channel: channelSaid(channel), place }
  }
  // "Turn off Mitch EG", "turn Mitch EG back on": its mute button.
  const onOff = /^turn\s+(on|off)\s+(.+)$/.exec(s)
  const backOn = /^turn\s+(.+?)\s+(?:back\s+)?(on|off)$/.exec(s)
  if (onOff)
    return { kind: 'mute', mute: onOff[1] === 'off', channel: channelSaid(onOff[2]), place }
  if (backOn)
    return { kind: 'mute', mute: backOn[2] === 'off', channel: channelSaid(backOn[1]), place }

  // "Take Mitch EG out of the house", "pull the keys from Mia's ears": muted there.
  const out = place && /^(?:take|pull|remove|get|drop|cut)\s+(.+)$/.exec(s)
  if (out && place) return { kind: 'mute', mute: true, channel: channelSaid(out[1]), place }
  // "Put Mitch EG back in the house": unmuted there.
  const back = place && /^(?:put|bring|add)\s+(.+?)\s+back$/.exec(s)
  if (back && place) return { kind: 'mute', mute: false, channel: channelSaid(back[1]), place }

  const level = (up: boolean, channel: string): MixerAsk | null => {
    const c = channelSaid(channel)
    return c ? { kind: 'level', up, channel: c, place, by } : null
  }
  const UP = /^(?:up|louder|higher)$/
  let l: RegExpExecArray | null
  if ((l = /^(?:turn|bring|push|pull|take|put)\s+(up|down)\s+(.+)$/.exec(s)))
    return level(l[1] === 'up', l[2])
  if ((l = /^(?:turn|bring|push|pull|take|put)\s+(.+?)\s+(up|down)$/.exec(s)))
    return level(l[2] === 'up', l[1])
  if ((l = /^(raise|increase|boost|lower|decrease|reduce|drop|cut)\s+(.+)$/.exec(s))) {
    return level(/^(?:raise|increase|boost)$/.test(l[1]), l[2])
  }
  if ((l = /^(more|less)\s+(.+)$/.exec(s))) return level(l[1] === 'more', l[2])
  if ((l = /^(?:make|get)\s+(.+?)\s+(louder|quieter|softer|lower|higher)$/.exec(s))) {
    return level(UP.test(l[2]), l[1])
  }
  if ((l = /^(.+?)\s+(up|down|louder|quieter|softer)$/.exec(s))) return level(UP.test(l[2]), l[1])
  return null
}
